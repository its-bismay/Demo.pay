# Demo.pay — Production Deployment & Webhook Verification Guide

This guide details everything required to deploy **Demo.pay** to production (**Backend on Render**, **Frontend on Vercel**), configure live webhooks (Razorpay & Twilio), and verify every pipeline end-to-end.

---

## 1. Pre-Deployment Checklist

Before deploying, verify you have the following accounts and credentials ready:

| Service | Requirement | What You Need |
|---|---|---|
| **GitHub** | Push repository | Public or Private repo with `backend/` and `frontend/` folders |
| **Neon** | Serverless Postgres | Pooled connection string (`postgresql://...-pooler...?sslmode=require`) |
| **Upstash** | Managed Redis | Redis URL with TLS enabled (`rediss://default:...@...upstash.io:6379`) |
| **Razorpay** | Test Mode Dashboard | `Key ID`, `Key Secret`, and a generated `Webhook Secret` |
| **Twilio** | Voice & WhatsApp Sandbox | `Account SID`, `Auth Token`, Twilio Phone Number, WhatsApp Sandbox number |
| **Google AI** | Gemini API | `GOOGLE_API_KEY` from Google AI Studio |
| **Email Service** | External REST Service | `https://email-service-coral-beta.vercel.app/api/send-mail` |
| **Render** | Web Service Host | Render account connected to your GitHub repo |
| **Vercel** | SPA Host | Vercel account connected to your GitHub repo |

> **Note on Secrets:** Your local `.env` files are ignored by git. Never commit real keys to git. You will enter production keys directly into Render and Vercel dashboards.

---

## 2. Environment Variables Reference

### Backend (Render Environment Tab)

| Variable | Description | Example / Format |
|---|---|---|
| `PORT` | Web server listening port | `3001` (Render automatically assigns, but set `3001` or let default) |
| `NODE_ENV` | Production mode | `production` |
| `DATABASE_URL` | Neon Postgres pooled connection URL | `postgresql://user:pass@ep-xyz-pooler.region.neon.tech/neondb?sslmode=require` |
| `REDIS_URL` | Upstash Redis connection URL (must start with `rediss://`) | `rediss://default:password@xyz.upstash.io:6379` |
| `JWT_SECRET` | Secret key for customer session JWTs (min 32 chars) | `super_secret_jwt_recovery_platform_key_32_chars_min` |
| `JWT_EXPIRES_IN` | JWT lifetime | `7d` |
| `RAZORPAY_KEY_ID` | Razorpay Test Key ID | `rzp_test_XXXXXXXXXXXXXX` |
| `RAZORPAY_KEY_SECRET` | Razorpay Test Key Secret | `YourRazorpaySecret` |
| `RAZORPAY_WEBHOOK_SECRET` | Secret used to sign & verify webhook payloads | Generate any random 32-character string |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `your_twilio_auth_token` |
| `TWILIO_PHONE_NUMBER` | Twilio Voice Number (E.164 format) | `+1234567890` |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp Sandbox Sender | `whatsapp:+14155238886` |
| `GOOGLE_API_KEY` | Google Gemini API Key | `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `EMAIL_SERVICE_URL` | External recovery email dispatch URL | `https://email-service-coral-beta.vercel.app/api/send-mail` |
| `MERCHANT_ID` | Seeded merchant UUID (from `backend/src/db/seed.ts`) | `e7b8c2a1-4f9e-4a6c-9b5d-8e2a1b3c4d5e` |
| `FRONTEND_ORIGIN` | Vercel production frontend URL (for CORS) | `https://your-app.vercel.app` |

---

### Frontend (Vercel Project Settings)

| Variable | Description | Value |
|---|---|---|
| `VITE_API_BASE_URL` | Render backend public URL | `https://your-app.onrender.com` |
| `VITE_DEV_PREVIEW` | Controls whether store shows auth gate | `false` |

---

## 3. Step-by-Step Backend Deployment (Render)

