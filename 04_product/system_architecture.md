# System Architecture — Tapau GTM Platform

## Architecture Overview

```mermaid
graph TB
    subgraph Client Layer
        A[Mobile Web App<br/>Progressive Web App] --> B[API Gateway]
        WA[WhatsApp Business API] --> B
    end

    subgraph API Layer
        B --> C[Auth Service]
        B --> D[Invoice Engine]
        B --> E[WhatsApp Bot Service]
        B --> F[Order Service]
        B --> G[Analytics Service]
    end

    subgraph Data Layer
        D --> H[(PostgreSQL<br/>Primary DB)]
        E --> H
        F --> H
        G --> I[(Analytics Store<br/>ClickHouse / BigQuery)]
        C --> H
    end

    subgraph External Services
        D --> J[LHDN MyInvois API]
        E --> K[WhatsApp Cloud API<br/>Meta Business]
        B --> L[Payment Gateway<br/>Stripe / Billplz]
        G --> M[PostHog / Mixpanel]
    end

    subgraph Infrastructure
        N[Vercel / Railway<br/>Hosting] --> B
        O[Cloudflare<br/>CDN + WAF] --> N
        P[Redis<br/>Cache + Queue] --> B
    end
```

---

## Core Components

### 1. Invoice Engine

| Aspect | Specification |
|---|---|
| **Purpose** | Generate, store, and submit LHDN-compliant e-invoices |
| **LHDN API** | MyInvois API v1.0 (REST) |
| **Invoice Format** | JSON (internal) → XML UBL 2.1 (LHDN submission) |
| **Signing** | Digital signature via LHDN-issued certificate |
| **Storage** | PostgreSQL + S3 (PDF copies) |
| **Key Operations** | Create, void, query status, bulk generate |

#### Invoice Flow
```
Order Confirmed → Invoice Created (draft)
    → Tax Calculated (SST rules engine)
    → LHDN Submission (async, retry on failure)
    → UUID Received → Invoice Finalized
    → PDF Generated → Sent to Customer (WhatsApp/Email)
```

#### LHDN Integration Requirements
| Requirement | Detail |
|---|---|
| TIN validation | Validate seller/buyer TIN against LHDN |
| MSIC codes | Map business types to correct codes |
| Mandatory fields | 50+ fields per LHDN spec |
| Submission | Real-time API call per invoice |
| QR code | Embed LHDN validation QR on each invoice |
| Retry logic | Queue failed submissions, retry with exponential backoff |

---

### 2. WhatsApp Integration Layer

| Aspect | Specification |
|---|---|
| **API** | WhatsApp Cloud API (Meta Business Platform) |
| **Connection** | Phone number registration via Meta Business Manager |
| **Message Types** | Text, template, interactive (buttons, lists) |
| **Webhook** | Receive incoming messages via webhook endpoint |
| **Rate Limits** | Tier-based: 250 → 1K → 10K → 100K messages/day |

#### Architecture
```
Customer WhatsApp Message
    → Meta Webhook → API Gateway
    → WhatsApp Bot Service
        → Intent Parser (keyword matching + NLP)
        → Template Matcher
        → Response Generator
    → Send Reply via Cloud API
    → Log Interaction → Analytics
```

#### Abstraction Layer (Platform Independence)
```
MessagingProvider Interface
├── WhatsAppProvider (primary)
├── SMSProvider (fallback)
├── EmailProvider (fallback)
└── WebChatProvider (future)
```

> Design for WhatsApp dependency risk: abstract the messaging layer so channel switching is configuration, not code change.

---

### 3. CRM / Order Tracking

| Aspect | Specification |
|---|---|
| **Purpose** | Track customers, orders, and lifetime value |
| **Customer Identity** | Phone number (primary key for F&B SMEs) |
| **Auto-Profile** | Build profiles automatically from WhatsApp interactions |
| **Order Sources** | WhatsApp, dashboard manual entry, future POS integration |

#### Data Model

