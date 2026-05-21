/**
 * Tiny IP-keyed rate limiter for public endpoints. Built on Upstash sliding
 * window so multiple Bun instances share the counter via Redis.
 *
 * Designed for endpoints where we don't have a user identity yet (waitlist,
 * sign-up). Authenticated endpoints have natural rate-limiting via Clerk's
 * own throttles + our DB transactions.
 *
 * Fails OPEN if Upstash isn't configured (dev), so local development doesn't
 * require Redis. In prod, set UPSTASH_REDIS_REST_URL + _TOKEN and the limiter
 * kicks in.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { MiddlewareHandler } from "hono";

type LimiterConfig = {
  requests: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  prefix: string;
};

const limiters = new Map<string, Ratelimit>();

function getLimiter(cfg: LimiterConfig): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const key = `${cfg.prefix}:${cfg.requests}:${cfg.window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
      prefix: cfg.prefix,
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export function rateLimit(cfg: LimiterConfig): MiddlewareHandler {
  return async (c, next) => {
    const limiter = getLimiter(cfg);
    if (!limiter) {
      await next();
      return;
    }
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const { success, limit, reset, remaining } = await limiter.limit(ip);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(reset));
    if (!success) {
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  };
}
