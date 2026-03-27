# Activation Triggers & Measurement

## Activation Definition

A user is **activated** when they complete ALL three core value events within 24 hours of signup:

| # | Event | Code | Required? |
|---|---|---|---|
| 1 | First invoice generated | `invoice_first_created` | ✅ Yes |
| 2 | First WhatsApp interaction | `whatsapp_first_interaction` | ⚠️ Encouraged |
| 3 | First order recorded | `order_first_created` | ✅ Yes |

**Activation = (Event 1 + Event 3) ∩ within 24h**

WhatsApp interaction is tracked but not required (some users may start with walk-in orders only).

---

## Event Tracking Spec

### Event 1: `invoice_first_created`
```json
{
  "event": "invoice_first_created",
  "properties": {
    "user_id": "{uuid}",
    "timestamp": "{ISO_8601}",
    "invoice_type": "simulated | real",
    "time_since_signup_minutes": 0,
    "onboarding_step": 6,
    "items_count": 0,
    "total_amount": 0.00,
    "lhdn_compliant": true
  }
}
```

### Event 2: `whatsapp_first_interaction`
```json
{
  "event": "whatsapp_first_interaction",
  "properties": {
    "user_id": "{uuid}",
    "timestamp": "{ISO_8601}",
    "interaction_type": "auto_reply | manual",
    "trigger_template": "{template_id}",
    "time_since_signup_minutes": 0,
    "customer_phone_hash": "{sha256}"
  }
}
```

### Event 3: `order_first_created`
```json
{
  "event": "order_first_created",
  "properties": {
    "user_id": "{uuid}",
    "timestamp": "{ISO_8601}",
    "order_source": "whatsapp | dashboard | simulated",
    "items_count": 0,
    "total_amount": 0.00,
    "time_since_signup_minutes": 0
  }
}
```

---

## Reinforcement Loop — Automated Check-Ins

### Purpose
Lock initial behavior into habit. Delivered via WhatsApp to the business owner.

### Schedule

| Timing | Message | Trigger Condition |
|---|---|---|
| **+2 hours** | "Dah terima mesej pelanggan? Kalau belum, cuba hantar 'Hi' ke nombor bisnes anda dari telefon lain 📱" | `whatsapp_first_interaction == false` |
| **+6 hours** | "Nak setup auto-reply untuk waktu peak? Kami ada template siap — reply 'SETUP' untuk activate" | `whatsapp_connected == true` |
| **+24 hours** | "🎉 Hari pertama anda: {X} interactions handled, {Y} invoices generated! Here's your summary 👇" | Always send |
| **+3 days** | "Tip: Auto-upsell boleh boost revenue 15–20%. Nak activate? Reply 'UPSELL'" | `upsell_template_active == false` |
| **+7 days** | "Minggu pertama recap: {orders_count} orders, RM{revenue} revenue tracked. You're doing great! 💪" | Always send |

### Check-In States

```
[SIGNUP] → [2H_CHECK] → [6H_CHECK] → [24H_SUMMARY]
    → [3D_TIP] → [7D_RECAP] → [ONGOING_WEEKLY]
```

---

## Measurement Framework

### Primary KPIs

| KPI | Formula | Target |
|---|---|---|
| **Activation Rate** | Activated users / Total signups | > 60% |
| **Time to Value** | Median time from signup to first activation event | < 60 min |
| **Onboarding Completion** | Completed Step 6 / Started Step 1 | > 70% |

### Secondary KPIs

| KPI | Formula | Target |
|---|---|---|
| Step completion rate | Completed step N / Started step N | > 80% per step |
| WhatsApp connection rate | Connected / Total signups | > 50% |
| Simulated → Real conversion | First real order / First simulated order | > 60% |
| Check-in response rate | Responded to check-in / Received check-in | > 30% |

### Drop-Off Analysis

Track percentage entering vs completing each step:

```
Step 1: Business Snapshot    →  [100%] start
Step 2: Auto Templates       →  [98%] (minimal friction)
Step 3: Menu Setup           →  [85%] ← potential drop-off
Step 4: WhatsApp Connect     →  [70%] ← highest risk step
Step 5: Invoice Confirm      →  [95%] (low friction)
Step 6: First Order          →  [90%] (guided)

Overall Completion:          →  ~60-65%
```

### Intervention Triggers

| Condition | Action |
|---|---|
| User stalls at Step 3 > 5 min | Show "Quick Add" option (5 items only) |
| User fails WhatsApp QR scan | Trigger live support chat |
| User skips WhatsApp step | Allow progress, schedule follow-up |
| No activity 2h post-signup | Send WhatsApp nudge |
| No activity 24h post-signup | Human outreach (call/message) |
| User completes onboarding but no real transaction in 48h | Send "test it live" prompt |
