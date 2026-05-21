# CLAUDE.md — Dunner Master PRD

> **Build context.** This document is the single source of truth for the Dunner build. Every Claude Code session re-reads this. Do not deviate from pinned versions, schema, route names, design tokens, or state names. If you find something missing, ask — do not invent.

> **Owner:** Tim (@winsznx) — solo build for ElevenLabs Hack #9 (Stripe sponsor). Submission: Thu 21 May 2026, 17:00 UTC.

---

## 0. Glossary (shared vocabulary — use these terms verbatim)

| Term                 | Meaning                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Merchant**         | A SaaS business that connects their Stripe account to Dunner. The platform's customer.                                |
| **End-customer**     | The merchant's customer whose payment failed. The person who gets called.                                             |
| **Failed invoice**   | A Stripe `invoice.payment_failed` event we've ingested for a connected merchant.                                      |
| **Recovery**         | One end-to-end attempt to recover a failed invoice via a voice call.                                                  |
| **Recovery attempt** | One single outbound call within a recovery (a recovery can have N attempts).                                          |
| **Cloned voice**     | The merchant's IVC `voice_id` returned by ElevenLabs after upload.                                                    |
| **Application fee**  | Dunner's success fee — % of recovered amount, taken via Stripe Connect `application_fee_amount` on the PaymentIntent. |

---

## 1. Product

Dunner is a B2B platform that calls a SaaS merchant's failed-payment customers in the merchant's own cloned voice, negotiates a recovery in real time using live Stripe Subscriptions API access, and earns a percentage only when the recovery succeeds. iOS-first (Expo). Production-grade from day one.

---

## 2. The ONE clever thing (north star — every decision keys off this)

**The end-customer hears the merchant's own cloned voice negotiating the recovery in real time, with live Stripe tool access.**

Not a bot. Not a generic agent. Their actual vendor. With agency to pause, swap card, downgrade, or apply a coupon mid-call.

If a decision conflicts with this north star, the north star wins.

---

## 3. Stack — pinned versions (do not deviate)

### Mobile (Expo iOS)

