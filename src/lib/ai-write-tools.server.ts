/**
 * Write-capable AI assistant tools. The chat system prompt requires the
 * assistant to show a summary and get the user's "হ্যাঁ" before calling these.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;
const today = () => new Date().toISOString().slice(0, 10);

async function supplierId(db: DB, name: string, material: string | null) {
  const { data: ex } = await db.from("suppliers").select("id").eq("name", name).maybeSingle();
  if (ex?.id) return ex.id as string;
  const { data, error } = await db.from("suppliers").insert({ name, material_type: material }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export function buildWriteTools(db: DB, userId: string) {
  return {
    findPeople: tool({
      description: "নাম দিয়ে সরদার, শ্রমিক/মেস্তুরি/ম্যানেজার, সাপ্লায়ার, গ্রাহক এবং পুরোনো বকেয়ার (জের) খাতা খোঁজো। এন্ট্রির আগে সঠিক id পেতে সবসময় এটা ব্যবহার করো।",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const q = `%${name.trim()}%`;
        const [s, w, sp, c, ob] = await Promise.all([
          db.from("sardars").select("id, name, kind").ilike("name", q).limit(10),
          db.from("workers").select("id, name, role").ilike("name", q).limit(10),
          db.from("suppliers").select("id, name, material_type").ilike("name", q).limit(10),
          db.from("customers").select("id, name, phone").ilike("name", q).limit(10),
          db.from("opening_balances").select("id, kind, party_name, amount, sardar:sardars(name), worker:workers(name), customer:customers(name)").limit(200),
        ]);
        const n = name.trim().toLowerCase();
        const obRows = ((ob.data ?? []) as any[]).filter((r) =>
          [r.party_name, r.sardar?.name, r.worker?.name, r.customer?.name].some((x) => x && String(x).toLowerCase().includes(n)),
        ).map((r) => ({ id: r.id, kind: r.kind, name: r.party_name ?? r.sardar?.name ?? r.worker?.name ?? r.customer?.name, amount: r.amount }));
        return { sardars: s.data ?? [], workers: w.data ?? [], suppliers: sp.data ?? [], customers: c.data ?? [], oldDues: obRows };
      },
    }),

    recordPayment: tool({
      description: "টাকা দেওয়ার এন্ট্রি (ক্যাশ থেকে কমবে)। target: sardar (সরদার, চলতি কাজ), worker (ডেলি/মেস্তুরি/ম্যানেজার), supplier (সাপ্লায়ার/ভেকু বকেয়া বা অগ্রিম), old_due (পুরোনো বকেয়া/জের পরিশোধ — opening balance id), expense (সাধারণ খরচ — category লাগবে, যেমন 'বিদ্যুৎ বিল', 'আনুষাঙ্গিক — চা নাস্তা')। ব্যবহারকারী 'হ্যাঁ' বলার পরেই কল করো।",
      inputSchema: z.object({
        target: z.enum(["sardar", "worker", "supplier", "old_due", "expense"]),
        id: z.string().nullable().describe("sardar/worker/supplier/opening balance id; expense হলে null"),
        amount: z.number(),
        date: z.string().nullable().describe("YYYY-MM-DD, না জানলে null = আজ"),
        category: z.string().nullable(),
        note: z.string().nullable(),
        advance: z.boolean().nullable().describe("সরদারের অগ্রিম হলে true"),
      }),
      execute: async ({ target, id, amount, date, category, note, advance }) => {
        if (!(amount > 0)) return { ok: false, error: "টাকার পরিমাণ সঠিক নয়" };
        const d = date || today();
        const base = { amount, payment_date: d, note: note ?? "AI সহকারী দিয়ে এন্ট্রি", created_by: userId };
        let res;
        if (target === "sardar") res = await db.from("sardar_payments").insert({ ...base, sardar_id: id!, payment_type: advance ? "advance" : "payment", method: "cash" });
        else if (target === "worker") res = await db.from("worker_payments").insert({ ...base, worker_id: id!, payment_type: "payment" });
        else if (target === "supplier") res = await db.from("supplier_payments").insert({ ...base, supplier_id: id! });
        else if (target === "old_due") res = await db.from("opening_payments").insert({ ...base, opening_balance_id: id!, method: "cash" });
        else res = await db.from("expenses").insert({ amount, expense_date: d, category: category || "আনুষাঙ্গিক", note: note ?? null, created_by: userId });
        if (res.error) return { ok: false, error: res.error.message };
        return { ok: true, saved: { target, amount, date: d } };
      },
    }),

    recordMaterialPurchase: tool({
      description: "কাঁচামাল/মালামাল/ভেকু কেনা বা বিল এন্ট্রি — মালামাল ও সাপ্লায়ার পাতায় উঠবে; paid > 0 হলে ক্যাশ থেকে কমবে। ব্যবহারকারী 'হ্যাঁ' বলার পরেই কল করো।",
      inputSchema: z.object({
        supplierName: z.string(), item: z.string(), quantity: z.number().nullable(), unit: z.string().nullable(),
        bill: z.number(), paid: z.number(), date: z.string().nullable(), note: z.string().nullable(),
      }),
      execute: async ({ supplierName, item, quantity, unit, bill, paid, date, note }) => {
        const d = date || today();
        const sid = await supplierId(db, supplierName.trim(), item);
        const qty = quantity && quantity > 0 ? quantity : 1;
        const p = await db.from("purchases").insert({ purchase_date: d, supplier_id: sid, item_name: item, quantity: qty, unit, unit_price: bill / qty, total_amount: bill, note, created_by: userId });
        if (p.error) return { ok: false, error: p.error.message };
        if (paid > 0) {
          const r = await db.from("supplier_payments").insert({ supplier_id: sid, amount: paid, payment_date: d, note: `${item} — পরিশোধ`, created_by: userId });
          if (r.error) return { ok: false, error: r.error.message };
        }
        return { ok: true, saved: { supplierName, item, bill, paid, due: bill - paid } };
      },
    }),

    recordCollection: tool({
      description: "গ্রাহকের কাছ থেকে টাকা পাওয়া (ক্যাশে যোগ হবে)। ব্যবহারকারী 'হ্যাঁ' বলার পরেই কল করো।",
      inputSchema: z.object({ customerId: z.string(), amount: z.number(), date: z.string().nullable(), method: z.string().nullable(), note: z.string().nullable() }),
      execute: async ({ customerId, amount, date, method, note }) => {
        const r = await db.from("collections").insert({ customer_id: customerId, amount, payment_date: date || today(), method: method || "cash", note, created_by: userId });
        if (r.error) return { ok: false, error: r.error.message };
        return { ok: true };
      },
    }),
  };
}
