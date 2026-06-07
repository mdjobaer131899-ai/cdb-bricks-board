## CDB Bricks ERP — Multi-Contract Booking & Ledger Module

এটি অনেক বড় একটি এন্টারপ্রাইজ মডিউল। একসাথে সব বানালে স্থিতিশীলতা ও মান দুটোই নষ্ট হবে। তাই আমি **৪টি ফেইজে** ভাগ করে কাজ করতে চাই — প্রতি ফেইজ আলাদাভাবে টেস্ট করে পরের ফেইজে যাব।

বর্তমান অ্যাপে আছে: `customers`, `brick_types`, `sales_entries` (single flat sale, advance/regular type), `user_roles` (admin/manager)। নতুন কাঠামো সেটির উপরই বসবে — পুরনো ডাটা নষ্ট হবে না।

---

### ফেইজ ১ — Contract Foundation (এই PR-এ)

**ডাটাবেস (নতুন টেবিল):**
- `contracts` — id, customer_id, contract_no (auto), contract_type (`yearly_fixed` / `short_term` / `cash`), start_date, expiry_date, fixed_rate (nullable), booked_quantity, booked_value, advance_paid, delivered_quantity (computed), priority (int), status (`active`/`completed`/`expired`/`suspended`), notes, created_by, approved_by
- `contract_payments` — contract_id, amount, payment_date, method, note, created_by (অ্যাডভান্স ও অতিরিক্ত পেমেন্ট ট্র্যাক)
- `audit_logs` — user_id, action, entity_type, entity_id, old_value (jsonb), new_value (jsonb), ip, device, created_at
- `sales_entries`-এ যোগ হবে: `contract_id` (nullable FK) — কোন কন্ট্র্যাক্ট থেকে ডেলিভারি হয়েছে। পুরনো রো nullable থাকবে।
- RLS: admin সব দেখতে/বদলাতে পারবে; manager তার তৈরি contract দেখতে+অ্যাডভান্স যোগ করতে পারবে; rate/status admin-only।
- Trigger: contract expiry অটো-মার্ক (cron daily); audit log auto-insert via trigger।

**UI (Bengali, Corporate Blue + Slate theme — ইতিমধ্যেই আছে):**
- `/contracts` — কাস্টমার-ভিত্তিক কন্ট্র্যাক্ট লিস্ট, type ফিল্টার, status badge, utilization %
- `/contracts/new` — ৩টি ট্যাব: Yearly Fixed / Short-Term / Cash Account; ফর্ম ভ্যালিডেশন (zod)
- `/contracts/$id` — Customer 360 lite: contract details, utilization progress, payment history, delivery history, ledger summary, PDF/Excel export বোতাম

### ফেইজ ২ — Delivery Approval Multi-Select

- `/approvals`-এ চালান অনুমোদনের সময় কাস্টমারের সব active contract দেখানো হবে, admin একটি select করবেন
- "Auto-select highest priority" টগল
- Cash sale select করলে `contract_id = null` (cash account contract) — কোনো কন্ট্র্যাক্ট থেকে কাটবে না
- Rate lock enforcement: yearly contract সিলেক্ট হলে `unit_price` অটো-লক হয়ে যাবে; admin override → audit log

### ফেইজ ৩ — Ledger & Customer 360

- কাস্টমার পেজে ট্যাব: Master / Yearly / Short-Term / Cash ledgers
- প্রতি কন্ট্র্যাক্টের আলাদা ledger view (advance, deliveries, balance)
- Contract Utilization Dashboard (admin home-এ widget)
- Expiry alert badge (7/3/0 দিন)

### ফেইজ ৪ — Reports, Exports, Audit Viewer

- ১১টি রিপোর্ট (Contract Summary, Utilization, Active, Expired, ইত্যাদি) — PDF/Excel/Print
- Audit log viewer (admin-only)
- Bengali PDF invoice template

---

### Technical Details

```text
contracts (1) ──< sales_entries (delivery deducts qty/value)
contracts (1) ──< contract_payments (advances + extra)
customers (1) ──< contracts (many, concurrent)
```

- Stack: TanStack Start + createServerFn (existing); সব mutation server-fn দিয়ে; admin actions middleware-gated
- Contract no auto-gen: `YF-2026-0001` / `ST-2026-0001` / `CS-2026-0001`
- Bengali number/date formatting `src/lib/format.ts`-এ আছে — সব নতুন UI সেটাই ব্যবহার করবে
- Existing `sales_entries` deprecated হবে না — backward-compatible

---

### এই Plan-এ অনুমোদন চাই

আমি শুধু **ফেইজ ১** এখন বানাব (contracts টেবিল + পেজ + sales_entries.contract_id কলাম)। ফেইজ ১ আপনার কাছে ভালো লাগলে ও টেস্ট হলে পরের ফেইজে যাব।

**প্রশ্ন:**
1. Contract number format ঠিক আছে (`YF-2026-0001`)?
2. একজন customer-এর জন্য একই type-এর একাধিক active contract allow করব (যেমন ২টা yearly একসাথে)? নাকি একটাই active?
3. Cash sale-এর জন্য কি প্রতি customer-এ একটাই permanent "Cash Account" contract auto-create হবে, নাকি প্রতি cash sale আলাদা one-off contract?

আপনার উত্তর পেলে ফেইজ ১ শুরু করব।