| Package                             | Version            | Install                                                                                                                                                                             |
| ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo`                              | **SDK 55**         | `npx create-expo-app@latest dunner-mobile --template default@sdk-55`                                                                                                                |
| `expo-router`                       | `~55.0.14`         | bundled                                                                                                                                                                             |
| `react-native-reanimated`           | `^4.3.1`           | `npx expo install react-native-reanimated react-native-worklets`                                                                                                                    |
| `react-native-worklets`             | matches reanimated | bundled with above                                                                                                                                                                  |
| `@shopify/react-native-skia`        | `^2.6.2`           | `npx expo install @shopify/react-native-skia`                                                                                                                                       |
| `react-native-gesture-handler`      | `^2.31.2`          | `npx expo install react-native-gesture-handler`                                                                                                                                     |
| `@gorhom/bottom-sheet`              | `^5.0.0`           | `npx expo install @gorhom/bottom-sheet`                                                                                                                                             |
| `nativewind`                        | `^4.2.4`           | `npm i nativewind@^4.2.4 tailwindcss`                                                                                                                                               |
| `tailwindcss`                       | `^3.4.0`           | (NativeWind 4 targets Tailwind v3, not v4)                                                                                                                                          |
| `@elevenlabs/react-native`          | `^1.2.1`           | `npx expo install @elevenlabs/react-native @livekit/react-native @livekit/react-native-webrtc @config-plugins/react-native-webrtc @livekit/react-native-expo-plugin livekit-client` |
| `@stripe/stripe-react-native`       | `^0.65.1`          | `npx expo install @stripe/stripe-react-native`                                                                                                                                      |
| `@clerk/clerk-expo`                 | latest             | `npx expo install @clerk/clerk-expo expo-secure-store`                                                                                                                              |
| `expo-web-browser`                  | `~14.x`            | `npx expo install expo-web-browser`                                                                                                                                                 |
| `expo-linking`                      | `~7.x`             | `npx expo install expo-linking`                                                                                                                                                     |
| `expo-haptics`                      | `~55.0.14`         | `npx expo install expo-haptics`                                                                                                                                                     |
| `expo-av`                           | latest             | `npx expo install expo-av`                                                                                                                                                          |
| `expo-font`                         | `~13.x`            | `npx expo install expo-font`                                                                                                                                                        |
| `@expo-google-fonts/inter`          | latest             | `npx expo install @expo-google-fonts/inter`                                                                                                                                         |
| `@expo-google-fonts/jetbrains-mono` | latest             | `npx expo install @expo-google-fonts/jetbrains-mono`                                                                                                                                |
| `@sentry/react-native`              | `^8.7.0`           | `npx expo install @sentry/react-native`                                                                                                                                             |
| `posthog-react-native`              | `^4.43.11`         | `npx expo install posthog-react-native`                                                                                                                                             |
| `react-hook-form`                   | `^7.x`             | `npm i react-hook-form`                                                                                                                                                             |
| `zod`                               | `^3.x`             | `npm i zod`                                                                                                                                                                         |

### Backend (Hono on Bun, Railway)

| Package               | Version   | Install                                     |
| --------------------- | --------- | ------------------------------------------- |
| `bun`                 | `1.3.14`  | https://bun.sh                              |
| `hono`                | `^4.12.9` | `bun add hono`                              |
| `@hono/zod-validator` | latest    | `bun add @hono/zod-validator`               |
| `stripe`              | latest    | `bun add stripe`                            |
| `drizzle-orm`         | `^0.45.2` | `bun add drizzle-orm`                       |
| `drizzle-kit`         | `^0.45.0` | `bun add -d drizzle-kit`                    |
| `pg`                  | latest    | `bun add pg @types/pg`                      |
| `@clerk/backend`      | latest    | `bun add @clerk/backend`                    |
| `@upstash/ratelimit`  | latest    | `bun add @upstash/ratelimit @upstash/redis` |
| `@sentry/node`        | `^8.x`    | `bun add @sentry/node`                      |
| `@axiomhq/logging`    | latest    | `bun add @axiomhq/logging`                  |
| `ffmpeg-static`       | latest    | `bun add ffmpeg-static` (for m4a→mp3)       |

### CRITICAL pinning notes

- **DO NOT** add `react-native-reanimated/plugin` to `babel.config.js`. `babel-preset-expo` handles it in SDK 55. Adding it manually causes silent worklet failures.
- **DO NOT** put `newArchEnabled` in `app.json` — removed in SDK 55, errors on build.
- **DO NOT** use `useHermesV1: true` then remove it. Causes prod-only "Wrong bytecode version" crash. Leave Hermes default ON, do not opt into V1 for V1 ship.
- **DO NOT** call `c.req.json()` before Stripe signature verification. Use `c.req.text()` → `constructEventAsync`.
- **DO NOT** use Expo Go. Use development builds throughout (`npx expo prebuild --clean` + EAS Build dev profile).

---

## 4. Monorepo structure (lock this layout exactly)

```
dunner/
├── apps/
│   ├── mobile/                       # Expo SDK 55
│   │   ├── src/
│   │   │   ├── app/                  # expo-router routes
│   │   │   │   ├── _layout.tsx       # Clerk provider + theme + Stack root
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── _layout.tsx
│   │   │   │   │   ├── sign-in.tsx
│   │   │   │   │   └── sign-up.tsx
│   │   │   │   ├── (onboarding)/
│   │   │   │   │   ├── _layout.tsx
│   │   │   │   │   ├── connect-stripe.tsx
│   │   │   │   │   ├── record-voice.tsx
│   │   │   │   │   └── knowledge.tsx
│   │   │   │   ├── (app)/
│   │   │   │   │   ├── _layout.tsx   # Tab bar
│   │   │   │   │   ├── (tabs)/
│   │   │   │   │   │   ├── _layout.tsx
│   │   │   │   │   │   ├── index.tsx       # Recoveries list
│   │   │   │   │   │   ├── analytics.tsx
│   │   │   │   │   │   └── settings.tsx
│   │   │   │   │   ├── recovery/[id].tsx   # Recovery detail
│   │   │   │   │   └── call/[recoveryId].tsx  # LIVE CALL HERO SCREEN
│   │   │   │   └── modal/
│   │   │   │       └── settings-detail.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/               # Primitive components
│   │   │   │   ├── recovery/         # Domain components
│   │   │   │   └── call/             # Waveform, transcript, tool-call cards
│   │   │   ├── lib/
│   │   │   │   ├── api.ts            # Hono RPC client
│   │   │   │   ├── ws.ts             # WebSocket subscriber for live call events
│   │   │   │   ├── audio.ts          # expo-av recording helpers
│   │   │   │   └── haptics.ts        # Wrapped haptic patterns
│   │   │   ├── theme/
│   │   │   │   ├── tokens.ts         # Color, typography, spacing tokens
│   │   │   │   └── animations.ts     # Reanimated configs
│   │   │   └── hooks/
│   │   ├── assets/
│   │   │   └── fonts/                # Inter + JetBrains Mono local
│   │   ├── app.json
│   │   ├── babel.config.js
│   │   ├── metro.config.js
│   │   ├── tailwind.config.js
│   │   ├── global.css
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── backend/                      # Hono on Bun
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── onboarding.ts     # Stripe Connect + IVC + knowledge base
│       │   │   ├── recoveries.ts     # List, get, manual trigger
│       │   │   ├── ws.ts             # WebSocket endpoints
│       │   │   └── stripe-actions.ts # The ElevenLabs agent calls these
│       │   ├── webhooks/
│       │   │   ├── stripe.ts         # invoice.payment_failed + others
│       │   │   └── elevenlabs.ts     # post_call_transcription etc.
│       │   ├── services/
│       │   │   ├── elevenlabs.ts     # SDK wrapper
│       │   │   ├── stripe.ts         # SDK wrapper
│       │   │   ├── recovery.ts       # State machine logic
│       │   │   └── audio.ts          # ffmpeg m4a→mp3
│       │   ├── db/
│       │   │   ├── schema.ts         # Drizzle schema
│       │   │   ├── client.ts
│       │   │   └── migrate.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts           # Clerk JWT verification
│       │   │   ├── rate-limit.ts
│       │   │   └── idempotency.ts
│       │   ├── lib/
│       │   │   └── logger.ts         # Axiom + Sentry
│       │   └── index.ts              # Hono app + server
│       ├── drizzle.config.ts
│       ├── drizzle/                  # Migration files
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── types/
│       ├── src/
│       │   ├── index.ts
│       │   ├── recovery.ts           # Shared recovery types
│       │   ├── ws-events.ts          # WS event union
│       │   └── api.ts                # Hono RPC client type re-export
│       └── package.json
├── package.json                      # workspace root
├── bunfig.toml
├── .env.example
└── README.md
```

Workspace root `package.json`:

```json
{
  "name": "dunner",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

---

## 5. Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          MERCHANT (iOS)                          │
│  Expo SDK 55 + NativeWind + Reanimated 4 + Skia + Clerk + WS    │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS / WSS
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              BACKEND (Hono on Bun, Railway)                      │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ REST API   │  │ Webhooks  │  │ WS Hub   │  │ Stripe-action│  │
│  │ (Clerk     │  │  /stripe  │  │ /ws/...  │  │ tools (called│  │
│  │  guarded)  │  │  /eleven  │  │          │  │ by EL agent) │  │
│  └────────────┘  └───────────┘  └──────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐
│ Postgres    │  │ Upstash  │  │ Stripe   │  │ ElevenLabs +    │
│ (Railway,   │  │ Redis    │  │ Connect  │  │ Twilio (number, │
│ Drizzle)    │  │ (dedup,  │  │ + Subs   │  │ outbound call,  │
│             │  │ ratelmt) │  │ + Acct   │  │ tools webhook)  │
│             │  │          │  │ Sessions │  │                 │
└─────────────┘  └──────────┘  └──────────┘  └─────────────────┘
```

### Call sequence (happy path)

```
1. Merchant's Stripe → `invoice.payment_failed` → /webhooks/stripe
2. Backend dedups (Redis NX + Postgres unique), persists FailedInvoice
3. Recovery service: schedule queue check (working hours, rate limit, retry count)
4. When ready: POST /v1/convai/twilio/outbound-call to ElevenLabs
   - agent_id, agent_phone_number_id, to_number
   - dynamic_variables: customer_name, merchant_name, plan, amount_due
   - agent_override.voice.voice_id: merchant's cloned voice
5. ElevenLabs places call via Twilio in merchant's voice
6. During call, agent reasons and may invoke tools:
   - pause_subscription, swap_payment_method, apply_coupon, downgrade_plan
   - Each tool = webhook POST to backend /stripe-actions/*
7. Tool handler:
   - Sets application_fee_amount on PaymentIntent BEFORE recovery payment
   - Calls Stripe Subscriptions/PaymentMethods API on Connected account
   - Returns success/data to agent (in <10s)
   - Broadcasts WS event to merchant's mobile app: tool_called
8. Call ends → ElevenLabs fires post_call_transcription webhook
9. Backend stores transcript, summary, outcome → broadcasts WS event: call_ended
10. End-customer eventually pays via fresh link / new PM → Stripe fires invoice.paid
11. Backend marks Recovery as RECOVERED. Fee was already captured.
```

---

## 6. State machine — recovery lifecycle

```
[QUEUED]
   │
   ├─(outside working hrs)→ [SCHEDULED] ──(time hit)──┐
   │                                                  ▼
   └────────────────────────────────────────► [READY_TO_CALL]
                                                      │
                                                      ▼
                                                  [CALLING]
                                                      │
                            ┌─────────────────────────┼──────────────────────────┐
                            ▼                         ▼                          ▼
                  [busy/no-answer]            [connected]               [unknown failure]
                            │                         │                          │
                            ▼                         ▼                          ▼
                     [RETRY_QUEUED]               [IN_CALL]                 [ABANDONED]
                            │                         │
                  ┌─────────┘                         │
                  │                                   │
              attempts<MAX                            ▼
                  │                       ┌───────────┴────────────┐
                  ▼                       │                        │
              [SCHEDULED]      [agreement+tool_called]    [no agreement / abuse]
                                          │                        │
                                          ▼                        ▼
                                  [RECOVERED_PENDING]      [FAILED_NEEDS_RETRY]
                                          │                        │
                              ┌───────────┴──────────┐         attempts<MAX
                              ▼                      ▼              │
                       [invoice.paid]      [invoice.payment_failed]  ▼
                              │                      │          [RETRY_QUEUED]
                              ▼                      ▼              │
                        [RECOVERED]           [RETRY_QUEUED]   ───►(retry loop until ABANDONED)
                                          │
                                          ▼
                                  [CHURNED] (customer explicitly cancels — log reason)
                                          │
                                          ▼
                                  [ABUSE_TERMINATED] (end_call tool fired on hostility)
```

**Terminal states:** `RECOVERED`, `ABANDONED`, `CHURNED`, `ABUSE_TERMINATED`.
**Max attempts:** 4 (configurable per merchant; default 4).
**Retry delay:** 24h between attempts.

---

## 7. Data model (Drizzle schema)

`apps/backend/src/db/schema.ts`:

```typescript
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  pgEnum,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

export const recoveryStateEnum = pgEnum("recovery_state", [
  "QUEUED",
  "SCHEDULED",
  "READY_TO_CALL",
  "CALLING",
  "IN_CALL",
  "RECOVERED_PENDING",
  "RECOVERED",
  "RETRY_QUEUED",
  "FAILED_NEEDS_RETRY",
  "CHURNED",
  "ABUSE_TERMINATED",
  "ABANDONED",
]);

export const callOutcomeEnum = pgEnum("call_outcome", [
  "agreement_reached",
  "no_agreement",
  "customer_cancelled",
  "abusive_termination",
  "no_answer",
  "busy",
  "unknown_failure",
]);

// Merchants — top-level org
export const merchants = pgTable("merchants", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  stripeAccountId: text("stripe_account_id").unique(), // acct_xxx
  stripeAccountStatus: text("stripe_account_status"), // 'pending', 'active'
  defaultVoiceId: text("default_voice_id"), // ElevenLabs voice_id
  agentId: text("agent_id"), // ElevenLabs agent_id (per-merchant)
  agentPhoneNumberId: text("agent_phone_number_id"), // ElevenLabs phone_number_id
  applicationFeePercent: integer("application_fee_percent")
    .default(10)
    .notNull(),
  workingHoursStart: integer("working_hours_start").default(9), // 0-23 in merchant TZ
  workingHoursEnd: integer("working_hours_end").default(18),
  timezone: text("timezone").default("America/New_York"),
  maxRetryAttempts: integer("max_retry_attempts").default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Merchant users
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull(),
  email: text("email").notNull(),
  role: text("role").default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Knowledge base — uploaded by merchant for the agent
export const knowledgeBaseDocs = pgTable("knowledge_base_docs", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  elevenLabsDocId: text("eleven_labs_doc_id"), // ID returned after upload to EL KB
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One failed invoice from Stripe = one row
export const failedInvoices = pgTable("failed_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull(),
  stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  amountDue: bigint("amount_due", { mode: "number" }).notNull(), // minor units
  currency: text("currency").notNull(),
  planName: text("plan_name"),
  attemptCountStripe: integer("attempt_count_stripe").default(1),
  rawEvent: jsonb("raw_event").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One recovery per failed invoice (1:1 for now; could be 1:N later if invoice re-fails after recovery)
export const recoveries = pgTable("recoveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull(),
  failedInvoiceId: uuid("failed_invoice_id")
    .references(() => failedInvoices.id)
    .notNull(),
  state: recoveryStateEnum("state").default("QUEUED").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  scheduledFor: timestamp("scheduled_for"),
  recoveredAmount: bigint("recovered_amount", { mode: "number" }), // minor units
  applicationFeeCollected: bigint("application_fee_collected", {
    mode: "number",
  }),
  finalOutcome: callOutcomeEnum("final_outcome"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per call attempt within a recovery
export const callAttempts = pgTable("call_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  recoveryId: uuid("recovery_id")
    .references(() => recoveries.id)
    .notNull(),
  elevenLabsConversationId: text("eleven_labs_conversation_id").unique(),
  twilioCallSid: text("twilio_call_sid"),
  initiatedAt: timestamp("initiated_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  durationSecs: integer("duration_secs"),
  costUsd: text("cost_usd"), // store as string for currency precision
  outcome: callOutcomeEnum("outcome"),
  transcript:
    jsonb("transcript").$type<
      Array<{
        role: "agent" | "user";
        message: string;
        time_in_call_secs: number;
      }>
    >(),
  transcriptSummary: text("transcript_summary"),
  audioUrl: text("audio_url"), // URL to stored recording
  toolCallsFired: jsonb("tool_calls_fired")
    .$type<
      Array<{ name: string; args: Record<string, unknown>; timestamp: number }>
    >()
    .default([]),
});

// Idempotency log for Stripe webhooks
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at"),
  status: text("status").default("processing"), // 'processing' | 'processed' | 'failed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Idempotency log for ElevenLabs webhooks
export const elevenLabsWebhookEvents = pgTable("eleven_labs_webhook_events", {
  conversationId: text("conversation_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

// API keys used by the ElevenLabs agent to call back into our backend (per merchant)
export const agentApiTokens = pgTable("agent_api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull()
    .unique(),
  tokenHash: text("token_hash").notNull(), // bcrypt hash; raw token stored in ElevenLabs MCP config
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Indexes to add via migration:**

- `failed_invoices(merchant_id, created_at desc)` — recovery list query
- `recoveries(merchant_id, state, scheduled_for)` — scheduler queue scan
- `recoveries(merchant_id, created_at desc)` — recoveries list query
- `call_attempts(recovery_id, initiated_at desc)`

---

## 8. API surface (Hono routes)

All routes Clerk-guarded except `/webhooks/*` (Stripe/ElevenLabs signature verification) and `/health`.

```
GET    /health                                  → { status: 'ok' }

# Merchant onboarding
POST   /onboarding/stripe/start                 → { accountId, url }
GET    /onboarding/stripe/refresh               (Stripe redirects here on link expiry)
GET    /onboarding/stripe/status                → { complete, currentlyDue, pastDue }
POST   /onboarding/voice/upload                 (multipart, m4a) → { voice_id }
POST   /onboarding/knowledge                    → { docId }
GET    /onboarding/state                        → { connectStripe, recordVoice, knowledge }

# Recoveries
GET    /recoveries                              → Recovery[] (paginated)
GET    /recoveries/:id                          → Recovery + callAttempts
POST   /recoveries/:id/trigger                  → manually trigger (sets READY_TO_CALL)

# Agent settings
GET    /agent/config                            → { agentId, voiceId, prompt, fee%, hours, retries }
PATCH  /agent/config                            → updated config
POST   /agent/test-call                         → places a test call to provided number

# Stripe-action tools (called by ElevenLabs agent during call; bearer-token auth, NOT Clerk)
POST   /stripe-actions/pause-subscription       → { ok, status }
POST   /stripe-actions/swap-payment-method      → { ok }
POST   /stripe-actions/apply-coupon             → { ok }
POST   /stripe-actions/downgrade-plan           → { ok, new_plan }
POST   /stripe-actions/send-recovery-link       → { ok, url }
POST   /stripe-actions/log-callback             → { ok }
POST   /stripe-actions/log-churn                → { ok }

# WebSocket (Bun adapter)
GET    /ws/merchant                             → live events for current merchant
GET    /ws/call/:recoveryId                     → live events for one call

# Webhooks (no Clerk; signature-verified)
POST   /webhooks/stripe                         → Stripe events
POST   /webhooks/elevenlabs                     → ElevenLabs events
```

### WebSocket event union

`packages/types/src/ws-events.ts`:

```typescript
export type WsEvent =
  | {
      type: "recovery.queued";
      data: { recoveryId: string; failedInvoiceId: string };
    }
  | { type: "recovery.scheduled"; data: { recoveryId: string; at: number } }
  | {
      type: "call.initiated";
      data: { recoveryId: string; conversationId: string };
    }
  | {
      type: "call.failed_to_connect";
      data: { recoveryId: string; reason: "busy" | "no-answer" | "unknown" };
    }
  | { type: "call.connected"; data: { recoveryId: string } }
  | {
      type: "tool.fired";
      data: {
        recoveryId: string;
        tool: string;
        args: Record<string, unknown>;
        ts: number;
      };
    }
  | {
      type: "call.ended";
      data: {
        recoveryId: string;
        durationSecs: number;
        summary: string;
        outcome: string;
      };
    }
  | {
      type: "recovery.recovered";
      data: {
        recoveryId: string;
        amount: number;
        fee: number;
        currency: string;
      };
    }
  | { type: "recovery.failed"; data: { recoveryId: string; reason: string } };
```

---

## 9. Webhook handlers

### `/webhooks/stripe`

```typescript
import { Hono } from "hono";
import Stripe from "stripe";
import { db } from "../db/client";
import {
  stripeWebhookEvents,
  failedInvoices,
  recoveries,
  merchants,
} from "../db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const app = new Hono();

app.post("/webhooks/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.text("Missing signature", 400);

  const body = await c.req.text(); // RAW BODY — do not call .json() first
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    return c.text(`Webhook signature error: ${err}`, 400);
  }

  // Idempotency via Postgres UNIQUE constraint
  try {
    await db.insert(stripeWebhookEvents).values({
      eventId: event.id,
      eventType: event.type,
      status: "processing",
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return c.json({ received: true, duplicate: true }); // already processing or done
    }
    throw err;
  }

  try {
    switch (event.type) {
      case "invoice.payment_failed":
        await handleInvoiceFailed(
          event.data.object as Stripe.Invoice,
          event.account,
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.account,
        );
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
    }
    await db
      .update(stripeWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(stripeWebhookEvents.eventId, event.id));
  } catch (err) {
    await db
      .update(stripeWebhookEvents)
      .set({ status: "failed" })
      .where(eq(stripeWebhookEvents.eventId, event.id));
    throw err;
  }

  return c.json({ received: true });
});

async function handleInvoiceFailed(
  invoice: Stripe.Invoice,
  connectedAccountId: string | undefined,
) {
  if (!connectedAccountId) return;

  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.stripeAccountId, connectedAccountId),
  });
  if (!merchant) return; // not a Dunner merchant

  // Set application_fee_amount on the PaymentIntent BEFORE customer pays
  if (invoice.payment_intent && typeof invoice.payment_intent === "string") {
    const fee = Math.round(
      invoice.amount_due * (merchant.applicationFeePercent / 100),
    );
    try {
      await stripe.paymentIntents.update(
        invoice.payment_intent,
        { application_fee_amount: fee },
        { stripeAccount: connectedAccountId },
      );
    } catch (e) {
      // Log but do not fail — recovery still proceeds, fee logged as missed
    }
  }

  // Customer details — phone via expansion or customer retrieve
  let phone = invoice.customer_phone;
  let name = invoice.customer_name;
  if (!phone && typeof invoice.customer === "string") {
    const customer = (await stripe.customers.retrieve(invoice.customer, {
      stripeAccount: connectedAccountId,
    })) as Stripe.Customer;
    phone = customer.phone;
    name = name ?? customer.name;
  }

  const [fi] = await db
    .insert(failedInvoices)
    .values({
      merchantId: merchant.id,
      stripeInvoiceId: invoice.id,
      stripeCustomerId: invoice.customer as string,
      stripeSubscriptionId: invoice.subscription as string | null,
      stripePaymentIntentId: invoice.payment_intent as string | null,
      customerName: name,
      customerEmail: invoice.customer_email,
      customerPhone: phone,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      planName: invoice.lines?.data[0]?.description ?? null,
      attemptCountStripe: invoice.attempt_count ?? 1,
      rawEvent: invoice as any,
    })
    .onConflictDoNothing()
    .returning();

  if (!fi) return; // already ingested

  await db.insert(recoveries).values({
    merchantId: merchant.id,
    failedInvoiceId: fi.id,
    state: "QUEUED",
  });

  // Trigger recovery scheduler (separate worker or inline)
  // ...
}
```

### `/webhooks/elevenlabs`

```typescript
import { createHmac } from "node:crypto";

app.post("/webhooks/elevenlabs", async (c) => {
  const signature = c.req.header("elevenlabs-signature") ?? "";
  const rawBody = await c.req.text();
  const expected = createHmac("sha256", process.env.ELEVENLABS_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  if (`sha256=${expected}` !== signature)
    return c.json({ error: "Invalid signature" }, 401);

  const event = JSON.parse(rawBody);

  // Idempotency
  try {
    await db.insert(elevenLabsWebhookEvents).values({
      conversationId: event.data.conversation_id,
      eventType: event.type,
    });
  } catch (err: any) {
    if (err.code === "23505")
      return c.json({ received: true, duplicate: true });
    throw err;
  }

  switch (event.type) {
    case "post_call_transcription":
      await handleCallComplete(event.data);
      break;
    case "call_initiation_failure":
      await handleCallFailed(event.data);
      break;
    case "post_call_audio":
      /* store audio buffer */ break;
  }

  return c.json({ received: true });
});
```

---

## 10. ElevenLabs agent — system prompt + tools

### System prompt (per-merchant template; variables filled at agent creation time)

```
You are {{merchant_name}}'s recovery agent calling {{customer_name}} about an overdue
{{plan}} subscription ({{amount_due}} {{currency}} past due). The customer's card declined
during the most recent billing attempt.

