# Prebuilt Templates — F&B E-Invoicing & WhatsApp

## 1. Invoice Template (LHDN-Compliant)

### JSON Schema

```json
{
  "invoice": {
    "header": {
      "invoice_number": "INV-{auto_increment}",
      "date_issued": "{ISO_8601_datetime}",
      "due_date": "{ISO_8601_datetime}",
      "currency": "MYR",
      "status": "draft | issued | paid | void",
      "lhdn_compliance": {
        "version": "1.0",
        "tin_number": "{business_tin}",
        "brn_number": "{business_registration}",
        "msic_code": "{industry_code}",
        "sst_registration": "{sst_number | null}",
        "e_invoice_uuid": "{uuid_v4}",
        "digital_signature": "{base64_signature}"
      }
    },
    "seller": {
      "name": "{business_name}",
      "address": {
        "line1": "",
        "line2": "",
        "city": "",
        "state": "",
        "postcode": "",
        "country": "MYS"
      },
      "phone": "{business_phone}",
      "email": "{business_email}"
    },
    "buyer": {
      "name": "{customer_name | 'Walk-in Customer'}",
      "phone": "{customer_phone | null}",
      "tin_number": "{customer_tin | null}"
    },
    "items": [
      {
        "description": "{item_name}",
        "quantity": 1,
        "unit_price": 0.00,
        "tax_type": "SST | exempt",
        "tax_rate": 0.06,
        "tax_amount": 0.00,
        "subtotal": 0.00
      }
    ],
    "totals": {
      "subtotal": 0.00,
      "tax_total": 0.00,
      "discount": 0.00,
      "grand_total": 0.00
    }
  }
}
```

### F&B Default Values
| Field | Default |
|---|---|
| Currency | MYR |
| Tax type | SST 6% (or exempt for basic food items) |
| Buyer | "Walk-in Customer" if not specified |
| Due date | Same day (for F&B transactions) |
| MSIC Code | 56101 (Restaurants) or 56103 (Cafés) |

---

## 2. WhatsApp Auto-Reply Flow Templates

### Template A: Menu Request

```json
{
  "trigger": {
    "keywords": ["menu", "apa ada", "senarai", "what do you have", "harga"],
    "match_type": "contains_any"
  },
  "response": {
    "type": "text_with_link",
    "message": "Ini menu kami! 🍜👇\n\n{menu_items_formatted}\n\nNak order? Reply dengan nama item dan kuantiti ye 😊\n\nContoh: 'Nasi Lemak 2, Teh Tarik 1'",
    "delay_seconds": 2
  }
}
```

### Template B: Order Capture

```json
{
  "trigger": {
    "keywords": ["order", "nak", "mau", "beli", "want"],
    "match_type": "contains_any",
    "requires_menu_items": true
  },
  "response": {
    "type": "confirmation",
    "message": "Terima kasih! Ini order anda:\n\n{parsed_order_items}\n\nJumlah: RM{total}\n\n✅ Confirm?\nReply 'YES' untuk confirm atau 'EDIT' untuk tukar.",
    "on_confirm": {
      "create_order": true,
      "generate_invoice": true,
      "send_receipt": true
    }
  }
}
```

### Template C: Business Hours

```json
{
  "trigger": {
    "keywords": ["open", "buka", "tutup", "close", "hours", "masa", "time"],
    "match_type": "contains_any"
  },
  "response": {
    "type": "text",
    "message": "Kami buka {business_hours}! 😊\n\n📍 {business_address}\n\nNak tengok menu? Reply 'MENU'"
  }
}
```

### Template D: Auto-Greeting

```json
{
  "trigger": {
    "keywords": ["hi", "hello", "hai", "hey", "assalamualaikum", "oi"],
    "match_type": "starts_with_any",
    "first_message_only": true
  },
  "response": {
    "type": "text",
    "message": "Hi! 👋 Selamat datang ke {business_name}!\n\nBoleh saya bantu apa?\n\n1️⃣ Tengok Menu\n2️⃣ Buat Order\n3️⃣ Masa Operasi\n\nReply nombor atau taip terus 😊"
  }
}
```

### Template E: Post-Order Upsell

```json
{
  "trigger": {
    "event": "order_confirmed",
    "delay_seconds": 5
  },
  "response": {
    "type": "text",
    "message": "Terima kasih atas order anda! 🙏\n\n🔥 Nak tambah {recommended_item} untuk RM{price} je?\n\nReply 'TAMBAH' untuk add!\n\nAnggaran masa siap: {estimated_time} min"
  }
}
```

### Template F: Order Ready Notification

```json
{
  "trigger": {
    "event": "order_ready",
    "manual_or_auto": "manual_trigger"
  },
  "response": {
    "type": "text",
    "message": "✅ Order anda dah siap!\n\n📋 Order #{order_id}\n{order_summary}\n\n{pickup_or_delivery_instructions}\n\nTerima kasih! Jangan lupa datang lagi ya 😊"
  }
}
```

---

## 3. Menu Template Structure

```json
{
  "menu": {
    "business_id": "{uuid}",
    "last_updated": "{ISO_8601_datetime}",
    "currency": "MYR",
    "categories": [
      {
        "name": "Main / Hidangan Utama",
        "sort_order": 1,
        "items": [
          {
            "id": "{uuid}",
            "name": "Nasi Lemak",
            "description": "Nasi santan dengan sambal, ikan bilis, kacang",
            "price": 8.00,
            "tax_exempt": false,
            "available": true,
            "image_url": null
          }
        ]
      },
      {
        "name": "Drinks / Minuman",
        "sort_order": 2,
        "items": []
      },
      {
        "name": "Sides / Lauk Tambahan",
        "sort_order": 3,
        "items": []
      },
      {
        "name": "Dessert / Pencuci Mulut",
        "sort_order": 4,
        "items": []
      }
    ]
  }
}
```

---

## 4. Customer Profile Schema

```json
{
  "customer": {
    "id": "{uuid}",
    "phone": "{phone_number}",
    "name": "{name | null}",
    "source": "whatsapp | walk-in | online",
    "first_interaction": "{ISO_8601_datetime}",
    "last_interaction": "{ISO_8601_datetime}",
    "total_orders": 0,
    "total_spent": 0.00,
    "favorite_items": [],
    "tags": [],
    "notes": ""
  }
}
```
