# Demo.pay — Autonomous AI Revenue Recovery Engine

> **Stop revenue leakage. Autonomously.**  
> Built for the Razorpay Hackathon — AI Revenue Recovery Studio.

[![Node.js](https://img.shields.io/badge/Node.js-24.x-brightgreen)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-teal)](https://neon.tech)

---

## 🚀 What is Demo.pay?

**Demo.pay** is a full-stack autonomous revenue recovery platform. When a customer drops off at checkout or a payment fails, Demo.pay:

1. **Detects** the failure mode (UPI unreachable, bank timeout, insufficient funds, etc.)
2. **Diagnoses** root cause using a Gemini ADK AI agent
3. **Validates** merchant-defined guardrails (quiet hours, max discount, contact frequency)
4. **Intervenes** — auto-launches a Hinglish voice call via Sarvam AI or sends a WhatsApp recovery link via Meta Cloud API
5. **Negotiates** incrementally — never dumps max discount immediately; steps up offer only if customer resists
6. **Recovers** the revenue with a seamless Razorpay payment completion link

---

## ✨ Features

### 🛒 Demo Store (`/store`)
- Signup & Login with email + password (hashed with scrypt)
- Product catalog with dynamic category filtering
- Shopping cart with slide-out review drawer
- Simulated payment checkout with 4 failure modes
- Triggers the full AI recovery pipeline on payment failure

### 🖥️ Merchant Admin Portal (`/admin`)
- **Live Recovery Feed** — real-time KPI counters (Revenue At Risk, Recovered, Recovery Rate, Active Interventions) powered by SSE (Server-Sent Events)
- **Agent Audit Trail** — granular logs of every AI decision, tool call, and channel dispatch
- **Product Manager** — create, edit, categorize products with custom discount ceilings
- **AI Setup & Guardrails** — configure quiet hours, daily contact limits, discount ceiling (%), minimum cart value, and inject custom persona prompts directly into the Gemini system prompt
- **Kill Switch** — 1-click global halt that suppresses all outbound voice & messaging immediately

### 🤖 Autonomous Recovery Pipeline
- **Gemini ADK** agent with tool-calling: `apply_stepwise_discount`, `record_promise_to_pay`, `suppress_case`
- **Sarvam AI Bulbul v3** — natural Hinglish TTS with male (Aarav/Shubh) and female (Aditi/Ritu) voice personas
- **Meta WhatsApp Cloud API** — interactive recovery message with a 1-click Razorpay payment link
- **BullMQ + Redis** — scheduled delayed follow-up jobs (e.g. promise-to-pay reminder in 24h)
- **Browser Speech Recognition** — live voice input from customer during calls with real-time interim transcript display

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4, Shadcn UI, Framer Motion, Zustand |
| Backend | Node.js + Express, TypeScript, Drizzle ORM |
| AI / LLM | Google ADK, Gemini 2.0 Flash |
| Voice TTS | Sarvam AI (Bulbul v3) |
| Messaging | Meta WhatsApp Cloud API v22.0 |
| Payment | Razorpay Test Mode + HMAC Webhooks |
| Database | Neon Serverless PostgreSQL |
| Queue | BullMQ + Redis (Upstash) |
| Auth | JWT + scrypt password hashing |
| Hosting | Render (backend) + Vercel (frontend) |

---

## 📁 Project Structure

```
razorpay/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── components/        # UI components (VoiceCallModal, Navbar, etc.)
│   │   ├── pages/             # Route pages (Admin, Store, Checkout)
│   │   ├── store.js           # Zustand global state
│   │   └── main.jsx
│   ├── public/
│   └── package.json
│
├── backend/                   # Express + TypeScript API
│   ├── src/
│   │   ├── agents/            # Gemini ADK voice & recovery agents
│   │   ├── db/                # Drizzle ORM schema & migrations
│   │   ├── routes/            # Express route handlers
│   │   ├── services/          # TTS, SSE, promise, WhatsApp services
│   │   ├── workers/           # BullMQ background job workers
│   │   └── middleware/        # Auth, rate-limiter middleware
│   ├── .env.example           # Environment variable template
│   └── package.json
│
├── api_keys_setup_guide.md    # How to get every API key
├── hosting_guide.md           # How to deploy to Render + Vercel
└── README.md                  # This file
```

---

## 🏁 Local Setup

### Prerequisites

- **Node.js** v18 or higher (`node -v`)
- **npm** v9 or higher (`npm -v`)
- A **Neon** PostgreSQL database (free tier works fine)
- API keys — see [`api_keys_setup_guide.md`](./api_keys_setup_guide.md)

---

### Step 1 — Clone the repo

```bash
git clone https://github.com/its-bismay/Demo.pay.git
cd Demo.pay
```

---

### Step 2 — Set up Backend

```bash
cd backend
npm install
```

Copy the environment template and fill in your keys:

```bash
cp .env.example .env
```

Edit `backend/.env` with your actual values. All required keys are documented in [`api_keys_setup_guide.md`](./api_keys_setup_guide.md).

Run database migrations to create all tables:

```bash
npm run db:push
```

Seed the database with a merchant and products:

```bash
npm run db:seed
```

Start the backend development server:

```bash
npm run dev
```

The backend API will be available at `http://localhost:3001`.

---

### Step 3 — Set up Frontend

Open a new terminal:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
# Create frontend/.env.local
echo "VITE_API_BASE_URL=http://localhost:3001" > .env.local
echo "VITE_RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_HERE" >> .env.local
```

Start the frontend dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

### Step 4 — Test the Full Flow

1. Open `http://localhost:5173/store`
2. Sign up with an email and password
3. Add a product to cart → Checkout
4. On the payment page, choose a failure mode (e.g. **Bank Timeout**)
5. Watch the Admin portal at `http://localhost:5173/admin` — the AI recovery case will appear in real-time
6. A voice call modal will appear in the store — accept it, speak to Aditi (the AI agent)
7. The AI will negotiate a discount and record your promise to pay

---

## 🌐 Deployment

Full step-by-step hosting guide (Render for backend, Vercel for frontend) is in [`hosting_guide.md`](./hosting_guide.md).

---

## 🔑 API Keys

All external API keys required to run Demo.pay are documented with step-by-step acquisition guides in:

📄 [`api_keys_setup_guide.md`](./api_keys_setup_guide.md)

Required keys:
- `GOOGLE_API_KEY` — Google Gemini via AI Studio
- `SARVAM_API_KEY` — Sarvam AI voice synthesis
- `META_WHATSAPP_TOKEN` + `META_WHATSAPP_PHONE_ID` — WhatsApp Cloud API
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` — Razorpay Test Mode
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET` — any 32+ char random string

---

## 🗃️ Database Schema

Key tables managed by Drizzle ORM:

| Table | Purpose |
|---|---|
| `merchants` | Merchant account and Razorpay credentials |
| `customers` | Store customer accounts (email + hashed password + phone) |
| `products` | Product catalog with discount eligibility |
| `orders` | Order records linked to customers |
| `order_items` | Line items for each order |
| `recovery_cases` | AI recovery case lifecycle tracking |
| `interventions` | Each outbound voice/WhatsApp/email action |
| `policies` | Per-merchant guardrail configuration |
| `system_flags` | Global kill switch and feature flags |

---

## 📄 License

Developed for hackathon demonstration purposes. All third-party service integrations are used under their respective free-tier terms.
