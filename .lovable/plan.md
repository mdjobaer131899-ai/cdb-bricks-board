# ERP Restructure Plan

বড় পরিবর্তন — কাজগুলো ৬টি গ্রুপে ভাগ করা হয়েছে।

## 1. AI Assistant "Unauthorized" Fix (অগ্রাধিকার)
- `src/routes/api/chat.ts` বর্তমানে authentication ছাড়া call হচ্ছে। Browser থেকে Supabase bearer token পাঠানো হচ্ছে না।
- Fix: chat route handler-এ Authorization header forward করব এবং AI tools-এ `requireSupabaseAuth` middleware ব্যবহার করব, অথবা service-role admin client ব্যবহার করব (read-only tools-এর জন্য নিরাপদ)।

## 2. Dashboard সরলীকরণ
- "আজকের সারসংক্ষেপ" card বাদ
- সব chart/graph component বাদ (sparkline, top-customers chart ইত্যাদি)
- **নতুন: তারিখভিত্তিক Income/Expense Folder List**
  - প্রতি তারিখ একটি collapsible folder
  - ক্লিক করলে সেই দিনের আয় (collections + cash sales) ও ব্যয় (expenses) detail দেখাবে
  - Admin-এর জন্য প্রতিটি row-তে Edit/Delete button
- নগদ collection স্বয়ংক্রিয় income হিসেবে দেখাবে (DB trigger ইতিমধ্যে আছে — শুধু UI)

## 3. Admin Auto-Approval
- Admin role দিয়ে create করা সকল `sales_entries` সরাসরি `status='approved'` হবে
- `entries.new.tsx` ও cash-sale function-এ user role check করে status set করব
- Approval Queue থেকে admin-এর নিজের entry hide

## 4. Challan Page পরিবর্তন
- উপরের "New Entry" button সরানো
- Date filter যোগ (default: আজ)
- Filtered list দেখাবে

## 5. Contract — Customer Folder System
- `/contracts` page redesign:
  - Customer-wise group/folder (accordion)
  - Customer expand করলে তার সব contracts নিচে
- **New Contract Form সরলীকরণ:**
  - শুধু: Customer Name, Contract Date, Total Brick Quantity, Per Brick Rate
  - বাদ: Start/End/Expiry Date, Per Truck Rate
  - Auto-calc: `truck_quantity = total_bricks / 2000` (read-only)
  - Auto-calc: `total_value = quantity × rate` (read-only)
- **Contract Detail Page-এ live stats:**
  - মোট চুক্তি, মোট ট্রাক, সরবরাহকৃত (ট্রাক+ইট), অবশিষ্ট, মোট টাকা, আদায়, বকেয়া
  - সব calculation DB view থেকে (real-time)

## 6. Challan ↔ Contract Linking
- Challan approve করার সময় **Contract dropdown বাধ্যতামূলক** (যদি customer-এর active contract থাকে)
- Approve trigger automatically update করবে:
  - Contract delivered_quantity
  - Contract balance
  - Customer ledger
  - Reports (already via journal triggers from Phase 3)

## Technical Changes

**Database migrations:**
- `contracts` table: `truck_quantity` generated column বা trigger (2000 piece/truck), remove not-null on dates
- Add `delivered_quantity`, `delivered_value`, `collected_amount`, `due_amount` as a view `contract_summary`
- Trigger: sales_entry approved → update contract_summary cache (or use view, simpler)
- Trigger/policy: admin-created sales_entry auto-approved

**Frontend files:**
- `src/components/admin-dashboard.tsx` — strip charts, add date-folder list
- `src/components/manager-dashboard.tsx` — same simplification
- New: `src/components/daily-income-expense-folders.tsx`
- `src/routes/_authenticated/challans.index.tsx` — remove New Entry, add date filter
- `src/routes/_authenticated/contracts.index.tsx` — customer folder accordion
- `src/routes/_authenticated/contracts.new.tsx` — simplified form
- `src/routes/_authenticated/contracts.$id.tsx` — live stats panel
- `src/routes/_authenticated/entries.new.tsx` — require contract selection, auto-approve for admin
- `src/lib/contracts.functions.ts` — update schema (remove dates, auto-calc)
- `src/lib/cash-sale.functions.ts` — auto-approve always (already approved)
- `src/routes/api/chat.ts` — fix auth forwarding

**সংরক্ষিত:** Phase 1-4 এর accounts/journal/stock infrastructure অপরিবর্তিত থাকবে।

## কাজের ক্রম
1. AI Unauthorized fix (দ্রুত)
2. DB migration (contracts schema + auto-approve trigger + contract_summary view)
3. Contract pages (form + folder list + detail stats)
4. Challan page (filter + remove new entry + require contract)
5. Dashboard restructure (folders + remove charts)
6. Admin edit/delete UI on income-expense entries

প্রায় ১২-১৫টি ফাইল edit/create হবে। শুরু করব?
