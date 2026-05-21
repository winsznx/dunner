<div align="center">
  <a href="https://dunner.xyz">
    <img src="landing/public/images/logo.png" alt="Dunner" height="56" />
  </a>

  <h3>When payments fail, Dunner calls.</h3>

  <p>
    Voice-native failed-payment recovery for SaaS.
    Your cloned voice. Live Stripe actions. A fee only when it works.
  </p>

  <p>
    <a href="https://dunner.xyz">Website</a> ·
    <a href="https://x.com/dunner_app">X</a> ·
    <a href="https://www.linkedin.com/company/dunner">LinkedIn</a> ·
    <a href="https://www.instagram.com/dunner_app">Instagram</a> ·
    <a href="https://www.tiktok.com/@dunner_app">TikTok</a>
  </p>
</div>

---

## What Dunner does

A SaaS customer's card declines. Today, that customer gets a polite email, ignores it, and quietly cancels. **Studies put involuntary churn at 20–40% of total churn** — money that walked away because nobody picked up the phone.

Dunner picks up the phone. Within minutes of `invoice.payment_failed`, a real call goes out to the customer in **the founder's own cloned voice**. The agent doesn't just leave a message — it has live Stripe API access. It can pause the subscription, swap the payment method, apply a recovery coupon, downgrade the plan, or send a fresh checkout link — mid-call, in real time. It only earns a fee when the recovery succeeds.

Built on **ElevenLabs Conversational AI** for voice cloning + agent orchestration, **Stripe Connect** for the merchant relationship and the success-fee rail, and **Telnyx SIP** for telephony. Mobile-first app for the merchant; Next.js landing for the public-facing surface.

---

## Stack

| Layer        | Tech                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Hono on Bun · Drizzle ORM · Postgres · Upstash Redis · Resend                                                        |
| **Voice AI** | ElevenLabs IVC (Instant Voice Cloning) · ElevenLabs Conversational AI agents · ElevenLabs Workspace Tools            |
| **Payments** | Stripe Connect (Express) · Subscriptions · `application_fee_amount` on PaymentIntents                                |
| **Telephony**| ElevenLabs `provider: sip_trunk` → Telnyx                                                                            |
| **Mobile**   | Expo SDK 55 · Reanimated 4 · Skia · NativeWind · expo-audio · Clerk · Sentry · PostHog                               |
| **Landing**  | Next.js 16 (App Router) · Clerk · Tailwind v4 · Framer Motion                                                        |
| **Infra**    | Railway (backend + landing + Postgres + Redis) · EAS Build (mobile) · GitHub Actions                                 |

---

## Live surfaces

