# Onboarding Flow — 6-Step Activation Architecture

## Design Principle

> **Engineer a controlled first success experience.** Every question you ask = friction. Pre-build everything. Guide, don't expose.

---

## Time Budget

| Step | Activity | Target Time |
|---|---|---|
| 1 | Business Snapshot | 3 min |
| 2 | Auto Template Generation | 0 min (system) |
| 3 | Menu Setup | 5–10 min |
| 4 | WhatsApp Connection | 5 min |
| 5 | Invoice Confirmation | 2 min |
| 6 | First Value Moment | 3 min |
| **Total** | | **< 25 min** |

---

## Step 1 — Business Snapshot (3 min)

### Goal
Capture minimum data to auto-configure the entire system.

### UI Flow
```
Screen 1: Welcome
├── "Selamat datang! Let's get your business running in 20 minutes."
├── [Business Name] ← text input
├── [Business Type] ← dropdown (pre-selected: F&B)
│   ├── Restoran / Kafe
│   ├── Bakeri / Kek
│   ├── Catering
│   ├── Food Stall / Gerai
│   └── Lain-lain
├── [How do you take orders?] ← multi-select
│   ├── WhatsApp
│   ├── Walk-in
│   ├── Grab/Foodpanda
│   └── Phone call
└── [Continue →]
```

### Routing Logic
- Answers determine which templates load
- WhatsApp selected → prioritize WhatsApp connection step
- No WhatsApp → show alternative flow (email/SMS invoicing)

### Data Collected → System Actions
| Input | System Action |
|---|---|
| Business type = F&B | Load F&B menu template, invoice format |
| Takes orders via WhatsApp | Enable WhatsApp auto-reply module |
| Business name | Pre-fill all templates, invoices, profiles |

---

## Step 2 — Auto Template Generation (System, 0 min user time)

### What Happens (Invisible to User)
System auto-generates based on Step 1:
- ✅ Invoice template (LHDN-compliant, pre-filled business info)
- ✅ WhatsApp flow templates (menu request, order capture, hours)
- ✅ Menu template structure (categories pre-set for F&B)
- ✅ Customer database schema

### What User Sees
```
Screen 2: "We've prepared your system"
├── ✅ Invoice template — ready
├── ✅ WhatsApp replies — configured
├── ✅ Menu structure — ready for your items
└── "Just add your menu items and connect WhatsApp!"
└── [Continue →]
```

### Purpose
**Perceived intelligence = trust + momentum.** User feels the system "knows" their business.

---

## Step 3 — Menu Setup (5–10 min)

### Option A: CSV Upload (Preferred)
```
Screen 3A: Upload Menu
├── "Upload your menu file (Excel, CSV, or even messy is fine)"
├── [Upload File] ← drag & drop / file picker
├── System auto-parses:
│   ├── Item name
│   ├── Price
│   ├── Category (auto-detected or manual assign)
│   └── [Preview parsed items]
└── [Confirm →]
```

### Option B: Quick Manual Add
```
Screen 3B: Quick Add
├── "Add your 5 most popular items"
├── [Item Name] [Price] [Category dropdown]
│   ├── Row 1: _____ RM____ [Drinks/Main/Sides]
│   ├── Row 2: _____ RM____ [...]
│   ├── ...
│   └── [+ Add more]
├── "You can add the rest later"
└── [Continue →]
```

### Rule
**Don't aim for completeness — aim for usability.** 5–10 items is enough to start.

---

## Step 4 — WhatsApp Connection (5 min)

### Flow
```
Screen 4: Connect WhatsApp
├── "Turn your WhatsApp into a 24/7 sales assistant"
├── Step-by-step visual guide:
│   ├── 1. Open WhatsApp Business on your phone
│   ├── 2. Go to Settings → Linked Devices
│   ├── 3. Scan this QR code [QR displayed]
│   └── 4. Done! ✅
├── [Connection Status: Checking...]
├── If success → ✅ "Connected!"
├── If fail → "Need help? Chat with us" [support button]
└── [Continue →]
```

### Critical
- This step has highest drop-off risk
- Must have human fallback (live chat support)
- Show video tutorial option
- If user skips → still allow them to proceed (but flag for follow-up)

---

## Step 5 — Invoice Confirmation (2 min)

### Flow
```
Screen 5: Your Invoice Template
├── [Preview of auto-generated invoice]
│   ├── Business name: [from Step 1]
│   ├── Format: LHDN e-Invoice compliant
│   ├── Tax: SST auto-calculated
│   ├── Numbering: Auto-sequential
│   ├── Sample items from menu
│   └── LHDN compliance badge ✅
├── "Looks good?"
│   ├── [Yes, looks good! →]
│   └── [Edit details]
└── Continue to first order →
```

### Purpose
User sees polished output immediately → builds confidence.

---

## Step 6 — First Value Moment (3 min)

### Simulated Order Flow
```
Screen 6: "Let's try your first order!"
├── "Simulate a customer ordering from your menu"
├── [Select item from your menu]
│   ├── Nasi Lemak × 2
│   └── Teh Tarik × 1
├── [Generate Order →]
├── System shows:
│   ├── ✅ Order recorded in dashboard
│   ├── ✅ Invoice generated (with download link)
│   ├── ✅ WhatsApp confirmation message (preview)
│   └── 🎉 "Congratulations! Your first order is live."
└── [Go to Dashboard →]
```

### Why Simulated First
- Removes anxiety ("what if I break something?")
- Creates muscle memory
- Proves system works before real customer data flows

---

## Post-Onboarding: Real WhatsApp Test

```
Screen 7: "Test it for real!"
├── "Send 'Hi' to your business WhatsApp number from another phone"
├── Watch the auto-reply in action
├── System tracks: first_real_whatsapp_interaction = true
└── 🎉 "You're live! Customers can now order from you 24/7."
```

---

## State Machine

```
[NOT_STARTED] → [BUSINESS_SNAPSHOT] → [TEMPLATES_GENERATED] → [MENU_SETUP]
    → [WHATSAPP_CONNECTED] → [INVOICE_CONFIRMED] → [FIRST_ORDER_SIMULATED]
    → [ACTIVATED] → [FIRST_REAL_INTERACTION]
```

Each state is:
- Persisted to database
- Resumable (user can leave and come back)
- Tracked for analytics (drop-off at each step)

---

## Onboarding Completion Criteria

| Event | Required? | Weight |
|---|---|---|
| Business profile created | ✅ Yes | — |
| Menu items added (≥3) | ✅ Yes | — |
| WhatsApp connected | ⚠️ Encouraged | High |
| Invoice template confirmed | ✅ Yes | — |
| First order simulated | ✅ Yes | — |
| **Activation = all above** | | |
