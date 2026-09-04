CREATE TYPE "public"."case_status" AS ENUM('DETECTED', 'DIAGNOSED', 'INTERVENTION_SCHEDULED', 'INTERVENTION_EXECUTING', 'RECOVERED', 'FAILED', 'SUPPRESSED');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('VOICE', 'WHATSAPP', 'EMAIL', 'RETRY');--> statement-breakpoint
CREATE TYPE "public"."failure_mode" AS ENUM('GATEWAY_TIMEOUT', 'INSUFFICIENT_FUNDS', 'UPI_UNREACHABLE', 'AUTH_FAILED', 'MANDATE_DECLINED', 'CHECKOUT_ABANDONED', 'INVOICE_OVERDUE');--> statement-breakpoint
CREATE TABLE "agent_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"agent_type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"killed_by" text
);
--> statement-breakpoint
CREATE TABLE "agent_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_instance_id" uuid NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"total_in_paise" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"city" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"razorpay_key_id" text NOT NULL,
	"razorpay_key_secret_enc" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"price_at_time_in_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"razorpay_order_id" text,
	"amount_in_paise" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"promised_at" timestamp DEFAULT now() NOT NULL,
	"promised_for" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"max_contacts_per_24h" integer DEFAULT 2 NOT NULL,
	"max_discount_pct" integer DEFAULT 15 NOT NULL,
	"quiet_hours_start" text DEFAULT '22:00' NOT NULL,
	"quiet_hours_end" text DEFAULT '08:00' NOT NULL,
	"min_order_value_paise" integer DEFAULT 200000 NOT NULL,
	"voice_type" text DEFAULT 'Female (Professional / Empathetic)' NOT NULL,
	"language_mode" text DEFAULT 'Hinglish (Hindi + English blend)' NOT NULL,
	"persona_prompt" text DEFAULT 'You are a friendly, empathetic customer support agent for demo.pay. Speak in Hinglish. Offer a 10% discount if the customer hesitates.' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policies_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_in_paise" integer NOT NULL,
	"category" text NOT NULL,
	"rating_value" numeric(2, 1),
	"rating_count" integer,
	"stock" integer DEFAULT 100 NOT NULL,
	"image_url" text,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"discount_eligible" boolean DEFAULT true NOT NULL,
	"max_discount_override_pct" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"agent_instance_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"rationale" text NOT NULL,
	"policy_checks_passed" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"order_id" uuid,
	"webhook_event_id" uuid NOT NULL,
	"failure_mode" "failure_mode" NOT NULL,
	"status" "case_status" DEFAULT 'DETECTED' NOT NULL,
	"at_risk_amount_in_paise" integer NOT NULL,
	"recovered_amount_in_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"value" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razorpay_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "webhook_events_razorpay_event_id_unique" UNIQUE("razorpay_event_id")
);
--> statement-breakpoint
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_case_id_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_agent_instance_id_agent_instances_id_fk" FOREIGN KEY ("agent_instance_id") REFERENCES "public"."agent_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_sessions" ADD CONSTRAINT "cart_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_case_id_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_case_id_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_agent_instance_id_agent_instances_id_fk" FOREIGN KEY ("agent_instance_id") REFERENCES "public"."agent_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;