| Surface      | URL                          | Notes                                          |
| ------------ | ---------------------------- | ---------------------------------------------- |
| Marketing    | https://dunner.xyz           | Waitlist signup, demo video, brand             |
| Backend API  | https://api.dunner.xyz       | REST + WS, Stripe + EL webhooks                |
| Mobile (iOS) | TestFlight (private)         | Production build via EAS                       |
| Mobile (Android) | APK via waitlist invite  | `ANDROID_APK_URL` set on backend service       |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MERCHANT (Mobile)                            │
│  Expo · Clerk · NativeWind · Reanimated · Skia · expo-audio · WS     │
└──────────────────────────────────────────────────────────────────────┘
                              │ HTTPS / WSS
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  BACKEND (Hono on Bun · Railway)                     │
│  REST · Webhooks · WS hub · Stripe-action callbacks                  │
│  /me /recoveries  /webhooks/stripe   /ws/call/:id  /stripe-actions/* │
│  /agent/config    /webhooks/eleven   /ws/merchant  /onboarding/*     │
│  /waitlist        /auth/redeem-code                                  │
└──────────────────────────────────────────────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
    Postgres       Stripe          Upstash       ElevenLabs
    (Drizzle)      Connect         Redis         ConvAI + Tools
                   + Subs          (ratelimit)   + Telnyx SIP
```

### Recovery state machine

```
QUEUED → SCHEDULED → READY_TO_CALL → CALLING → IN_CALL
                                                 │
                ┌────────────────────────────────┼──────────────────────────────┐
                ▼                                ▼                              ▼
        RECOVERED_PENDING                   CHURNED                    RETRY_QUEUED ─→ (loop)
                │                                                              │
                ▼                                                              ▼
            RECOVERED                                                     ABANDONED
```

Detailed mechanics, schema, and gotchas live in [CLAUDE.md](./CLAUDE.md).

---

## Repo layout

```
dunner/
├── backend/         Hono backend (Bun, Drizzle, Stripe, ElevenLabs)
│   ├── src/
│   │   ├── routes/        public + protected REST endpoints
│   │   ├── webhooks/      Stripe + ElevenLabs signature-verified handlers
│   │   ├── services/      EL agent ops, Stripe actions, scheduler, calls
│   │   ├── middleware/    Clerk auth, admin gate, rate-limit
│   │   ├── db/            Drizzle schema + migrations
│   │   └── lib/           broadcast hub, Sentry
│   └── drizzle/           SQL migrations
├── landing/         Next.js 16 marketing site (+ internal ops dashboard)
│   ├── app/
│   │   ├── components/    hero, voice section, pricing, footer
│   │   ├── api/           early-access route (forwards to backend)
│   │   └── download/      install instructions for invited users
│   ├── lib/brand.ts       shared brand tokens (mirror of mobile design tokens)
│   └── Dockerfile         scoped Railway build
├── src/             Expo mobile app (root)
│   ├── app/               expo-router routes (auth, onboarding, app, edit)
│   ├── components/        call screen, waveform, celebration, navigation
│   └── lib/               api, ws, audio, analytics, onboardingState
├── assets/          mobile fonts + icons (1024 source from dunner1024)
├── CLAUDE.md        master PRD — pinned versions, schema, contracts, gotchas
└── README.md
```

---

## Local development

### Prerequisites

- **Bun** ≥ 1.3.14
- **Node.js** ≥ 20.9.0 (for landing)
- **pnpm** ≥ 10 (for mobile)
- **Xcode 16+** with iOS 18 simulator
- **Stripe CLI** (`stripe listen` for webhook forwarding)
- **Postgres** — Railway, Supabase, or local

### Setup

```bash
git clone https://github.com/winsznx/dunner.git
cd dunner

# Install deps per workspace
cd backend && bun install
cd ../landing && npm install
cd .. && pnpm install

# Copy env templates
cp backend/.env.example backend/.env.local
cp landing/.env.example landing/.env.local
cp .env.example          .env.local

# Fill in keys (see Environment variables below)

# Run database migrations
cd backend && bun run src/db/migrate.ts

# Start everything (separate terminals)
bun run --watch src/index.ts            # backend  → :3000
cd ../landing && npm run dev            # landing  → :3001
cd .. && pnpm expo run:ios              # mobile   → iOS sim

# Forward Stripe webhooks during dev
stripe listen --forward-to http://localhost:3000/webhooks/stripe
```

---

## Configuration

Each workspace has its own `.env.example` with the full list of required
keys and provisioning notes:

- [`backend/.env.example`](./backend/.env.example) — Postgres, Stripe,
  ElevenLabs, Clerk, Resend
- [`landing/.env.example`](./landing/.env.example) — backend URL, Clerk
- [`.env.example`](./.env.example) — mobile (Expo public keys)

Copy each to `.env.local`, fill in the values, and you're good.

---

## Security

- **Clerk JWTs** verified networkless via `verifyToken` — no Clerk hammer on every request
- **Stripe + ElevenLabs webhooks** signature-verified before any DB write
- **Webhook idempotency** via Postgres `UNIQUE` constraints on event IDs
- **Per-merchant scoping** on every authed query — no cross-tenant data exposure
- **Agent callbacks** use per-merchant bearer tokens (bcrypt-hashed), not Clerk JWT
- **`application_fee_amount` on PaymentIntent** with `{ stripeAccount }` option, set before the recovery payment attempts
- **Rate limit** (Upstash sliding window) on public `/waitlist` + `/auth/redeem-code`
- **Email enumeration suppressed** — `POST /waitlist` returns identical shape regardless of prior signup
- **Admin allowlist enforced at both edges** — Next middleware AND backend `requireAdmin`

---

## Built for ElevenLabs Hack #9

Dunner ships with deep ElevenLabs integration as the core of the product:

- **Instant Voice Cloning** to clone the merchant's voice from a 60–120s sample
- **Conversational AI agents** — per-merchant agents with custom prompts, knowledge bases, and tools
- **Workspace Tools API** — `pause_subscription`, `apply_coupon`, `downgrade_plan`, `swap_payment_method`, `send_recovery_link`, `log_callback`, `log_churn`, `end_call` — each tool calls back into our backend for live Stripe action
- **Twilio/SIP outbound** via `/v1/convai/twilio/outbound-call` with `agent_override.voice.voice_id` so each call uses the merchant's voice
- **Post-call webhooks** drive the recovery state machine — outcome routing reads `tool_calls_fired` to decide RECOVERED_PENDING vs CHURNED vs RETRY_QUEUED

This isn't a tutorial demo. It's a multi-tenant SaaS with real Stripe Connect money flow, signed webhooks, idempotency, rate limiting, and observability — built end-to-end in the hackathon window.

---

## Team

**Tim ([@winsznx](https://github.com/winsznx))** — backend, mobile, infrastructure
**Ronnix** — landing site, brand, motion

---

## License

Proprietary — © 2026 Dunner. All rights reserved.
