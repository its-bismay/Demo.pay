# 🔑 API Keys Setup Guide — Demo.pay

This guide provides step-by-step instructions for acquiring and configuring every external API key required to run Demo.pay locally or on a hosted server.

> **Start here**: Copy `backend/.env.example` to `backend/.env`, then fill in each value using the steps below.

---

## 📋 Complete `.env` Template

```env
PORT=3001
NODE_ENV=production

# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require&channel_binding=require

# ── Authentication ────────────────────────────────────────────
JWT_SECRET=any_random_32_plus_character_string_here
JWT_EXPIRES_IN=7d

# ── Redis (BullMQ job queue) ──────────────────────────────────
REDIS_URL=rediss://default:password@host:6379

# ── Razorpay ─────────────────────────────────────────────────
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=your_custom_webhook_secret

# ── Google Gemini AI ──────────────────────────────────────────
GOOGLE_API_KEY=AIzaSy...

# ── Sarvam AI (Voice TTS) ─────────────────────────────────────
SARVAM_API_KEY=...

# ── Meta WhatsApp Cloud API ───────────────────────────────────
META_WHATSAPP_TOKEN=EAAG...
META_WHATSAPP_PHONE_ID=...
META_WHATSAPP_VERIFY_TOKEN=any_secret_string_you_choose

# ── Email Service (optional, pre-configured) ──────────────────
EMAIL_SERVICE_URL=https://email-service-coral-beta.vercel.app/api/send-mail

# ── Seeded Merchant ID (do not change) ───────────────────────
MERCHANT_ID=e7b8c2a1-4f9e-4a6c-9b5d-8e2a1b3c4d5e

# ── Frontend URL (for CORS + payment redirect links) ──────────
FRONTEND_ORIGIN=https://your-frontend.vercel.app
```

---

## 1. `GOOGLE_API_KEY` — Google Gemini AI

Demo.pay uses **Google ADK with Gemini 2.0 Flash** for real-time customer diagnosis, multi-turn voice conversation, and personalized recovery scripts.

**Free tier limits:**
- 15 requests/minute
- 500 requests/day
- 250,000 tokens/minute

Demo.pay has a built-in sliding-window rate limiter that automatically falls back to rule-based responses if limits are hit.

### How to get it:

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with any Google account
3. Click **Create API Key**
4. Choose an existing Google Cloud project or click **Create API key in new project**
5. Copy the key (format: `AIzaSy...`)
6. Paste into `backend/.env`:
   ```env
   GOOGLE_API_KEY=AIzaSyYourKeyHere
   ```

---

## 2. `SARVAM_API_KEY` — Sarvam AI Voice Synthesis

Sarvam AI provides the **Bulbul v3** neural TTS engine for natural Hinglish voice output. New accounts receive **100 free credits** on signup.

Available voices: `ritu` (female), `priya` (female), `shubh` (male), `arun` (male)

> If Sarvam credits run out, Demo.pay automatically falls back to browser Web Speech API — calls still work, just with a browser voice instead of an Indian accent.

### How to get it:

