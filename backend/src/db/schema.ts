import { pgTable, uuid, text, integer, boolean, timestamp, numeric, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const failureModeEnum = pgEnum('failure_mode', [
  'GATEWAY_TIMEOUT', 'INSUFFICIENT_FUNDS', 'UPI_UNREACHABLE',
  'AUTH_FAILED', 'MANDATE_DECLINED', 'CHECKOUT_ABANDONED', 'INVOICE_OVERDUE',
]);

export const caseStatusEnum = pgEnum('case_status', [
  'DETECTED', 'DIAGNOSED', 'INTERVENTION_SCHEDULED',
  'INTERVENTION_EXECUTING', 'RECOVERED', 'FAILED', 'SUPPRESSED',
]);

export const channelEnum = pgEnum('channel', ['VOICE', 'WHATSAPP', 'EMAIL', 'RETRY']);

// ─── merchants ────────────────────────────────────────────────────────────────

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  razorpayKeyId: text('razorpay_key_id').notNull(),
  razorpayKeySecretEnc: text('razorpay_key_secret_enc').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── products ─────────────────────────────────────────────────────────────────

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').references(() => merchants.id).notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  priceInPaise: integer('price_in_paise').notNull(),
  category: text('category').notNull(),
  ratingValue: numeric('rating_value', { precision: 2, scale: 1 }),
  ratingCount: integer('rating_count'),
  stock: integer('stock').default(100).notNull(),
  imageUrl: text('image_url'),
  isSubscription: boolean('is_subscription').default(false).notNull(),
  discountEligible: boolean('discount_eligible').default(true).notNull(),
  maxDiscountOverridePct: integer('max_discount_override_pct'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── customers ────────────────────────────────────────────────────────────────

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').references(() => merchants.id).notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  city: text('city'),           // collected optionally — not in current auth form
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── orders ───────────────────────────────────────────────────────────────────

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').references(() => merchants.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  razorpayOrderId: text('razorpay_order_id'),
  amountInPaise: integer('amount_in_paise').notNull(),
  status: text('status').default('created').notNull(), // created | attempted | paid
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: integer('quantity').notNull(),
  priceAtTimeInPaise: integer('price_at_time_in_paise').notNull(),
});

// ─── cart_sessions ────────────────────────────────────────────────────────────

export const cartSessions = pgTable('cart_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  items: jsonb('items').notNull(), // [{ product_id, quantity, price_at_time_in_paise }]
  totalInPaise: integer('total_in_paise').notNull(),
  status: text('status').default('active').notNull(), // active | converted | abandoned
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── webhook_events ───────────────────────────────────────────────────────────

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  razorpayEventId: text('razorpay_event_id').unique().notNull(),
  eventType: text('event_type').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  processed: boolean('processed').default(false).notNull(),
});

// ─── recovery_cases ───────────────────────────────────────────────────────────

export const recoveryCases = pgTable('recovery_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').references(() => merchants.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id),           // nullable for cart-abandon
  webhookEventId: uuid('webhook_event_id').references(() => webhookEvents.id).notNull(),
  failureMode: failureModeEnum('failure_mode').notNull(),
  status: caseStatusEnum('status').default('DETECTED').notNull(),
  atRiskAmountInPaise: integer('at_risk_amount_in_paise').notNull(),
  recoveredAmountInPaise: integer('recovered_amount_in_paise').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── agent_instances & logs ───────────────────────────────────────────────────

export const agentInstances = pgTable('agent_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => recoveryCases.id).notNull(),
  agentType: text('agent_type').notNull(), // diagnosis | intervention-voice | ...
  status: text('status').notNull(),        // running | completed | failed | killed
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  killedBy: text('killed_by'),
});

export const agentLogs = pgTable('agent_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentInstanceId: uuid('agent_instance_id').references(() => agentInstances.id).notNull(),
  level: text('level').notNull(), // info | reasoning | tool_call | warn | error
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// ─── recovery_actions ─────────────────────────────────────────────────────────

export const recoveryActions = pgTable('recovery_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => recoveryCases.id).notNull(),
  agentInstanceId: uuid('agent_instance_id').references(() => agentInstances.id).notNull(),
  channel: channelEnum('channel').notNull(),
  rationale: text('rationale').notNull(),
  policyChecksPassed: jsonb('policy_checks_passed').notNull(),
  outcome: text('outcome').notNull(), // sent | failed | recovered | no_response
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── payment_promises ─────────────────────────────────────────────────────────

export const paymentPromises = pgTable('payment_promises', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => recoveryCases.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  promisedAt: timestamp('promised_at').defaultNow().notNull(),
  promisedFor: timestamp('promised_for').notNull(),
  status: text('status').default('pending').notNull(), // pending | kept | broken
  source: text('source').notNull(),                    // voice | whatsapp_reply
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── policies ─────────────────────────────────────────────────────────────────

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').references(() => merchants.id).unique().notNull(),
  maxContactsPer24h: integer('max_contacts_per_24h').default(2).notNull(),
  maxDiscountPct: integer('max_discount_pct').default(15).notNull(),
  quietHoursStart: text('quiet_hours_start').default('22:00').notNull(),
  quietHoursEnd: text('quiet_hours_end').default('08:00').notNull(),
  minOrderValuePaise: integer('min_order_value_paise').default(200000).notNull(),
  voiceType: text('voice_type').default('Female (Professional / Empathetic)').notNull(),
  languageMode: text('language_mode').default('Hinglish (Hindi + English blend)').notNull(),
  personaPrompt: text('persona_prompt').default(
    'You are a friendly, empathetic customer support agent for demo.pay. Speak in Hinglish. Offer a 10% discount if the customer hesitates.'
  ).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── system_flags ─────────────────────────────────────────────────────────────

export const systemFlags = pgTable('system_flags', {
  key: text('key').primaryKey(),
  value: boolean('value').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
});

// ─── contact_log ──────────────────────────────────────────────────────────────

export const contactLog = pgTable('contact_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  channel: channelEnum('channel').notNull(),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
});
