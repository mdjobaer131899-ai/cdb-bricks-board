# CDB Bricks ERP — Integrated Flow Restructure

এই কাজ অনেক বড় — একটি টার্নে সম্পূর্ণ করা সম্ভব নয়। আমি এটি **৪টি ফেজে** ভাগ করে করব, প্রতিটি ফেজ আলাদাভাবে পরীক্ষাযোগ্য ও স্থিতিশীল।

## বর্তমান অবস্থা (যা ইতিমধ্যে আছে)

- `customers`, `contracts`, `contract_payments`, `sales_entries`, `collections`, `expenses`, `brick_types`, `audit_logs`, `user_roles`
- Customer Ledger (ব্যাংক-স্টেটমেন্ট স্টাইল) — চুক্তি + চালান (ডেবিট), কালেকশন (ক্রেডিট)
- Global Search, Top Customers, Quick Actions
- Cash Box (নগদ বিক্রি − ব্যয়), Recent Sales, Dashboard

## যা নেই / অসম্পূর্ণ

- **Inventory / Stock table** — production ও challan-এর সাথে কানেক্টেড না
- **Contract-wise delivered/remaining quantity** — automated tracking নেই
- **Advance balance ledger entry** — কাস্টমার-লেভেলে advance pool নেই
- **Accounts ledger** (double-entry journal) — automated posting নেই
- **Production module** — নেই
- **Sales return** — নেই

## Phase 1 — Contract-Challan Sync + Advance Pool (এই টার্ন)

**লক্ষ্য:** Master flow-এর core wiring — চুক্তি বুকিং থেকে চালান পর্যন্ত automated quantity tracking এবং advance balance auto-adjust।

### Migration

1. `contracts`-এ যোগ:
   - `delivered_quantity numeric default 0` (auto-updated)
   - generated column বা trigger-based `remaining_quantity`
2. `customers`-এ যোগ:
   - `advance_balance numeric default 0` (running pool)
3. **Triggers:**
   - `sales_entries` INSERT/UPDATE/DELETE (status=approved) → `contracts.delivered_quantity` auto-update যখন `contract_id` set
   - `collections` INSERT/DELETE → যদি কোনো contract না থাকে এবং note='advance' হয়, `customers.advance_balance` বাড়াবে
   - `sales_entries` approve হলে → যদি `customer.advance_balance > 0`, প্রথমে সেটা থেকে কেটে নেবে এবং একটি system collection row তৈরি করবে (auto-adjustment)
4. Validation trigger: challan quantity > contract remaining হলে error

### UI updates

- **Contract page** (`contracts.$id.tsx`): দেখাবে Contract Qty / Delivered / Remaining / Value / Collected / Outstanding — progress bar সহ
- **Challan form** (`entries.new.tsx`): customer select → active contracts dropdown (with remaining qty) → contract auto-select → over-delivery warning
- **Customer profile**: Total Contract Qty / Delivered / Remaining / Sales / Collections / **Advance Balance** / Due cards যোগ
- **Cash Sale shortcut**: Quick Actions থেকে এক ক্লিকে challan + collection একসাথে create (existing createCollection + createSale flow combine)

### Files

- New migration (triggers + columns + grants)
- Edit: `src/routes/_authenticated/contracts.$id.tsx`, `entries.new.tsx`, `customers.$id.tsx`
- Edit: `src/components/customer-ledger.tsx` (advance auto-adjust rows show)
- New: `src/lib/cash-sale.functions.ts` (atomic cash sale: challan + collection)

## Phase 2 — Inventory & Production Module

- New tables: `stock_ledger` (brick_type_id, qty, direction, ref_type, ref_id), `production_entries`
- Triggers: production → stock+, approved challan → stock−, sales return → stock+
- New routes: `/production`, `/inventory`
- Dashboard: Current Stock card per brick type
- Low-stock alerts

## Phase 3 — Accounts / Journal Module

- New tables: `accounts` (chart of accounts), `journal_entries`, `journal_lines` (double-entry)
- Auto-post triggers:
  - Sale approved → Dr Customer / Cr Sales
  - Collection → Dr Cash|Bank / Cr Customer
  - Advance → Dr Cash|Bank / Cr Advance Liability
  - Expense → Dr Expense / Cr Cash|Bank
- New route: `/accounts/ledger`, `/accounts/journal`
- Trial Balance + P&L reports

## Phase 4 — Sales Return + Reports + Polish

- Sales return module (reverses stock, ledger, accounts)
- Comprehensive reports: customer outstanding, contract status, daily sales, stock movement
- Edit/delete cascade audit
- Real-time sync verification across modules

---

## এই টার্নে আমি Phase 1 implement করব

Phase 1 সম্পন্ন হলে ERP-এর core integrated flow কাজ করবে (Customer → Contract → Challan → Auto-Sales → Collection → Advance auto-adjust → Ledger)। তারপর Phase 2/3/4 ধাপে এগোব।

**অনুমতি দিলে শুরু করছি।**
