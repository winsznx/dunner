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

export const merchants = pgTable("merchants", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  stripeAccountId: text("stripe_account_id").unique(),
  stripeAccountStatus: text("stripe_account_status"),
  defaultVoiceId: text("default_voice_id"),
  agentId: text("agent_id"),
  agentPhoneNumberId: text("agent_phone_number_id"),
  applicationFeePercent: integer("application_fee_percent")
    .default(10)
    .notNull(),
  workingHoursStart: integer("working_hours_start").default(9),
  workingHoursEnd: integer("working_hours_end").default(18),
  timezone: text("timezone").default("America/New_York"),
  maxRetryAttempts: integer("max_retry_attempts").default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const knowledgeBaseDocs = pgTable("knowledge_base_docs", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  elevenLabsDocId: text("eleven_labs_doc_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  amountDue: bigint("amount_due", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  planName: text("plan_name"),
  attemptCountStripe: integer("attempt_count_stripe").default(1),
  rawEvent: jsonb("raw_event").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  recoveredAmount: bigint("recovered_amount", { mode: "number" }),
  applicationFeeCollected: bigint("application_fee_collected", {
    mode: "number",
  }),
  finalOutcome: callOutcomeEnum("final_outcome"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  costUsd: text("cost_usd"),
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
  audioUrl: text("audio_url"),
  toolCallsFired: jsonb("tool_calls_fired")
    .$type<
      Array<{ name: string; args: Record<string, unknown>; timestamp: number }>
    >()
    .default([]),
});

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at"),
  status: text("status").default("processing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const elevenLabsWebhookEvents = pgTable("eleven_labs_webhook_events", {
  conversationId: text("conversation_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export const agentApiTokens = pgTable("agent_api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .references(() => merchants.id)
    .notNull()
    .unique(),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