You speak in {{merchant_name}}'s actual voice — you are not a bot, you represent them.

GOAL: Reach one of these outcomes, in order of preference:
1. Same-card recovery: customer authorizes the same card again (rare but possible)
2. New card on file: customer provides a new payment method, charge succeeds
3. Plan downgrade: keeps customer at lower tier
4. One-time recovery coupon (max 20% off this invoice)
5. Pause subscription (max 30 days) — keeps customer warm
6. Informed churn: customer explicitly cancels — log reason and end gracefully

RULES:
- Never claim to be human if asked directly. Say "I'm an AI calling on behalf of {{merchant_name}} —
  but I have full authority to make changes on their behalf."
- Confirm every agreement explicitly before calling a tool: "So we're agreed on
  [specific action] — can I go ahead and make that change now?"
- After confirming, immediately use the appropriate tool.
- Before any tool call, say a short bridging phrase like "give me one moment" — do NOT
  wait silently while the tool runs.
- Do not repeat the same offer more than twice.
- Maximum 4 turns per objection before pivoting.
- If the customer is abusive (insults, threats, explicit language) after one warning,
  use the end_call tool with reason 'abuse'.
- If asked for a human, use the log_callback tool and say "Our team will reach out within
  one business day at a time that works for you."

KNOWLEDGE: {{knowledge_base}}

