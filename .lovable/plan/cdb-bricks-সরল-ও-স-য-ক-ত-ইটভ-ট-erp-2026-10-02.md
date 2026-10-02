# CDB Bricks — সরল ও সংযুক্ত ইটভাটা ERP

## লক্ষ্য
শুধু প্রয়োজনীয় মডিউল রেখে সবকিছু একটি হিসাবে যুক্ত করা। প্রতিটি এন্ট্রি এডিট, ডিলেট ও প্রিন্ট করা যাবে।

## যা সরানো হবে (পাতা ও তথ্য সহ স্থায়ীভাবে)
- কাঁচামাল, মজুদ (inventory), উৎপাদন খরচ রিপোর্ট
- গাড়ি, গাড়ির খরচ, ব্যাংক, ট্রান্সফার
- চুক্তি (contracts), অর্ডার, ডেলিভারি
- পুরোনো সাধারণ শ্রমিক পাতা (workers), staff-setup, ledger-heads, accounts chart ও month-closing এর UI

## যে মডিউলগুলো থাকবে / নতুন হবে
1. **কাঁচা ইট উৎপাদন (মিলভিত্তিক)** — ৪/৫টি মিল, প্রতিটির আলাদা সরদার ও রেট। দৈনিক তৈরি ইটের পরিমাণ × রেট = সরদারের পাওনা।
2. **ভাটায় ঢোকানো** — সরদার "রেজা", নিজস্ব রেট।
3. **বের করা (আনলোড)** — সরদার "আনলোড", নিজস্ব রেট; বের করা ইট বিক্রয়যোগ্য মজুদে যোগ হবে।
4. **পুড়াই মেস্তুরি** — নির্দিষ্ট মাসিক টাকা, পরিশোধ ও বাকি।
5. **ডেলি শ্রমিক** — দৈনিক হাজিরা, দৈনিক মজুরি, কত নিল ও কত বাকি।
6. **দৈনিক খরচ** — ইঞ্জিন, কারেন্ট বিল, ফুয়েলসহ যেকোনো খাত হাতে লেখা যাবে।
7. **মালামাল ক্রয় ও বাকি** — জিনিসের নাম, পরিমাণ, দাম, সরবরাহকারী; পরিশোধ ও বাকি।
8. **বিক্রয় চালান** — দৈনিক বিক্রি, চালান/ইনভয়েস প্রিন্ট।
9. **অগ্রিম ইট বিক্রয়** — পাওনাদার কত টাকা দিয়েছে, কত ইট নিয়েছে, কত বাকি (চালান থেকে স্বয়ংক্রিয় কাটবে)।
10. **মালিকের বিনিয়োগ** — ১/২ জন মালিক, কে কত দিয়েছে বা তুলেছে।
11. **ম্যানেজার বেতন** — নির্দিষ্ট মাসিক বেতন, নেওয়া ও বাকি।
12. **পূর্বের বকেয়া ও ঋণ** — আগের দেনা-পাওনা ও ঋণ দেওয়া-নেওয়া (বর্তমান পাতা বাড়ানো হবে)।
13. **আয়-ব্যয় সারসংক্ষেপ** — সব মডিউলের আয় ও ব্যয় এক জায়গায়, তারিখ অনুযায়ী ফিল্টার, প্রিন্ট।
14. **ব্যবহারকারী ও অনুমতি** — এডমিন প্রতিটি ম্যানেজারের জন্য প্রতিটি পাতা আলাদাভাবে চালু/বন্ধ করবেন।

## সংযোগ
সব টাকা দেওয়া-নেওয়া (সরদার, ডেলি, মেস্তুরি, ম্যানেজার, মালামাল, খরচ, বিক্রয়, অগ্রিম, বিনিয়োগ) একটি কেন্দ্রীয় হিসাবে যায়, ফলে "হাতে নগদ", ড্যাশবোর্ড ও আয়-ব্যয় পাতা সবসময় মিলে থাকবে। সিজনভিত্তিক আলাদা হিসাব বজায় থাকবে।

## প্রিন্ট
প্রতিটি পাতায় তালিকা প্রিন্ট বোতাম; প্রতিটি ব্যক্তির (সরদার/শ্রমিক/পাওনাদার/সরবরাহকারী) হিসাবের স্টেটমেন্ট প্রিন্ট; চালান ইনভয়েস।

## Technical details
- Migration: drop contracts, contract_payments, orders, deliveries, vehicles, vehicle_expenses, bank_accounts, bank_transactions, transfers, raw_materials, raw_material_purchases/usage, ledger_heads/entries, staff_* and related triggers/FK columns (sales_entries.contract_id/order_id/vehicle_id, production_entries material cols).
- New tables: mills (name, sardar_id), kiln_staff fixed-salary (mestri, managers: monthly_salary + salary_payments), daily_workers + attendance (reuse workers/worker_attendance with role='daily'), purchases + purchase_payments (free-text item), owners + owner_transactions, loans + loan_payments, advance_buyers via customers.advance_balance + collections, page_permissions(user_id, page_key).
- Sardars get `kind` (mill / load / unload / burn); rates per sardar via existing sardar_rates.
- Journal triggers kept/added so cash-queries aggregates all modules; admin bypasses permissions; sidebar/routes gated by page_permissions via has_page_access() RLS-safe function and client check.
- Data in removed modules is permanently deleted.