1. Log into **[Render Dashboard](https://dashboard.render.com/)**.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Fill in the service configuration:
   - **Name:** `demopay-backend` (or your choice)
   - **Region:** Singapore / Oregon / Frankfurt (pick closest to your Neon DB region)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Instance Type:** `Free` or `Starter`
5. Click **Advanced** → Add all Environment Variables listed in the Backend table above.
6. Click **Create Web Service**.
7. Wait for the build to complete and the service to show **Live**.
8. **Database Status (Already Seeded & Live in Neon):**
   - Your Neon Postgres cloud database was already migrated (all 15 tables) and seeded (`merchants`, `policies`, `products`, `system_flags`).
   - **No re-seeding is required on Render.** The backend automatically queries this existing data using `DATABASE_URL`.
   - *(Optional: `node dist/db/seed.js` is only provided if you ever switch to a brand new, empty database instance.)*
9. **Verify Backend Health:**
   - Open in your browser: `https://your-app.onrender.com/api/health`
   - It should return:
     ```json
     {"status":"ok","db":"connected","timestamp":"..."}
     ```

---

## 4. Step-by-Step Frontend Deployment (Vercel)

1. Log into **[Vercel Dashboard](https://vercel.com/)**.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository.
4. Configure the project:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click **Edit** → select `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Expand **Environment Variables** and add:
   - `VITE_API_BASE_URL`: `https://your-app.onrender.com`
   - `VITE_DEV_PREVIEW`: `false`
6. Click **Deploy**.
7. Once deployed, copy your production domain (e.g., `https://demopay-frontend.vercel.app`).
8. **Update CORS on Backend:**
   - Go back to Render → Environment tab.
   - Update `FRONTEND_ORIGIN` to your exact Vercel URL (e.g. `https://demopay-frontend.vercel.app`).
   - Click **Save Changes** (Render will automatically reload the service).

---

## 5. Webhook Configuration (Razorpay & Twilio)

### 5.1 Razorpay Webhooks (Production)

1. Go to **[Razorpay Dashboard](https://dashboard.razorpay.com/)** in **Test Mode**.
2. Navigate to: **Account & Settings → Website and app settings → Webhooks**
   *(Or direct URL: `https://dashboard.razorpay.com/app/webhooks`)*
3. Click **"+ Add New Webhook"**.
4. Fill in:
   - **Webhook URL:** `https://your-app.onrender.com/api/webhooks/razorpay`
   - **Secret:** Enter the exact string you configured for `RAZORPAY_WEBHOOK_SECRET` in Render.
   - **Alert Email:** Your email.
5. Under **Active Events**, select:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
6. Click **Save / Create Webhook**.

---

### 5.2 Twilio WhatsApp Sandbox Webhook

1. Go to **[Twilio Console](https://console.twilio.com/)**.
2. Navigate to: **Messaging → Try it out → Send a WhatsApp message**.
3. In the **Sandbox Settings** tab:
   - **When a message comes in:** `https://your-app.onrender.com/api/webhooks/twilio/whatsapp`
   - **Method:** `POST`
   - Click **Save**.
4. To test with your phone:
   - Send the join code (e.g. `join <your-sandbox-word>`) from your WhatsApp to the Twilio WhatsApp number (e.g. `+1 415 523 8886`).

---

### 5.3 Twilio Voice Webhook

1. In Twilio Console, go to: **Phone Numbers → Manage → Active Numbers**.
2. Click on your active Twilio phone number.
3. Scroll down to **Voice Configuration**:
   - Configure with: **Webhook, TwiML Bin, or Webhook**
   - Under **A Call Comes In**:
     - URL: `https://your-app.onrender.com/api/twilio/voice/response`
     - Method: `POST`
4. Click **Save**.

---

## 6. End-to-End Production Verification Testing

Execute these tests in order to verify all components on production:

### Test 1: Verify API Health & SSE Streams
- Hit `https://your-app.onrender.com/api/health` → verify 200 OK and `"db":"connected"`.
- Open DevTools Network tab on your Vercel URL → check `/api/stream/events` connection is established (`Content-Type: text/event-stream`).

### Test 2: Store Authentication & Session Gate
1. Open your Vercel URL (`https://your-app.vercel.app`).
2. Verify the Auth Gate modal is displayed (since `VITE_DEV_PREVIEW=false`).
3. Enter your real Name, Email, and Phone number (with `+91`).
4. Click "Continue Shopping".
5. Confirm your user session badge shows in the top-right header and is saved in `localStorage`.

### Test 3: Create Order & Simulate Payment Failure
1. Add any product (e.g. Premium Noise-Cancelling Headphones) to your bag.
2. Click **Bag** → Click **"Proceed to Checkout"**.
3. Verify the Checkout Drawer opens with the real Razorpay Order ID generated.
4. Click **"Insufficient Funds"** simulate button.
5. Within 2-3 seconds:
   - Razorpay fires webhook to `https://your-app.onrender.com/api/webhooks/razorpay`.
   - Backend verifies HMAC, stores `webhook_events`, and triggers diagnosis.

### Test 4: Multichannel Recovery Verification
1. **Email Recovery:**
   - Check the email entered at login.
   - You should receive an HTML email: *"Complete your order on Demo.pay"* with a tailored recovery link and applied discount.
2. **WhatsApp Recovery:**
   - Check WhatsApp (ensure your phone joined the Twilio Sandbox).
   - You will receive a recovery message with one-tap payment completion link.
3. **Voice Recovery:**
   - For high-value orders (≥ ₹2,000 threshold), Twilio initiates an outbound call to your phone playing the empathetic Polly Aditi greeting.

### Test 5: Inbound Promise-to-Pay Detection
1. Reply to the WhatsApp recovery message:
   > *"Kal sham ko payment pakka karunga"*
2. The backend webhook `/api/webhooks/twilio/whatsapp` detects the promise intent and replies:
   > *"Thank you! We've noted your promise to pay. We'll remind you then."*
3. In `payment_promises`, a row is created with `status: 'pending'` and scheduled for 24h follow-up.

### Test 6: Admin Dashboard Real-Time Telemetry
1. Navigate to `/admin` on your Vercel deployment.
2. Verify **KPI Cards**:
   - **Revenue at Risk** shows the simulated failed order amount.
   - **Active Interventions** shows active count.
3. Inspect the **Intervention Audit Log**:
   - The failure appears with **Status Badge** (`In Progress` / `Scheduled`).
   - Click the audit row → The **Case Details Dialog** opens.
   - Read the **AI Diagnosis & Reasoning Transcript** and view dispatched action telemetry.

### Test 7: Global Kill Switch Verification
1. In the `/admin` header, toggle the **Global Kill Switch** to ON.
2. Confirm the alert modal: *"Halt Agents"*. Switch turns red.
3. Return to the store and trigger a simulate failure.
4. In `/admin`, verify the new case immediately reaches **`Suppressed`** status (amber badge).
5. Toggle Kill Switch back to OFF to restore normal agent operations.

### Test 8: Batch Stress Simulation (Phase 10)
1. On the `/admin` Dashboard tab, locate the **Batch Stress & Load Simulator**.
2. Select `10 Events` (or `25 Events`) and click **"Run Batch"**.
3. Verify that:
   - 10 mixed failure events (`insufficient_funds`, `gateway_timeout`, `upi_unreachable`, `auth_failed`, `checkout_abandoned`) are ingested and diagnosed in parallel.
   - The Audit Log and KPI summary update live via SSE without page refresh.

---

## 7. Common Troubleshooting & Gotchas

| Issue | Root Cause | Solution |
|---|---|---|
| **CORS Error in Browser** | `FRONTEND_ORIGIN` mismatch | Ensure `FRONTEND_ORIGIN` on Render exactly matches your Vercel URL (including `https://`, no trailing slash). |
| **Render Free Tier Cold Start** | Render sleeps after 15m inactivity | Frontend `HealthGate` automatically holds on a 'Connecting to Engine' screen and unlocks as soon as Render returns 200 OK. You can also hit `/api/health` 2 min before your demo. |
| **Redis Connection Error** | Missing TLS or invalid URL | In Upstash, copy the **ioredis** connection string. Ensure the URL starts with `rediss://` (double `s`). |
| **Razorpay Webhook 400 Invalid Signature** | Secret mismatch or parsed body | Verify `RAZORPAY_WEBHOOK_SECRET` in Render matches the exact secret saved in the Razorpay Webhooks dashboard. |
| **Twilio WhatsApp Not Delivering** | Phone number has not joined Sandbox | Send `join <sandbox-code>` from your WhatsApp to `+1 415 523 8886` before testing. |
| **Database Missing Tables** | Seed or migration not run | Your Neon DB is already seeded; if switching to a fresh database, run `node dist/db/seed.js` in Render Shell. |
