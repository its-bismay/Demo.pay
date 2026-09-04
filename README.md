# Demo.pay — Autonomous AI Revenue Recovery Engine

> **Stop revenue leakage. Autonomously.**  
> Built for the Razorpay Hackathon — AI Revenue Recovery Studio.

---

## 🚀 Overview

**Demo.pay** is an autonomous, policy-bounded revenue recovery platform designed to eliminate checkout drop-offs and failed payment loss. When a transaction fails or checkout is abandoned, Demo.pay detects the failure mode, diagnoses the root cause, checks merchant-defined compliance guardrails, and initiates high-converting customer interventions via omnichannel voice calls and WhatsApp recovery links.

---

## ✨ Key Features

- **Dynamic Storefront (`/store`)**:
  - Interactive product catalog with dynamic category filtering.
  - Multi-item shopping cart with slide-out bag review drawer.
  - Interactive payment failure simulation (Insufficient Funds, Bank Timeout, UPI Unreachable, Incorrect PIN).
- **Merchant Admin Portal (`/admin`)**:
  - **Live Recovery Feed & Audit Trail**: Real-time KPI counters (Revenue At Risk, Recovered, Recovery Rate, Active Interventions) and granular event logs.
  - **Inventory Management**: Create, edit, and categorize products with custom discount ceilings, pricing, ratings, and image links.
  - **AI Setup & Guardrails**: Configurable quiet hours, daily contact limits, discount ceilings, minimum order thresholds, and AI persona tuning.
- **Autonomous Recovery Pipeline**:
  - **Detect**: Instant webhook ingestion for failed transactions and drop-offs.
  - **Diagnose**: Multi-turn agent reasoning analyzing error codes and customer history.
  - **Intervene**: Omnichannel customer reach via Sarvam AI Voice (natural Hinglish) and Meta WhatsApp Cloud API recovery links.
  - **Recover**: Seamless payment completion with auto-applied, policy-compliant discounts.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Radix UI / Shadcn UI, Framer Motion, Lucide React, Zustand.
- **Backend & AI Architecture**:
  - Payment Gateway: Razorpay Test Mode & Webhooks
  - AI Orchestration: Google ADK (Agent Development Kit) & Gemini models
  - Voice & Messaging: Sarvam AI (Bulbul v3 TTS) & Meta WhatsApp Cloud API

---

## 🏁 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or pnpm

### Running the Frontend
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

The application will launch locally at `http://localhost:5173`.

---

## 📄 License

This project is developed for hackathon demonstration purposes.