```mermaid
erDiagram
    BUSINESS ||--o{ USER : "has"
    BUSINESS ||--o{ MENU_ITEM : "offers"
    BUSINESS ||--o{ ORDER : "receives"
    BUSINESS ||--o{ INVOICE : "generates"
    BUSINESS ||--o{ CUSTOMER : "serves"
    BUSINESS ||--o{ WA_TEMPLATE : "uses"

    ORDER ||--|{ ORDER_ITEM : "contains"
    ORDER ||--|| INVOICE : "generates"
    ORDER ||--|| CUSTOMER : "placed_by"

    MENU_ITEM ||--o{ ORDER_ITEM : "referenced_in"

    BUSINESS {
        uuid id PK
        string name
        string type
        string phone
        string tin_number
        string sst_number
        json address
        string wa_phone_id
        string onboarding_state
        timestamp created_at
    }

    MENU_ITEM {
        uuid id PK
        uuid business_id FK
        string name
        string category
        decimal price
        boolean available
        timestamp created_at
    }

    ORDER {
        uuid id PK
        uuid business_id FK
        uuid customer_id FK
        string source
        string status
        decimal total
        timestamp created_at
    }

    ORDER_ITEM {
        uuid id PK
        uuid order_id FK
        uuid menu_item_id FK
        int quantity
        decimal unit_price
        decimal subtotal
    }

    INVOICE {
        uuid id PK
        uuid business_id FK
        uuid order_id FK
        string invoice_number
        string lhdn_uuid
        string status
        decimal total
        decimal tax
        json lhdn_response
        timestamp created_at
    }

    CUSTOMER {
        uuid id PK
        uuid business_id FK
        string phone
        string name
        int total_orders
        decimal total_spent
        timestamp first_seen
        timestamp last_seen
    }

    WA_TEMPLATE {
        uuid id PK
        uuid business_id FK
        string trigger_type
        json trigger_keywords
        string response_template
        boolean active
    }
```

---

## Technology Recommendations

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js (PWA) | Mobile-first, offline capable, SEO for landing pages |
| **Backend** | Node.js + Express / Fastify | JavaScript ecosystem, fast development |
| **Database** | PostgreSQL + Prisma ORM | Relational data, strong typing, migrations |
| **Cache** | Redis | Session management, rate limiting, job queues |
| **Queue** | BullMQ (Redis-backed) | Async invoice submission, WhatsApp message processing |
| **Analytics** | PostHog (self-hosted) or Mixpanel | Event tracking, funnels, retention dashboards |
| **Hosting** | Railway or Vercel + Supabase | Easy deployment, autoscaling, managed Postgres |
| **CDN** | Cloudflare | Performance, security, DDoS protection |
| **Storage** | Cloudflare R2 or S3 | Invoice PDFs, menu images |
| **Auth** | Supabase Auth or Clerk | Phone/email login, simple for SMEs |
| **Payments** | Billplz or Stripe MY | FPX support, local payment methods |

---

## Deployment Architecture

```
Production
├── Vercel (Frontend + API routes)
│   ├── Next.js app
│   └── API endpoints
├── Railway (Backend services)
│   ├── WhatsApp webhook worker
│   ├── Invoice submission worker
│   └── Analytics ingestion
├── Supabase (Database)
│   ├── PostgreSQL
│   └── Auth
├── Redis (Upstash)
│   ├── Rate limiting
│   └── Job queues
└── External APIs
    ├── LHDN MyInvois
    ├── WhatsApp Cloud API
    └── Billplz
```

---

## Dependency Map

| Dependency | Risk Level | Mitigation |
|---|---|---|
| **LHDN MyInvois API** | Medium | Queue + retry, store locally first |
| **WhatsApp Cloud API** | High | Abstraction layer, SMS/email fallback |
| **Meta Business Manager** | High | Multi-number registration, compliance team |
| **Payment Gateway** | Low | Multiple provider support |
| **Hosting (Vercel/Railway)** | Low | Standard SaaS infrastructure |
| **PostgreSQL** | Low | Managed service with automated backups |