1. Go to [https://dashboard.sarvam.ai/](https://dashboard.sarvam.ai/)
2. Click **Sign Up** and verify your account
3. Navigate to **API Keys** in the left sidebar
4. Click **Create API Key**
5. Copy the generated key
6. Paste into `backend/.env`:
   ```env
   SARVAM_API_KEY=your_sarvam_subscription_key
   ```

---

## 3. Meta WhatsApp Cloud API — 3 variables

Demo.pay sends WhatsApp recovery links to customers using Meta's Graph API v22.0. You need three values from Meta Developer Console.

### Step A — Create a Meta Developer App (if you haven't)

1. Go to [https://developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click **Create App** → Select **Other** → **Business**
3. Give it a name (e.g. `DemoPayApp`) and click **Create**
4. On the next screen, scroll to **WhatsApp** and click **Set Up**

---

### Step B — Get `META_WHATSAPP_PHONE_ID`

1. In your app's sidebar, go to **WhatsApp → API Setup**
2. Under **Step 1: Select phone numbers**, you'll see the test number (e.g. `+1 555 198-7620`)
3. Below it, find **Phone number ID** (a long number like `1321774524348619`)
4. Click the copy icon
5. Paste into `backend/.env`:
   ```env
   META_WHATSAPP_PHONE_ID=1321774524348619
   ```

---

### Step C — Get `META_WHATSAPP_TOKEN`

1. On the same **API Setup** page, scroll to **Step 2: Send messages with the API**
2. Find the **Access token** field
3. Click the blue **Generate token** button (token is valid for 24h; for production use a Permanent Token)
4. Copy the token (starts with `EAAG...`)
5. Paste into `backend/.env`:
   ```env
   META_WHATSAPP_TOKEN=EAAGYourTokenHere
   ```

---

### Step D — Set `META_WHATSAPP_VERIFY_TOKEN`

This is a **password you invent yourself**. You'll use it when configuring the webhook in Meta Dashboard.

```env
META_WHATSAPP_VERIFY_TOKEN=demo_pay_verify_secret_2024
```

When you set up the webhook (after hosting your backend):
- **Callback URL**: `https://your-backend.onrender.com/api/webhooks/whatsapp`
- **Verify Token**: enter the exact same string from above

---

### Step E — Authorize your phone number to receive test messages

1. On the **API Setup** page, scroll to **Step 1** → click **Manage phone number list**
2. Add your personal mobile number (format: `+91XXXXXXXXXX`)
3. Enter the OTP sent to your WhatsApp
4. Meta's sandbox will now deliver messages to your phone

---

## 4. Razorpay — 3 variables

Razorpay handles checkout payments and fires HMAC-signed webhooks when payments succeed or fail.

### How to get `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`:

1. Log in to [https://dashboard.razorpay.com/](https://dashboard.razorpay.com/)
2. **Important**: Switch to **Test Mode** using the toggle in the top-left corner
3. Go to **Account & Settings** → **API Keys**
4. Click **Generate Test Key**
5. Copy both values:
   ```env
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Setting `RAZORPAY_WEBHOOK_SECRET`:

Choose any strong secret string:
```env
RAZORPAY_WEBHOOK_SECRET=demo_pay_razorpay_webhook_secret_2024
```

After hosting your backend, configure the webhook in Razorpay:
1. Go to **Account & Settings** → **Webhooks**
2. Click **Add New Webhook**
3. **Webhook URL**: `https://your-backend.onrender.com/api/webhooks/razorpay`
4. **Secret**: enter the same string as `RAZORPAY_WEBHOOK_SECRET`
5. Active events: tick `payment.failed`, `payment.captured`, `order.paid`
6. Click **Create Webhook**

---

## 5. `DATABASE_URL` — Neon PostgreSQL

Demo.pay uses **Neon Serverless PostgreSQL** (free tier is sufficient).

### How to get it:

1. Go to [https://console.neon.tech/](https://console.neon.tech/)
2. Sign up or log in
3. Click **New Project** → give it a name → **Create Project**
4. On the project dashboard, click **Connection Details**
5. Select **Connection string** → choose **Pooled connection** (important for serverless)
6. Copy the full string and paste into `backend/.env`:
   ```env
   DATABASE_URL=postgresql://neondb_owner:abc123@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

After setting `DATABASE_URL`, run the following to create all tables:
```bash
cd backend
npm run db:push
npm run db:seed
```

---

## 6. `REDIS_URL` — Upstash Redis (for BullMQ)

Redis is used for BullMQ job scheduling (e.g. promise-to-pay follow-up reminders in 24h).

> **Optional locally**: If `REDIS_URL` is not set or unreachable, Demo.pay falls back to synchronous execution automatically.

### How to get it (Upstash — free tier):

1. Go to [https://console.upstash.com/](https://console.upstash.com/)
2. Click **Create Database**
3. Choose **Redis** → name it → select a region → click **Create**
4. On the database page, find **REST URL** or **Redis URL**
5. Copy the `rediss://` connection string:
   ```env
   REDIS_URL=rediss://default:your_password@your-db.upstash.io:6379
   ```

---

## 7. `JWT_SECRET`

Used to sign customer login tokens. Generate a strong random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output:
```env
JWT_SECRET=8f9a2b4c6e8d0f1a3b5c7e9f1a3b5c7e9f1a3b5c7e9f1a3b5c7e
JWT_EXPIRES_IN=7d
```

---

## 8. `FRONTEND_ORIGIN`

The URL of your deployed frontend (used for CORS and payment redirect links in WhatsApp messages).

**Locally**: `http://localhost:5173`  
**Deployed**: `https://your-app.vercel.app`

```env
FRONTEND_ORIGIN=https://your-app.vercel.app
```

---

## ✅ Quick Checklist

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | Neon Console |
| `JWT_SECRET` | ✅ Yes | Generate with `node -e` above |
| `GOOGLE_API_KEY` | ✅ Yes | Google AI Studio |
| `SARVAM_API_KEY` | ⚠️ Recommended | Sarvam Dashboard (falls back to browser TTS) |
| `RAZORPAY_KEY_ID` | ✅ Yes | Razorpay Dashboard (Test Mode) |
| `RAZORPAY_KEY_SECRET` | ✅ Yes | Razorpay Dashboard (Test Mode) |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ After hosting | You choose it |
| `META_WHATSAPP_TOKEN` | ⚠️ Recommended | Meta Developer Console |
| `META_WHATSAPP_PHONE_ID` | ⚠️ Recommended | Meta Developer Console |
| `META_WHATSAPP_VERIFY_TOKEN` | ⚠️ After hosting | You choose it |
| `REDIS_URL` | ⚠️ Optional | Upstash (sync fallback if absent) |
| `FRONTEND_ORIGIN` | ✅ Yes | Your Vercel URL |
| `MERCHANT_ID` | ✅ Do not change | Pre-seeded value |
