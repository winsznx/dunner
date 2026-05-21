CREATE TABLE "waitlist_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"access_code" text,
	"source" text,
	"referrer" text,
	"ip_address" text,
	"invited_at" timestamp,
	"redeemed_at" timestamp,
	"redeemed_by_clerk_user_id" text,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_subscribers_access_code_unique" UNIQUE("access_code")
);