You will receive:
- customer_name: {{customer_name}}
- merchant_name: {{merchant_name}}
- plan: {{plan}}
- amount_due: {{amount_due}}
- currency: {{currency}}
```

### Tools (registered on each merchant's agent)

Each tool calls back to `/stripe-actions/*` with `Authorization: Bearer {{secret__internal_api_token}}` and the merchant's API token.

1. **pause_subscription** — `behavior: 'void'|'keep_as_draft'`, `resumes_in_days: 7|30`
2. **swap_payment_method** — `payment_method_id: string` (customer was sent a Stripe Link to add; tool checks if attached)
3. **apply_coupon** — `percent_off: 5|10|15|20`, `duration: 'once'`
4. **downgrade_plan** — `target_plan_id: string` (must be in merchant's plan catalog)
5. **send_recovery_link** — sends fresh hosted invoice URL via SMS to caller
6. **log_callback** — customer wants human; capture preferred time window
7. **log_churn** — customer explicitly cancels; capture reason
8. **end_call** — built-in EL system tool; argument `reason: 'abuse' | 'completed' | 'no_agreement'`

Tool definitions go in `apps/backend/src/services/elevenlabs.ts` and are POSTed to `/v1/convai/tools` at agent provisioning time.

---

## 11. Mobile route map (Expo Router)

```
/                                  → redirects to (auth)/sign-in or (onboarding) or (app) based on state
/(auth)/sign-in                    → Clerk sign in
/(auth)/sign-up                    → Clerk sign up
/(onboarding)/connect-stripe       → Start Connect onboarding (opens WebBrowser, deeplinks back)
/(onboarding)/record-voice         → Record 60-120s IVC sample
/(onboarding)/knowledge            → Paste/upload product knowledge for agent
/(app)/(tabs)/                     → Recoveries list (default)
/(app)/(tabs)/analytics            → Aggregate stats (recovered $, success rate, MRR saved)
/(app)/(tabs)/settings             → Settings root
/(app)/recovery/[id]               → Recovery detail (post-call summary, transcript, tool calls, outcome)
/(app)/call/[recoveryId]           → LIVE CALL VIEW (waveform, transcript-as-it-happens via WS, tool call cards)
/(app)/modal/settings-detail       → Modal pushed sheets for individual settings
```

### Auth guard

Root `_layout.tsx` uses `Stack.Protected` pattern:

```tsx
import { Stack } from "expo-router";
import { useAuth, useOrganization } from "@clerk/clerk-expo";
import { useOnboardingState } from "@/hooks/useOnboardingState";

export default function RootLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const onboarding = useOnboardingState();

  if (!isLoaded) return null;
  const onboardingComplete =
    onboarding.connectStripe && onboarding.recordVoice && onboarding.knowledge;

  return (
    <Stack>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && !onboardingComplete}>
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && onboardingComplete}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
```

---

## 12. Design tokens

`apps/mobile/src/theme/tokens.ts`:

```typescript
export const colors = {
  dark: {
    bg: { base: "#0F0F11", surface: "#1A1A1E", elevated: "#242428" },
    text: { primary: "#EEEEEF", secondary: "#A0A0AB", muted: "#6C6C74" },
    accent: { recovery: "#10B981", failure: "#EF4444", neutral: "#22D3EE" },
    border: { subtle: "#2A2A2F", default: "#3A3A3F" },
  },
  light: {
    bg: { base: "#FAFAFA", surface: "#FFFFFF", elevated: "#FFFFFF" },
    text: { primary: "#0F0F11", secondary: "#52525B", muted: "#A0A0AB" },
    accent: { recovery: "#059669", failure: "#DC2626", neutral: "#0891B2" },
    border: { subtle: "#E4E4E7", default: "#D4D4D8" },
  },
};

export const typography = {
  fonts: {
    sans: "Inter_400Regular",
    sansMedium: "Inter_500Medium",
    sansSemibold: "Inter_600SemiBold",
    sansBold: "Inter_700Bold",
    mono: "JetBrainsMono_400Regular",
    monoSemibold: "JetBrainsMono_600SemiBold",
  },
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    "2xl": 24,
    "3xl": 32,
    "4xl": 48,
  },
  lineHeights: { tight: 1.1, normal: 1.4, relaxed: 1.6 },
  letterSpacing: { tight: -0.5, normal: 0, wide: 0.4 },
};

export const spacing = {
  "0.5": 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
};
export const radius = {
  none: 0,
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 28,
  full: 9999,
};

export const motion = {
  spring: {
    snappy: { damping: 22, stiffness: 280, mass: 0.8 },
    smooth: { damping: 28, stiffness: 180, mass: 1 },
    bouncy: { damping: 12, stiffness: 200, mass: 0.6 }, // use sparingly
  },
  timing: { quick: 120, base: 220, slow: 350 },
};
```

NativeWind theme extends these in `tailwind.config.js` using CSS vars.

**Type defaults:** all amounts use `mono` + `tabular-nums`. All headings ≥ 24px in `sansSemibold`. Body in `sans` 15.

**Haptics policy:** Cash App selective model.

- `notificationAsync('success')` — payment recovered
- `notificationAsync('error')` — call failed to connect, payment_intent error
- `impactAsync('medium')` — entering live call screen
- `impactAsync('light')` — tab switch (use sparingly), pull-to-refresh trigger
- NEVER fire on scroll, route push, or screen mount.

---

## 13. Screen specs

### 13.1 Sign-in / Sign-up

Clerk's `<SignIn />` / `<SignUp />` themed with custom appearance tokens. Email + Google OAuth. Brand mark top, "Welcome back" headline, social-then-email order.

### 13.2 Onboarding — Connect Stripe

- Hero: "Connect your Stripe account"
- Subhead: "Dunner only charges you when a failed payment is recovered. We use Stripe Connect to deposit the recovered amount directly to your bank, minus our success fee."
- Primary CTA: "Connect Stripe" → `WebBrowser.openAuthSessionAsync` with hosted onboarding URL
- Returns via `myapp://stripe/onboarding-return` deeplink, polls `/onboarding/stripe/status`
- States: idle | connecting | polling | connected | error
- On success: animate green checkmark, then auto-advance to `/record-voice`

### 13.3 Onboarding — Record Voice (IVC)

- Hero: "Record your voice"
- Subhead: "Dunner clones your voice so calls feel like they came from you. 60 seconds is enough."
- Center: large circular record button (Skia animated ring during recording)
- Reanimated counter for elapsed time (mono, 24px)
- Live amplitude waveform during recording (Skia, see waveform component spec below)
- After stop: playback + "Re-record" / "Use this" actions
- "Use this" → uploads `.m4a` to `/onboarding/voice/upload` → backend ffmpeg-converts → POSTs to ElevenLabs `/v1/voices/add` → stores `voice_id` on merchant
- Loading state: "Cloning your voice…" (~5-15s), then auto-advance

Recording target: 75-90 seconds (within 1-3 min IVC band).

### 13.4 Onboarding — Knowledge

- Hero: "Teach Dunner about your product"
- Plain text editor (multi-line). Suggestion chips: "Plans & pricing" / "Common objections" / "What you can't refund"
- Save: POSTs to `/onboarding/knowledge` → backend uploads to ElevenLabs Knowledge Base, attaches to agent
- "Finish setup" → routes to `(app)`

### 13.5 Recoveries list (default app screen)

- Top bar: "Recoveries" + filter chip row (All / Active / Recovered / Failed)
- Hero metric card (top): "$X,XXX recovered this month" + delta vs last month (mono numerals, `tabular-nums`)
- List rows:
  - Customer name (15px, semibold)
  - Plan + amount due (13px, secondary)
  - State badge (right-aligned): IN_CALL pulses, RECOVERED green, FAILED red, others muted
  - Reanimated `FadeInDown.delay(i*40).springify().damping(18)` on enter
- Empty state: muted waveform glyph + "No recoveries yet" + "Recoveries will appear here when your customers' payments fail"
- Pull-to-refresh

### 13.6 Recovery detail

- Top: customer name + amount + currency + state
- Timeline: call attempts as cards (initiated_at, duration, outcome, summary excerpt)
- For each call attempt: tap to expand → transcript view with role-based styling
- Tool calls section: list of tool calls fired during the call with timestamps
- Outcome banner at top if RECOVERED: green, with recovered $ + fee earned

### 13.7 LIVE CALL — `call/[recoveryId]` (HERO SCREEN)

This is the screen the video centers on. Highest polish budget.

Layout (top to bottom):

1. **Header strip** (10% height): customer name + plan + amount due (mono)
2. **Call status pill** (auto-positioned): "Calling..." → "Connected" → "Recovered" with state-colored bg
3. **Waveform canvas** (centered, ~30% height): Skia rolling waveform, accent-cyan, animated amplitudes (procedurally generated — see waveform note below). Pulses on "connected" state.
4. **Call timer** (mono, 32px, tabular-nums): MM:SS counting up
5. **Live transcript stream** (scrollable, bottom 40%):
   - Agent messages: right-aligned, soft surface bg, sans 15px
   - User messages: left-aligned, elevated bg, sans 15px
   - Auto-scrolls to bottom
   - **Note: transcript fills in 10-30s after call ends from `post_call_transcription` webhook.** During call: show animated "listening..." indicator and tool calls as they fire (via WS `tool.fired`).
6. **Tool call cards** (floating, dismiss after 4s): "💳 Switched to weekly $9", "⏸ Paused for 30 days", "🎟 Applied 20% off"
   - Slide in from right, Reanimated spring
   - Stack max 3, oldest fades
7. **End call button** (bottom, destructive style, requires long-press confirmation)

After call ends:

- Smooth transition to recovery detail with hero "$X recovered" animation
- Number ticker counts from 0 → recovered amount (use `useAnimatedProps` pattern from research)
- Haptic `notificationAsync('success')` on counter completion

**Waveform component:** see code below in §13.10.

### 13.8 Analytics

- Top: time range selector (7d / 30d / 90d)
- KPI cards: Total recovered, Recovery rate %, Avg recovery amount, Fee earned
- Sparkline (Skia path) under each KPI
- Below: outcome breakdown (pie or stacked bar via Skia)

### 13.9 Settings

- Profile row (avatar, email, role)
- Stripe Connect status card (with "Re-onboard" if past_due)
- Agent config:
  - Voice (preview button → plays 5s sample)
  - Application fee % (slider 5-25)
  - Working hours (start/end pickers + timezone)
  - Max retry attempts (1-6)
- Danger zone: Disconnect Stripe, Delete account (bottom, red text)

### 13.10 Waveform component (shared)

`apps/mobile/src/components/call/Waveform.tsx`:

```tsx
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import {
  useSharedValue,
  useDerivedValue,
  useFrameCallback,
} from "react-native-reanimated";
import { useMemo } from "react";

const BARS = 60;
const BAR_W = 3;
const BAR_GAP = 2;

interface Props {
  width: number;
  height: number;
  active: boolean; // when true, animate procedurally
  color?: string;
}

export function Waveform({ width, height, active, color = "#22D3EE" }: Props) {
  const t = useSharedValue(0);
  const seed = useMemo(
    () => Array.from({ length: BARS }, () => Math.random()),
    [],
  );

  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (active) t.value += (timeSincePreviousFrame ?? 16) / 1000;
  });

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const time = t.value;
    for (let i = 0; i < BARS; i++) {
      const base = active
        ? 0.25 + 0.55 * Math.abs(Math.sin(time * 2 + seed[i] * 6 + i * 0.18))
        : 0.08;
      const h = Math.max(4, base * height * 0.85);
      const x = (BAR_W + BAR_GAP) * i;
      const y = (height - h) / 2;
      p.addRRect(
        Skia.RRectXY(Skia.XYWHRect(x, y, BAR_W, h), BAR_W / 2, BAR_W / 2),
      );
    }
    return p;
  });

  return (
    <Canvas style={{ width, height }}>
      <Path path={path} color={color} style="fill" />
    </Canvas>
  );
}
```

---

## 14. Critical gotchas (cross-referenced from research — read before coding each area)

| Area                               | Gotcha                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo SDK 55                        | Default app dir is `/src/app`, not `/app`. Old tutorials are wrong.                                                                                                                        |
| Expo SDK 55                        | Do not include `newArchEnabled` in `app.json`. New Arch is mandatory; the key was removed.                                                                                                 |
| Hermes                             | Do NOT opt into V1 (`useHermesV1`) for V1 ship. Causes prod-only "Wrong bytecode version" crash if ever toggled off.                                                                       |
| Reanimated 4                       | Do not add `react-native-reanimated/plugin` to `babel.config.js` — `babel-preset-expo` handles it. Adding manually silently breaks worklets.                                               |
| Reanimated 4                       | Requires New Arch. SDK 55 satisfies this.                                                                                                                                                  |
| Skia 2.6.2                         | Requires RN ≥ 0.79 and React ≥ 19. SDK 55 satisfies.                                                                                                                                       |
| NativeWind                         | Use v4.2.4 targeting Tailwind v3. v5 (Tailwind v4) is pre-release — do not use.                                                                                                            |
| Stripe RN SDK                      | `ConnectAccountOnboarding` embedded component is **private preview only**. Use **hosted onboarding** (`account_links` + `WebBrowser.openAuthSessionAsync`).                                |
| Stripe Connect                     | When updating PaymentIntent fee from a webhook handler, pass `{ stripeAccount: connectedAccountId }` to the call. The platform key alone won't authorize.                                  |
| Stripe webhook body                | NEVER call `c.req.json()` before signature verification. Use `c.req.text()` → `constructEventAsync`.                                                                                       |
| Stripe customer_phone              | The `customer_phone` on Invoice is captured at finalization and may be null. Fall back to retrieving the Customer object.                                                                  |
| Stripe subscriptions               | There is NO native installment / weekly split for subscription invoices. V1 does not offer "split into weekly." Offer pause / coupon / downgrade / swap card only.                         |
| Stripe test mode                   | Use Test Clocks to trigger `invoice.payment_failed`. Card `4000 0000 0000 0341` declines after attach.                                                                                     |
| ElevenLabs IVC                     | m4a NOT in supported formats. Server-side ffmpeg conversion to MP3 128kbps+ required.                                                                                                      |
| ElevenLabs IVC                     | Audio min 1 minute, max ~3 minutes. >3 min can degrade quality.                                                                                                                            |
| ElevenLabs Conv AI LLMs            | Verify model list in dashboard at config time. Default plan: `claude-sonnet-4-5`.                                                                                                          |
| ElevenLabs outbound                | EL does NOT provision numbers. Bring Twilio. Provision number in EL dashboard with Twilio creds.                                                                                           |
| ElevenLabs webhook                 | `post_call_transcription` fires 10-30s AFTER call ends. Real-time transcript during call is not feasible via webhook — drive UI with WS `tool.fired` events during the call instead.       |
| ElevenLabs Expo SDK                | Requires development build (`npx expo prebuild --clean`). Will NOT work in Expo Go.                                                                                                        |
| ElevenLabs `response_timeout_secs` | Not publicly documented. Keep webhook handlers fast (<10s). For slow Stripe calls, respond 202 + poll pattern.                                                                             |
| Pre-tool speech                    | No public JSON config. Use system prompt instruction: "Before calling any tool, say a short bridging phrase like 'one moment'."                                                            |
| Railway WS                         | 15-minute connection cap. Implement client-side reconnect on `onclose` with exponential backoff. Recovery calls run <5 min in practice.                                                    |
| Railway IPv6                       | Environments before Oct 16 2025 are IPv6-only on private network. Set `HOSTNAME=::` on server.                                                                                             |
| Railway Postgres                   | `max_connections = 100`, postgresql.conf locked. Deploy PgBouncer via [template](https://railway.com/deploy/postgres-pgbouncer) if scaling past ~3 backend replicas.                       |
| Webhook idempotency                | Layer Redis SET NX EX (fast) + Postgres UNIQUE on event_id (durable). Use a single transaction for the business logic + idempotency log update.                                            |
| Stripe outbound idempotency        | Add `{ idempotencyKey: 'sub-update-${event.id}-${plan}' }` to every Stripe write call. Stripe stores results for 24h.                                                                      |
| iOS App Store                      | B2B platform fee via Stripe Connect application_fee = OK. Do NOT add an in-app subscription paywall for Dunner itself — that requires IAP. The fee is server-side, invisible to App Store. |
| Sentry Expo plugin                 | `@sentry/react-native/expo` has rough edges with EAS builds on SDK 54/55 (issue #6048). Test EAS pipeline early.                                                                           |
| PostHog iOS 26                     | `posthog-react-native/expo` has reported build failures on iOS 26. Monitor and pin if encountered.                                                                                         |

---

## 15. Environment variables

`.env.example`:

```bash
# Backend
DATABASE_URL=postgres://...
REDIS_URL=...                       # Railway Redis or Upstash
UPSTASH_REDIS_REST_URL=...          # if using @upstash/ratelimit
UPSTASH_REDIS_REST_TOKEN=...

CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

ELEVENLABS_API_KEY=sk_...
ELEVENLABS_WEBHOOK_SECRET=...
ELEVENLABS_DEFAULT_AGENT_ID=        # template agent; cloned per merchant
ELEVENLABS_PHONE_NUMBER_ID=         # shared Twilio number (V1) via EL dashboard

TWILIO_ACCOUNT_SID=                 # not directly used; configured in EL dashboard
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

SENTRY_DSN_BACKEND=
AXIOM_TOKEN=
AXIOM_DATASET=dunner-prod

APP_URL=https://api.dunner.app      # public backend URL
DEEPLINK_SCHEME=dunner               # myapp:// scheme for Expo

# Mobile (EXPO_PUBLIC_*)
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
EXPO_PUBLIC_API_BASE_URL=https://api.dunner.app
EXPO_PUBLIC_WS_BASE_URL=wss://api.dunner.app
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_SENTRY_DSN_MOBILE=
EXPO_PUBLIC_POSTHOG_KEY=
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

---

## 16. Deployment

### Backend (Railway)

- Service: Bun runtime auto-detected by Railpack via `bun.lockb`
- Start command: `bun run src/db/migrate.ts && bun --smol run src/index.ts`
- Health check: `GET /health` → 200
- Region: us-west (closest to Lagos via WS — verify with Tim before locking)
- Postgres add-on: Railway Postgres
- Redis: Railway Redis OR Upstash (for `@upstash/ratelimit` API)
- Sentry release tracking via `SENTRY_RELEASE` env on every deploy
- Webhooks: Stripe + ElevenLabs both point to `https://api.dunner.app/webhooks/{stripe|elevenlabs}`

### Mobile (EAS)

- Profile: `development` for dev builds (Expo Dev Client), `production` for App Store
- `eas.json`:
  ```json
  {
    "build": {
      "development": {
        "developmentClient": true,
        "distribution": "internal",
        "ios": { "simulator": false }
      },
      "production": {
        "ios": { "autoIncrement": true }
      }
    }
  }
  ```
- For the hackathon demo: dev build on Tim's iPhone is sufficient. TestFlight optional.

---

## 17. Day 0 infra validation (run BEFORE first build prompt)

Per the playbook: PRD locked → Day 0 gate → sequenced prompts. The following must pass before any build prompt runs. Run in order.

| #   | Check                                                                                                                                           | Expected                                   | Pass criteria                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| 1   | `bun --version`                                                                                                                                 | 1.3.x                                      | ≥ 1.3.0                              |
| 2   | Xcode CLT installed                                                                                                                             | `xcode-select -p` succeeds                 | path returned                        |
| 3   | `npx create-expo-app@latest --template default@sdk-55 _validate && cd _validate && npx expo prebuild --clean && cd ios && pod install && cd ..` | iOS pods install cleanly                   | no errors                            |
| 4   | Railway project created                                                                                                                         | https://railway.app/project/...            | URL exists                           |
| 5   | Railway Postgres provisioned                                                                                                                    | `DATABASE_URL` resolves                    | `psql "$DATABASE_URL" -c '\l'` works |
| 6   | Stripe test account ready                                                                                                                       | dashboard accessible                       | yes                                  |
| 7   | Stripe Connect Client ID present                                                                                                                | `ca_...` in dashboard → Settings → Connect | yes                                  |
| 8   | ElevenLabs account, Scale plan or trial                                                                                                         | dashboard accessible                       | yes                                  |
| 9   | ElevenLabs Twilio number provisioned in EL dashboard                                                                                            | `agent_phone_number_id` known              | yes                                  |
| 10  | Test IVC creation via curl from laptop                                                                                                          | `voice_id` returned                        | yes                                  |
| 11  | Test outbound call via curl: `POST /v1/convai/twilio/outbound-call` to Tim's phone                                                              | phone rings                                | yes                                  |
| 12  | Clerk app created, OAuth keys ready                                                                                                             | dashboard                                  | yes                                  |
| 13  | Stripe CLI installed (`stripe listen`)                                                                                                          | `stripe --version`                         | ≥ 1.x                                |
| 14  | Sentry project created for backend + mobile                                                                                                     | DSNs in hand                               | 2 DSNs                               |
| 15  | Domain or \*.up.railway.app stable URL for webhooks                                                                                             | public reachable                           | curl returns OK                      |

**HARD STOP:** If #10 or #11 fail (ElevenLabs core API), pivot the build immediately. These are critical-path. Everything else has a workaround.

---

## 18. Build order (sequenced — one concern per prompt to Claude Code)

Each step ends with a defined deliverable. Do not start step N+1 until step N's deliverable is in main.

1. **Skeleton** — monorepo init, workspaces, both apps boot. Deliverable: `bun run dev` (backend) and `npx expo start` (mobile) both run cleanly. Mobile shows blank Tabs.
2. **Auth + DB** — Clerk on mobile + backend, Drizzle schema applied, JWT middleware on all `/recoveries/*`, basic protected route returning user's merchant. Deliverable: sign in → see "merchant_id: xxx" on home tab.
3. **Stripe Connect hosted onboarding (mobile + backend)** — `WebBrowser.openAuthSessionAsync` flow, `account_links` create, deeplink return, status poll. Deliverable: click "Connect Stripe" → Stripe hosted page → return → status shows `complete: true`.
4. **ElevenLabs IVC** — record screen with Skia waveform recorder, `/onboarding/voice/upload` with ffmpeg conversion, voice_id stored on merchant. Deliverable: record 75s → upload → `voice_id` visible in settings.
5. **Knowledge base + ElevenLabs Agent provisioning** — `/onboarding/knowledge` + backend job to create per-merchant agent with merchant's voice + KB + tools. Deliverable: settings shows `agent_id: agent_...`.
6. **Stripe webhook `invoice.payment_failed` handler** — full path: signature verify, idempotency, persist failed_invoice + recovery, set application_fee on PaymentIntent. Deliverable: `stripe trigger invoice.payment_failed` from CLI → row in DB.
7. **Recovery scheduler + outbound call initiation** — scheduler picks up QUEUED recoveries, calls EL outbound endpoint with dynamic vars + voice override. Deliverable: real phone rings with cloned voice saying first message.
8. **Stripe-action tools (backend) + EL tool registration** — `/stripe-actions/*` endpoints + tool defs registered on agent. Deliverable: during a call, ask the agent to "pause the subscription" → subscription paused in Stripe dashboard.
9. **WebSocket hub + mobile live call screen** — WS broadcast on every state change + tool fire, mobile listens, waveform + tool cards animate. Deliverable: place test call, watch mobile screen update live.
10. **Recoveries list + detail + analytics** — list query, detail screen with transcript, analytics aggregates. Deliverable: post-call transcript appears in detail view 30s after call ends.
11. **`invoice.paid` recovery completion** — on `invoice.paid` webhook, mark RECOVERED, fee captured, push WS event. Deliverable: pay recovered invoice with test card → mobile shows "$X recovered" with ticker animation.
12. **Polish pass** — empty states, error toasts, haptics audit, Sentry/PostHog wiring, fonts loaded locally, settings screen complete.
13. **Demo prep** — seed one merchant (Tim's test account) + one "Lara" customer + one real test-clock failed invoice. Verify end-to-end with Tim's real phone.
14. **Video record + edit + post** — per Phase D screenplay (see chat history).

---

## 19. Build invariants (these must never break)

1. Stripe webhook signature verification before any DB writes.
2. Idempotency on EVERY external webhook (Stripe + ElevenLabs).
3. All Stripe writes carry an `idempotencyKey` tied to the source event.
4. `application_fee_amount` is set on PaymentIntent BEFORE the recovery payment is attempted.
5. No raw API keys ever crossed to the mobile client. Backend mediates everything except Clerk publishable + Stripe publishable.
6. Agent tool endpoints (`/stripe-actions/*`) are authenticated via per-merchant bearer token, NOT Clerk JWT.
7. Outbound calls only fire within `working_hours_start` ≤ now ≤ `working_hours_end` in `timezone`.
8. The cloned voice for a call is the calling merchant's `default_voice_id` — never a default fallback. If `default_voice_id` is missing, the recovery is held, not called.
9. Test mode and live mode webhooks come from different signing secrets. Backend reads `STRIPE_WEBHOOK_SECRET` per environment.
10. Every recovery state transition logs to Axiom with `recovery_id`, `from_state`, `to_state`, `reason`.

---

_PRD locked 19 May 2026. Update only by appending a §20+ changelog block._
