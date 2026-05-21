import "../env";

import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { merchants, recoveries } from "../db/schema";
import { initiateRecoveryCall } from "./calls";
import { broadcastRecoveryEvent } from "../lib/broadcast";

type MerchantRow = typeof merchants.$inferSelect;

const BATCH_SIZE = 10;
const DEFAULT_TZ = "America/New_York";
const DEFAULT_START = 9;
const DEFAULT_END = 18;

// Returns the hour (0..23) currently observed in the given IANA tz.
function currentHourInTz(tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  });
  const raw = fmt.format(new Date());
  // Intl returns "0" .. "23" — but on some locales "24" for midnight. Normalize.
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n % 24 : 0;
}

function isInWorkingHours(merchant: MerchantRow): boolean {
  const tz = merchant.timezone ?? DEFAULT_TZ;
  const start = merchant.workingHoursStart ?? DEFAULT_START;
  const end = merchant.workingHoursEnd ?? DEFAULT_END;
  const hour = currentHourInTz(tz);
  return hour >= start && hour < end;
}

// Pragmatic next-start computation. Doesn't account for DST transitions
// happening between now and start — close enough for V1.
function nextWorkingHourStart(merchant: MerchantRow): Date {
  const tz = merchant.timezone ?? DEFAULT_TZ;
  const start = merchant.workingHoursStart ?? DEFAULT_START;
  const end = merchant.workingHoursEnd ?? DEFAULT_END;
  const nowHour = currentHourInTz(tz);
  let hoursToAdd: number;
  if (nowHour < start) {
    hoursToAdd = start - nowHour;
  } else if (nowHour >= end) {
    hoursToAdd = 24 - nowHour + start;
  } else {
    hoursToAdd = 0; // already in hours; shouldn't reach here from caller
  }
  return new Date(Date.now() + hoursToAdd * 60 * 60_000);
}

let inFlight: Promise<void> | null = null;

export function triggerScheduler(): void {
  // Fire-and-forget. Use queueMicrotask so the caller (e.g. webhook handler)
  // returns 200 to Stripe before the scheduler does any DB work.
  queueMicrotask(() => {
    void runScheduler().catch((err) => {
      console.error("[scheduler] run error:", err);
    });
  });
}

export async function runScheduler(): Promise<void> {
  // Coalesce overlapping runs — both webhook fires and the 30s tick may
  // trigger at once. Only one batch in flight at a time.
  if (inFlight) {
    return inFlight;
  }
  const run = doRun().finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function doRun(): Promise<void> {
  // Pull a batch of work eligible to run RIGHT NOW.
  // Eligibility: QUEUED OR (SCHEDULED AND scheduled_for <= now).
  const batch = await db
    .select()
    .from(recoveries)
    .where(
      or(
        eq(recoveries.state, "QUEUED"),
        and(
          eq(recoveries.state, "SCHEDULED"),
          lte(recoveries.scheduledFor, new Date()),
        ),
        and(
          eq(recoveries.state, "RETRY_QUEUED"),
          lte(recoveries.scheduledFor, new Date()),
        ),
      ),
    )
    .limit(BATCH_SIZE);

  if (batch.length === 0) return;

  for (const recovery of batch) {
    try {
      const merchant = await db.query.merchants.findFirst({
        where: eq(merchants.id, recovery.merchantId),
      });
      if (!merchant) {
        console.warn("[scheduler] orphan recovery, abandoning:", recovery.id);
        await db
          .update(recoveries)
          .set({
            state: "ABANDONED",
            finalOutcome: "unknown_failure",
            updatedAt: new Date(),
          })
          .where(eq(recoveries.id, recovery.id));
        continue;
      }

      if (!isInWorkingHours(merchant)) {
        const next = nextWorkingHourStart(merchant);
        console.log(
          "[scheduler] outside hours, deferring",
          recovery.id,
          "until",
          next.toISOString(),
        );
        await db
          .update(recoveries)
          .set({
            state: "SCHEDULED",
            scheduledFor: next,
            updatedAt: new Date(),
          })
          .where(eq(recoveries.id, recovery.id));
        broadcastRecoveryEvent(recovery.id, recovery.merchantId, {
          type: "recovery.scheduled",
          data: { recoveryId: recovery.id, at: next.getTime() },
        });
        continue;
      }

      const result = await initiateRecoveryCall(recovery.id);
      if (result.ok) {
        console.log(
          "[scheduler] initiated call",
          recovery.id,
          result.conversationId,
        );
      } else {
        console.warn(
          "[scheduler] initiate failed",
          recovery.id,
          result.reason,
          result.detail ?? "",
        );
      }
    } catch (err) {
      console.error("[scheduler] recovery failed:", recovery.id, err);
    }
  }
}

let pollHandle: ReturnType<typeof setInterval> | null = null;

export function startBackgroundPoll(intervalMs = 30_000): void {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    void runScheduler().catch((err) => {
      console.error("[scheduler] poll tick error:", err);
    });
  }, intervalMs);
  // Don't keep the event loop alive just for the poll.
  pollHandle.unref?.();
}

export function stopBackgroundPoll(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

// Re-export for external use without pulling the whole module
export { sql };
