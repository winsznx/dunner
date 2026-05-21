# Production Dockerfile for the Dunner landing site.
#
# Reason this exists (vs Nixpacks autodetect): `railway up` from /landing
# inside a git repo uploads parent files too because Railway treats the
# git root as the tarball root. Without a Dockerfile, Railpack autodetects
# the parent's Expo package.json and tries to run `expo start` in prod —
# wrong service entirely. This Dockerfile scopes the build context to the
# landing subtree and ignores everything else.

FROM node:20-alpine AS deps
WORKDIR /app
COPY landing/package.json landing/package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY landing/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone build output if Next is configured for it, otherwise
# the full .next + node_modules. We use the full copy to stay framework-
# agnostic to next.config.ts settings.
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "run", "start"]
