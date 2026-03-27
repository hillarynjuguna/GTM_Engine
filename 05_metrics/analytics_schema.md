# Analytics Schema — Event Tracking & KPI Definitions

## Event Taxonomy

### Naming Convention
`{object}_{action}` — e.g., `invoice_created`, `onboarding_started`

---

## Core Events

### A. Acquisition Events

| Event | Properties | Trigger |
|---|---|---|
| `page_viewed` | `page`, `source`, `utm_campaign`, `utm_medium`, `utm_source`, `referrer` | Landing page load |
| `cta_clicked` | `cta_type` (whatsapp/form/demo), `page`, `section` | Any CTA button click |
| `form_submitted` | `form_type`, `email`, `phone_hash`, `business_type` | Demo request form |
| `whatsapp_initiated` | `source` (ad/organic/referral), `utm_campaign` | Click-to-WhatsApp |
| `lead_qualified` | `qualification_score`, `business_type`, `order_channel`, `compliance_awareness` | WhatsApp qualification complete |

### B. Onboarding Events

| Event | Properties | Trigger |
|---|---|---|
| `signup_completed` | `user_id`, `method` (phone/email), `source` | Account creation |
| `onboarding_started` | `user_id`, `timestamp` | Step 1 entered |
| `onboarding_step_completed` | `user_id`, `step_number`, `step_name`, `duration_seconds` | Each step completion |
| `onboarding_step_skipped` | `user_id`, `step_number`, `step_name` | Step skipped |
| `onboarding_abandoned` | `user_id`, `last_step`, `time_spent_seconds` | Session ends before completion |
| `onboarding_completed` | `user_id`, `total_duration_seconds`, `steps_skipped` | All steps done |
| `menu_items_added` | `user_id`, `count`, `method` (csv/manual) | Menu setup |
| `whatsapp_connected` | `user_id`, `phone_id`, `connection_method` | QR scan success |

### C. Activation Events

| Event | Properties | Trigger |
|---|---|---|
| `invoice_created` | `user_id`, `invoice_type` (simulated/real), `amount`, `items_count`, `lhdn_compliant` | Any invoice generation |
| `invoice_first_created` | `user_id`, `time_since_signup_minutes` | First-ever invoice |
| `whatsapp_message_received` | `user_id`, `customer_phone_hash`, `template_matched` | Inbound customer message |
| `whatsapp_auto_reply_sent` | `user_id`, `template_id`, `response_time_ms` | Auto-reply triggered |
| `whatsapp_first_interaction` | `user_id`, `time_since_signup_minutes` | First customer interaction |
| `order_created` | `user_id`, `source`, `amount`, `items_count` | Order recorded |
| `order_first_created` | `user_id`, `time_since_signup_minutes`, `source` | First-ever order |
| `user_activated` | `user_id`, `time_to_activation_minutes`, `events_completed` | Activation criteria met |

### D. Retention Events

| Event | Properties | Trigger |
|---|---|---|
| `session_started` | `user_id`, `session_id`, `days_since_signup` | User opens app |
| `invoice_created` | (same as above) | Ongoing usage |
| `order_created` | (same as above) | Ongoing usage |
| `feature_used` | `user_id`, `feature_name`, `session_id` | Any feature interaction |
| `checkin_received` | `user_id`, `checkin_type`, `days_since_signup` | Receives automated check-in |
| `checkin_responded` | `user_id`, `checkin_type`, `response` | Responds to check-in |
| `churn_risk_detected` | `user_id`, `days_inactive`, `last_action` | No activity for X days |

### E. Revenue Events

| Event | Properties | Trigger |
|---|---|---|
| `subscription_started` | `user_id`, `plan`, `amount_myr`, `billing_cycle` | First payment |
| `subscription_renewed` | `user_id`, `plan`, `amount_myr`, `month_number` | Recurring payment |
| `subscription_upgraded` | `user_id`, `from_plan`, `to_plan`, `amount_delta` | Plan upgrade |
| `subscription_cancelled` | `user_id`, `plan`, `reason`, `months_active` | Cancellation |

---

## KPI Definitions

### Acquisition KPIs

| KPI | Formula | Target | Frequency |
|---|---|---|---|
| **CPL** (Cost Per Lead) | Ad spend / Qualified leads | RM 20–50 | Weekly |
| **CAC** (Customer Acquisition Cost) | Total acquisition cost / Paying customers | RM 100–250 | Monthly |
| **Lead-to-Customer Rate** | Paying customers / Qualified leads | 15–25% | Weekly |
| **Channel CPL** | Spend per channel / Leads per channel | Varies | Weekly |

### Activation KPIs

| KPI | Formula | Target | Frequency |
|---|---|---|---|
| **Activation Rate** | Activated users / Total signups × 100 | > 60% | Weekly |
| **Time to Value** | Median(first_activation_event.timestamp - signup.timestamp) | < 60 min | Weekly |
| **Onboarding Completion** | Completed onboarding / Started onboarding × 100 | > 70% | Weekly |
| **Step Drop-off** | (Started step N - Completed step N) / Started step N × 100 | < 20% per step | Weekly |

### Retention KPIs

| KPI | Formula | Target | Frequency |
|---|---|---|---|
| **D7 Retention** | Active on day 7 / Activated users × 100 | > 80% | Weekly |
| **D30 Retention** | Active on day 30 / Activated users × 100 | > 60% | Monthly |
| **Weekly Active Rate** | Users with ≥1 action this week / Total active users × 100 | > 70% | Weekly |
| **Feature Adoption** | Users using feature X / Total active users × 100 | Varies | Monthly |

### Revenue KPIs

| KPI | Formula | Target | Frequency |
|---|---|---|---|
| **MRR** | Sum of all active subscription amounts | Growth target | Monthly |
| **ARPU** | MRR / Active paying users | RM 79+ | Monthly |
| **LTV** | ARPU × Average customer lifetime (months) | > 12× CAC | Quarterly |
| **Payback Period** | CAC / ARPU | < 3 months | Monthly |
| **Net Revenue Retention** | (MRR at end - churn + expansion) / MRR at start × 100 | > 100% | Monthly |

---

## Funnel Definitions

### Funnel 1: Acquisition Funnel
```
Page View → CTA Click → WhatsApp Initiated → Lead Qualified → Demo Booked → Signup
```

### Funnel 2: Onboarding Funnel
```
Signup → Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Completed
```

### Funnel 3: Activation Funnel
```
Onboarding Complete → First Invoice → First WhatsApp Interaction → First Real Order → Activated
```

### Funnel 4: Retention Funnel
```
Activated → Week 1 Active → Week 2 Active → Week 4 Active → Month 2 Active → Month 3 Active
```

---

## Implementation Guidance

| Tool | Use Case | Setup |
|---|---|---|
| **PostHog** | Product analytics, funnels, retention | Self-hosted or cloud, JS SDK + API |
| **Mixpanel** | Alternative to PostHog | Cloud, JS SDK |
| **Google Analytics 4** | Landing page traffic | gtag.js |
| **Custom Events Table** | Raw event storage | PostgreSQL `events` table |
| **Metabase** | Internal dashboards | Connect to PostgreSQL |
