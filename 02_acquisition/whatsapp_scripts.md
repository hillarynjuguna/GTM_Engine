# WhatsApp Conversion Scripts — Full Flow

## Overview

Three complete conversation flows with branching logic:
1. **Inbound from Ad** — User clicks WhatsApp CTA
2. **Outbound Prospecting** — Cold/warm outreach to curated list
3. **Objection Handling** — Cross-cutting responses

---

## Flow 1: Inbound from Ad (Click-to-WhatsApp)

### Step 1 — Auto Welcome (Immediate)

```
🤝 Hi! Terima kasih sebab hubungi kami.

Kami bantu pemilik restoran & kafe:
✅ Buat e-invois LHDN secara automatik
✅ Auto-reply pelanggan di WhatsApp
✅ Track semua order di satu tempat

Boleh saya tanya sikit tentang bisnes anda? 😊
```

---

### Step 2 — Qualification (2 questions only)

```
1️⃣ Bisnes anda jenis apa?
   a) Restoran / Kafe
   b) Bakeri / Kek
   c) Catering
   d) Food stall / Gerai
   e) Lain-lain

2️⃣ Sekarang macam mana anda buat invois?
   a) Tulis tangan / resit
   b) Excel / Google Sheets
   c) Guna POS system
   d) Tak buat invois
```

> **Routing Logic:**
> - If (a/b/c/d) + (a/b/d) → **HIGH PRIORITY** — proceed to demo
> - If (c) for invoicing → **MEDIUM** — qualify further on pain
> - If (e) for business type → **LOW** — politely disengage

---

### Step 3 — Pain Amplification

```
Faham! Ramai pemilik F&B yang kami jumpa pun sama.

Soalan penting ni — LHDN dah mula wajibkan e-invois untuk SEMUA perniagaan.

Adakah anda dah tahu tentang keperluan ini?
   a) Ya, tapi belum comply
   b) Dengar sikit-sikit
   c) Tak tahu langsung 😅
```

> **For a/b:** Proceed to value hook
> **For c:** Educate briefly, then proceed

**Education insert (if needed):**
```
📋 Ringkasan: LHDN wajibkan semua perniagaan keluarkan e-invois.
Denda boleh sampai RM20,000 per kesalahan.

Tapi jangan risau — kami boleh bantu anda comply dalam 1 hari.
```

---

### Step 4 — Value Hook

```
Bagus! Ini yang kami boleh buat untuk bisnes anda:

🧾 Auto e-invois — patuh LHDN, tak perlu buat manual
📱 Auto-reply WhatsApp — pelanggan dapat menu & reply segera
📊 Track order — semua dalam satu dashboard

Setup dalam 20 minit je. Guna telefon pun boleh.
```

---

### Step 5 — Demo CTA

```
Nak saya tunjukkan macam mana ia berfungsi dengan menu anda?

Demo percuma, 15 minit je. Saya boleh setup terus untuk anda try.

✅ Bila masa yang sesuai? Hari ni ke esok?
```

---

### Step 6 — Closing Frame

```
Kebanyakan peniaga yang dah guna recover kos dalam 1–2 minggu
— cuma dari order yang dulu terlepas.

Boleh start dengan [Plan Name] RM[XX]/bulan.
Tak ada kontrak. Cancel bila-bila.

Nak mula? 🚀
```

---

## Flow 2: Outbound Prospecting

### Message 1 — Day 1 (Personalized Open)

```
Assalamualaikum / Hi [Name],

Saya nampak [Business Name] kat [Location] — nampak best! 🍜

Saya nak share satu benda — LHDN dah mula wajibkan e-invois
untuk semua perniagaan F&B.

Kami ada sistem yang boleh auto-generate e-invois + handle
WhatsApp order untuk anda. Setup 20 minit.

Ada 2 minit untuk saya explain? 😊
```

---

### Message 2 — Day 2 (Follow-up if no reply)

```
Hi [Name], just checking — adakah anda dah nampak mesej semalam?

Tak nak ambil masa lama — cuma nak pastikan anda tahu
pasal deadline e-invois LHDN yang semakin dekat.

Kalau anda sibuk sekarang, boleh reply "NANTI" dan saya
hubungi masa yang lebih sesuai 👍
```

---

### Message 3 — Day 5 (Value-add)

```
Hi [Name], saya nak share satu tip:

💡 Tahukah anda 40% order WhatsApp terlepas sebab lambat reply?

Dengan auto-reply, pelanggan anda dapat menu & boleh order
walaupun anda sedang masak atau rehat.

Nak tengok demo 2 minit? Saya boleh hantar video. 🎥
```

---

### Message 4 — Day 7 (Final CTA)

```
Last message dari saya, [Name] 😊

Kalau anda berminat nak:
✅ Comply dengan LHDN e-invois
✅ Auto-reply pelanggan WhatsApp
✅ Track order di satu tempat

Reply "YA" dan saya setup demo percuma untuk anda.

Kalau tak berminat, tiada masalah — terima kasih! 🙏
```

---

## Flow 3: Objection Handling Scripts

### "Mahal lah / Tak mampu"

```
Faham concern anda. Tapi mari kira sama-sama:

Kalau anda terlepas 3-5 order sehari sebab lambat reply WhatsApp,
itu dah beratus ringgit sebulan yang hilang.

Sistem ni start dari RM[XX]/bulan — dan kebanyakan user
recover kos tu dalam minggu pertama.

Cuba percuma dulu? 😊
```

---

### "Saya tak pandai teknologi"

```
Itu sebab kami design khas untuk pemilik bisnes, bukan IT people.

Setup guna telefon je — ada panduan step by step.
Kalau stuck, kami boleh setup untuk anda secara live.

20 minit, siap! 🎯
```

---

### "Nanti dulu / Belum ready"

```
Tak apa! Cuma nak remind — deadline LHDN semakin dekat.

Kalau tunggu last minute, nanti rushing.
Better setup awal, slow-slow belajar.

Nak saya remind anda bulan depan? Atau nak try tengok demo
dulu (2 minit je)? 🤔
```

---

### "Dah ada POS / sistem lain"

```
Bagus! Soalannya — sistem anda tu ada:
✅ E-invois LHDN?
✅ Auto-reply WhatsApp?

Kalau belum, kami boleh add on tu tanpa tukar sistem sedia ada.
```

---

### "Kena tanya partner / spouse dulu"

```
Faham! Nak saya hantar summary ringkas yang boleh anda forward?

Ada:
📋 Apa yang sistem buat
💰 Harga
📊 Contoh sebenar

Senang untuk discuss nanti 👍
```

---

## Conversation Metrics to Track

| Metric | Target | How to Measure |
|---|---|---|
| Reply rate (outbound) | > 15% | Replied / Sent |
| Qualification rate | > 60% | Qualified / Replied |
| Demo booking rate | > 40% | Demos / Qualified |
| Demo → Close | > 30% | Closed / Demos |
| Avg messages to close | < 8 | Total messages / Closed deals |
| Response time | < 5 min | Time from user message to reply |
