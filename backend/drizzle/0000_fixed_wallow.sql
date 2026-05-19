CREATE TYPE "public"."call_outcome" AS ENUM('agreement_reached', 'no_agreement', 'customer_cancelled', 'abusive_termination', 'no_answer', 'busy', 'unknown_failure');--> statement-breakpoint
CREATE TYPE "public"."recovery_state" AS ENUM('QUEUED', 'SCHEDULED', 'READY_TO_CALL', 'CALLING', 'IN_CALL', 'RECOVERED_PENDING', 'RECOVERED', 'RETRY_QUEUED', 'FAILED_NEEDS_RETRY', 'CHURNED', 'ABUSE_TERMINATED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "agent_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_api_tokens_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "call_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recovery_id" uuid NOT NULL,
	"eleven_labs_conversation_id" text,
	"twilio_call_sid" text,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_secs" integer,
	"cost_usd" text,
	"outcome" "call_outcome",
	"transcript" jsonb,
	"transcript_summary" text,
	"audio_url" text,
	"tool_calls_fired" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "call_attempts_eleven_labs_conversation_id_unique" UNIQUE("eleven_labs_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "eleven_labs_webhook_events" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"stripe_payment_intent_id" text,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"amount_due" bigint NOT NULL,
	"currency" text NOT NULL,
	"plan_name" text,
	"attempt_count_stripe" integer DEFAULT 1,
	"raw_event" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "failed_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"eleven_labs_doc_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"stripe_account_id" text,
	"stripe_account_status" text,
	"default_voice_id" text,
	"agent_id" text,
	"agent_phone_number_id" text,
	"application_fee_percent" integer DEFAULT 10 NOT NULL,
	"working_hours_start" integer DEFAULT 9,
	"working_hours_end" integer DEFAULT 18,
	"timezone" text DEFAULT 'America/New_York',
	"max_retry_attempts" integer DEFAULT 4,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_clerk_org_id_unique" UNIQUE("clerk_org_id"),
	CONSTRAINT "merchants_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"failed_invoice_id" uuid NOT NULL,
	"state" "recovery_state" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp,
	"recovered_amount" bigint,
	"application_fee_collected" bigint,
	"final_outcome" "call_outcome",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp,
	"status" text DEFAULT 'processing',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'admin',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "agent_api_tokens" ADD CONSTRAINT "agent_api_tokens_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_recovery_id_recoveries_id_fk" FOREIGN KEY ("recovery_id") REFERENCES "public"."recoveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failed_invoices" ADD CONSTRAINT "failed_invoices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_docs" ADD CONSTRAINT "knowledge_base_docs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_failed_invoice_id_failed_invoices_id_fk" FOREIGN KEY ("failed_invoice_id") REFERENCES "public"."failed_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;