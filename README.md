# Tapau GTM Engine

**Compliance-anchored GTM operating system for Malaysian F&B SMEs.**  
Built by [Agent SEA](https://hillary-site.vercel.app) — agentic infrastructure for emerging economies.

---

## What This Is

Tapau is a full-stack go-to-market platform purpose-built for Malaysian F&B and SME operators navigating LHDN e-invoicing mandates while running customer acquisition through WhatsApp. It is not a chatbot wrapper. It is an opinionated operating system that treats compliance, ordering, and retention as a single integrated problem.

The system runs a six-agent intelligence engine that detects activation friction, clusters behavioral patterns, generates execution tasks, and applies closed-loop optimizations — then tracks whether those optimizations actually improved the metrics they were targeting.

---

## Architecture
┌──────────────────────────────────────────────────────┐
│  Client Layer (React PWA + WhatsApp Cloud API)        │
└──────────────────┬───────────────────────────────────┘
│
┌──────────────────▼───────────────────────────────────┐
│  API Layer (Express 5 / Node.js)                      │
│  ├── Onboarding API        (5-step activation machine)│
│  ├── Invoice Engine        (LHDN MyInvois UBL 2.1)   │
│  ├── WhatsApp Bot Service  (Cloud API + webhooks)     │
│  ├── Intelligence Engine   (6-agent analysis system)  │
│  └── Credential Vault      (AES-256-GCM per-tenant)  │
└──────────────────┬───────────────────────────────────┘
│
┌──────────────────▼───────────────────────────────────┐
│  Data Layer                                           │
│  ├── SQLite (WAL mode, full state machine)            │
│  └── Encrypted credential store (per business)       │
└──────────────────────────────────────────────────────┘

---

## Core Systems

### Activation State Machine
A five-step onboarding flow with resumable state, per-step analytics, drop-off tracking, and automated intervention triggers for abandoned sessions. Activation is defined precisely: a business qualifies when it sends its first invoice or executes its first workflow within the `successWindowHours` window.

### LHDN MyInvois Integration
Full UBL 2.1 JSON→XML invoice submission pipeline against the MyInvois preprod/prod API. Includes TIN validation, MSIC code mapping, digital signature handling, retry-with-backoff on transient failures, and structured error diagnosis — each LHDN rejection code maps to a specific human-readable fix instruction.

### WhatsApp Automation Layer
Webhook-driven inbound message processing with keyword intent matching, auto-reply template dispatch, and outbound message delivery via the Meta Cloud API. The messaging layer is abstracted behind a provider interface — WhatsApp, SMS, email are swappable without code changes.

### Intelligence Engine (6 Agents)
| Agent | Function |
|---|---|
| `analyzeOnboardingCompletion` | Step completion rates, credential drop-off, per-step dwell times |
| `analyzeActivation` | Activation rate, time-to-value distribution, D1/D7/D30 retention |
| `detectFriction` | Hotspot detection — credential failures, step hesitation, abandonment |
| `clusterBehavior` | Fast/normal/slow activators, at-risk, non-activators |
| `measureOptimizationImpact` | Before/after cohort comparison, confidence scoring, auto-rollback |
| `generateOptimizations` | Ranked recommendations + Codex execution payload with priorityScore |

Optimizations follow a lifecycle: `pending → applied → validated → reinforced` or `deprecated` on negative impact. Confidence is recalculated from `baseConfidence × outcomeScore × sampleWeight`.

### Credential Architecture
Per-tenant AES-256-GCM encrypted credential storage in SQLite. LHDN client credentials and WhatsApp API tokens are encrypted at rest with a randomly-generated 256-bit key (or environment-supplied). The decryption key never leaves the server. Credential summaries (masked IDs, boolean presence flags) are safe to serialize to the client — raw secrets are not.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7 (PWA) |
| Backend | Node.js + Express 5 |
| Database | SQLite (`node:sqlite`, WAL mode) |
| Queue | BullMQ-compatible via domain layer |
| Invoice format | JSON → UBL 2.1 XML (LHDN spec) |
| Auth | AES-256-GCM per-tenant credential vault |
| Testing | Vitest + Supertest + jsdom |
| Deployment | Render (with persistent SQLite disk) |

---

## Quick Start
```bash
git clone https://github.com/hillarynjuguna/GTM_Engine
cd GTM_Engine/app
npm install
cp .env.example .env          # Add LHDN sandbox + WhatsApp credentials
npm run dev                   # Starts Express API (3001) + Vite dev server (5173)
```

**Run the simulation:**
```bash
npm run simulate              # Executes a full onboarding journey and writes validation artifacts
```

**Run tests:**
```bash
npm test                      # Vitest — API integration, intelligence engine, WhatsApp matching
```

---

## Deployment

Configured for Render via `render.yaml` — single web service, persistent 1GB SQLite disk, auto-generated encryption key. Deploy directly from the `/app` subdirectory.

---

## Relationship to Other Repos

| Repo | Relationship |
|---|---|
| `tapau-landing` | Investor demo surface — WhatsApp simulator, compliance visualizer, AI intent demo |
| `agent-sea-platform` | Agent triad (Aina/Amir/Lina), Ghost Bridge compliance logic, CE-Ledger provenance |
| `hillary-njuguna-intelligence-site` | Research platform — AURORA, CIR, DCFB, Bainbridge Warning publications |

---

## License

MIT — built with care in Malaysia 🇲🇾
