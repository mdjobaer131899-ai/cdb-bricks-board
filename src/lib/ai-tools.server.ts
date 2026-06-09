/**
 * Read-only AI assistant tool registry.
 *
 * Every tool here MUST be read-only. To add a new tool (e.g. expenses,
 * worker_wages, fuel_logs) when new tables are introduced, append a new
 * entry to `buildAssistantTools(...)` — the chat route will pick it up
 * automatically.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const ADLA_NAMES = new Set(["১ নং আদলা", "২ নং আদলা", "মিক্সার আদলা"]);

function isAdla(name: string | null | undefined): boolean {
  if (!name) return false;
  return ADLA_NAMES.has(name) || name.includes("আদলা");
}

function unitFor(name: string | null | undefined): "পিস" | "ফুট" {
  return isAdla(name) ? "ফুট" : "পিস";
}

interface SalesRow {
  id: string;
  challan_no: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  status: string;
  sale_type: string;
  customer: { name: string } | null;
  brick: { name: string } | null;
  custom_brick_name: string | null;
}

async function fetchSalesInRange(
  supabase: DB,
  opts: { from?: string; to?: string; customerName?: string; status?: "approved" | "pending" | "all" }
): Promise<SalesRow[]> {
  let q = supabase
    .from("sales_entries")
    .select(
      "id, challan_no, sale_date, quantity, unit_price, total_amount, status, sale_type, custom_brick_name, customer:customers(name), brick:brick_types(name)"
    )
    .order("sale_date", { ascending: false })
    .limit(500);

  if (opts.from) q = q.gte("sale_date", opts.from);
  if (opts.to) q = q.lte("sale_date", opts.to);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as unknown as SalesRow[];
  if (opts.customerName) {
    const needle = opts.customerName.trim().toLowerCase();
    rows = rows.filter((r) => (r.customer?.name ?? "").toLowerCase().includes(needle));
  }
  return rows;
}

function summarizeByBrick(rows: SalesRow[]) {
  const byBrick = new Map<string, { name: string; qty: number; total: number; unit: string }>();
  for (const r of rows) {
    const name = r.brick?.name || r.custom_brick_name || "অজানা";
    const unit = unitFor(name);
    const cur = byBrick.get(name) ?? { name, qty: 0, total: 0, unit };
    cur.qty += Number(r.quantity ?? 0);
    cur.total += Number(r.total_amount ?? 0);
    byBrick.set(name, cur);
  }
  return Array.from(byBrick.values());
}

export function buildAssistantTools(supabase: DB) {
  return {
    /** List the database tables the assistant can query (future-proof discovery). */
    listAvailableData: tool({
      description:
        "List the tables and key fields the assistant has read-only access to. Useful when the user asks what kind of questions the assistant can answer.",
      inputSchema: z.object({}),
      execute: async () => {
        return {
          tables: [
            { name: "customers", fields: ["name", "phone", "address"] },
            { name: "brick_types", fields: ["name", "default_unit_price", "is_active"] },
            { name: "sales_entries", fields: ["challan_no", "sale_date", "quantity", "unit_price", "total_amount", "status", "sale_type"] },
            { name: "contracts", fields: ["contract_no", "contract_type (yearly_fixed/short_term/cash)", "booked_value", "advance_paid", "status", "expiry_date"] },
            { name: "contract_payments", fields: ["contract_id", "amount", "payment_date", "method"] },
            { name: "collections", fields: ["customer_id", "contract_id", "amount", "payment_date", "method (cash sales when contract_id is null)"] },
            { name: "expenses", fields: ["category", "amount", "expense_date", "note"] },
            { name: "profiles", fields: ["full_name"] },
          ],
          notes:
            "নগদ আয় = collections যেগুলোর contract_id null। চুক্তির আয় (contract_payments + contract-linked collections) দৈনিক আয়-ব্যয়ে গণনা হয় না। আদলা (১/২ নং, মিক্সার) — ফুট, অন্য ইট — পিস।",
        };
      },
    }),

    /** Resolve Bengali/English date phrases to actual ISO date ranges. */
    resolveDateRange: tool({
      description:
        "Convert a Bengali or English natural language date phrase (e.g. 'আজকে', 'গতকাল', 'এই সপ্তাহে', 'গত মাসে', 'this week') into an explicit ISO date range. Call this first when the user asks about a period.",
      inputSchema: z.object({
        phrase: z.string().describe("The Bengali/English phrase to resolve"),
      }),
      execute: async ({ phrase }) => {
        const today = new Date();
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const start = new Date(today);
        const end = new Date(today);
        const p = phrase.trim().toLowerCase();

        const isToday = ["আজ", "আজকে", "today"].some((k) => p.includes(k));
        const isYesterday = ["গতকাল", "কাল", "yesterday"].some((k) => p.includes(k));
        const isThisWeek = ["এই সপ্তাহ", "চলতি সপ্তাহ", "this week"].some((k) => p.includes(k));
        const isLastWeek = ["গত সপ্তাহ", "last week"].some((k) => p.includes(k));
        const isThisMonth = ["এই মাস", "চলতি মাস", "this month"].some((k) => p.includes(k));
        const isLastMonth = ["গত মাস", "last month"].some((k) => p.includes(k));
        const isThisYear = ["এই বছর", "চলতি বছর", "this year"].some((k) => p.includes(k));

        if (isYesterday) {
          start.setDate(today.getDate() - 1);
          end.setDate(today.getDate() - 1);
        } else if (isThisWeek) {
          const dow = today.getDay();
          start.setDate(today.getDate() - dow);
        } else if (isLastWeek) {
          const dow = today.getDay();
          start.setDate(today.getDate() - dow - 7);
          end.setDate(today.getDate() - dow - 1);
        } else if (isThisMonth) {
          start.setDate(1);
        } else if (isLastMonth) {
          start.setMonth(today.getMonth() - 1, 1);
          end.setMonth(today.getMonth(), 0);
        } else if (isThisYear) {
          start.setMonth(0, 1);
        } else if (isToday) {
          // default: today
        } else {
          // default fallback: today
        }
        return { from: iso(start), to: iso(end), label: phrase };
      },
    }),

    /** Daily / range sales summary. */
    getSalesSummary: tool({
      description:
        "Get a sales summary for a date range. Returns total bricks (by unit), total amount, paid (approved), pending, and breakdown by brick type. Use this for 'আজকের বিক্রি', 'এই সপ্তাহের বিক্রি' etc.",
      inputSchema: z.object({
        from: z.string().describe("ISO start date YYYY-MM-DD"),
        to: z.string().describe("ISO end date YYYY-MM-DD"),
      }),
      execute: async ({ from, to }) => {
        const rows = await fetchSalesInRange(supabase, { from, to, status: "all" });
        const breakdown = summarizeByBrick(rows);
        const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        const approvedAmount = rows.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        const pendingAmount = rows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        return {
          from,
          to,
          challan_count: rows.length,
          total_amount: totalAmount,
          approved_amount: approvedAmount,
          pending_amount: pendingAmount,
          breakdown_by_brick: breakdown,
        };
      },
    }),

    /** Per-customer summary in a date range. */
    getCustomerSummary: tool({
      description:
        "Get sales summary for a single customer in a date range. Returns quantities per brick type (with correct unit পিস/ফুট), totals, paid (approved), due (pending) and the list of challans.",
      inputSchema: z.object({
        name: z.string().describe("Customer name (partial match supported, Bengali or English)"),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
      execute: async ({ name, from, to }) => {
        const rows = await fetchSalesInRange(supabase, { from, to, customerName: name, status: "all" });
        if (rows.length === 0) return { customer: name, found: false, message: "কোন তথ্য পাওয়া যায়নি।" };
        const breakdown = summarizeByBrick(rows);
        const total = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        const paid = rows.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        const due = rows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        return {
          customer: rows[0].customer?.name ?? name,
          found: true,
          from,
          to,
          challan_count: rows.length,
          total_amount: total,
          paid_amount: paid,
          due_amount: due,
          breakdown_by_brick: breakdown,
          challans: rows.slice(0, 20).map((r) => ({
            challan_no: r.challan_no,
            date: r.sale_date,
            brick: r.brick?.name || r.custom_brick_name,
            quantity: r.quantity,
            unit: unitFor(r.brick?.name || r.custom_brick_name),
            total: r.total_amount,
            status: r.status,
          })),
        };
      },
    }),

    /** Top selling brick in a date range. */
    getTopSellingBricks: tool({
      description: "Get the top selling brick types in a date range, sorted by quantity. Returns list with name, quantity, unit and total amount.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        limit: z.number().optional().default(5),
      }),
      execute: async ({ from, to, limit }) => {
        const rows = await fetchSalesInRange(supabase, { from, to, status: "approved" });
        const breakdown = summarizeByBrick(rows).sort((a, b) => b.qty - a.qty).slice(0, limit ?? 5);
        return { from, to, top: breakdown };
      },
    }),

    /** Outstanding due across all customers or a specific customer. */
    getCustomerDue: tool({
      description: "Get outstanding due (pending challans not yet approved/paid) for a customer or for all customers.",
      inputSchema: z.object({
        name: z.string().optional().describe("Optional customer name (partial match)."),
      }),
      execute: async ({ name }) => {
        const rows = await fetchSalesInRange(supabase, { customerName: name, status: "pending" });
        if (rows.length === 0) return { found: false, message: "কোন বকেয়া পাওয়া যায়নি।" };
        const byCustomer = new Map<string, { name: string; due: number; count: number }>();
        for (const r of rows) {
          const cname = r.customer?.name ?? "অজানা";
          const cur = byCustomer.get(cname) ?? { name: cname, due: 0, count: 0 };
          cur.due += Number(r.total_amount ?? 0);
          cur.count += 1;
          byCustomer.set(cname, cur);
        }
        const list = Array.from(byCustomer.values()).sort((a, b) => b.due - a.due);
        const totalDue = list.reduce((s, c) => s + c.due, 0);
        return { found: true, total_due: totalDue, customers: list };
      },
    }),

    /** Search customers by name. */
    searchCustomers: tool({
      description: "Search customers by partial name (Bengali or English).",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, phone, address")
          .ilike("name", `%${query}%`)
          .limit(20);
        if (error) throw new Error(error.message);
        return { customers: data ?? [] };
      },
    }),

    /** List active brick types & default prices. */
    listBrickTypes: tool({
      description: "List active brick types and their default prices and units.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("brick_types")
          .select("name, default_unit_price, is_active")
          .eq("is_active", true)
          .order("name");
        if (error) throw new Error(error.message);
        const items = (data ?? []).map((b) => ({ ...b, unit: unitFor(b.name) }));
        return { brick_types: items };
      },
    }),

    /** Contracts: list active/all contracts with bookings & paid amounts. */
    getContractsSummary: tool({
      description:
        "Get a summary of contracts. Supports filtering by status (active/completed/expired) or contract_type (yearly_fixed/short_term/cash). Returns booked value, advance paid, due amount.",
      inputSchema: z.object({
        status: z.enum(["active", "completed", "expired", "all"]).optional().default("active"),
        contract_type: z.enum(["yearly_fixed", "short_term", "cash", "all"]).optional().default("all"),
        customerName: z.string().optional(),
      }),
      execute: async ({ status, contract_type, customerName }) => {
        let q = supabase
          .from("contracts")
          .select("id, contract_no, contract_type, status, booked_value, advance_paid, expiry_date, customer:customers(name)")
          .order("created_at", { ascending: false })
          .limit(200);
        if (status && status !== "all") q = q.eq("status", status);
        if (contract_type && contract_type !== "all") q = q.eq("contract_type", contract_type);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        let rows = (data ?? []) as unknown as Array<{
          id: string; contract_no: string; contract_type: string; status: string;
          booked_value: number; advance_paid: number; expiry_date: string | null;
          customer: { name: string } | null;
        }>;
        if (customerName) {
          const needle = customerName.toLowerCase();
          rows = rows.filter((r) => (r.customer?.name ?? "").toLowerCase().includes(needle));
        }
        const totalBooked = rows.reduce((s, r) => s + Number(r.booked_value || 0), 0);
        const totalPaid = rows.reduce((s, r) => s + Number(r.advance_paid || 0), 0);
        return {
          count: rows.length,
          total_booked: totalBooked,
          total_paid: totalPaid,
          total_due: Math.max(0, totalBooked - totalPaid),
          contracts: rows.map((r) => ({
            contract_no: r.contract_no,
            type: r.contract_type,
            status: r.status,
            customer: r.customer?.name ?? "—",
            booked: Number(r.booked_value || 0),
            paid: Number(r.advance_paid || 0),
            due: Math.max(0, Number(r.booked_value || 0) - Number(r.advance_paid || 0)),
            expiry_date: r.expiry_date,
          })),
        };
      },
    }),

    /** Collections summary (cash + contract). */
    getCollectionsSummary: tool({
      description:
        "Get collections (টাকা গ্রহণ) for a date range. Separates cash-sale collections (contract_id null) from contract-linked collections.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        customerName: z.string().optional(),
      }),
      execute: async ({ from, to, customerName }) => {
        const { data, error } = await supabase
          .from("collections")
          .select("amount, payment_date, method, contract_id, customer:customers(name)")
          .gte("payment_date", from)
          .lte("payment_date", to)
          .limit(1000);
        if (error) throw new Error(error.message);
        let rows = (data ?? []) as unknown as Array<{
          amount: number; payment_date: string; method: string | null;
          contract_id: string | null; customer: { name: string } | null;
        }>;
        if (customerName) {
          const needle = customerName.toLowerCase();
          rows = rows.filter((r) => (r.customer?.name ?? "").toLowerCase().includes(needle));
        }
        const cash = rows.filter((r) => !r.contract_id);
        const contract = rows.filter((r) => r.contract_id);
        return {
          from, to,
          cash_total: cash.reduce((s, r) => s + Number(r.amount || 0), 0),
          cash_count: cash.length,
          contract_total: contract.reduce((s, r) => s + Number(r.amount || 0), 0),
          contract_count: contract.length,
          grand_total: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
        };
      },
    }),

    /** Expense summary by category in a date range. */
    getExpensesSummary: tool({
      description: "Get expense (ব্যয়) totals for a date range, grouped by category.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      execute: async ({ from, to }) => {
        const { data, error } = await supabase
          .from("expenses")
          .select("category, amount, expense_date, note")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .limit(1000);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const byCat = new Map<string, number>();
        for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount || 0));
        const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
        return {
          from, to,
          total,
          count: rows.length,
          by_category: Array.from(byCat.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
        };
      },
    }),

    /** Cash box for a specific day: cash-only income − expense. */
    getCashBox: tool({
      description:
        "Get the daily cash box for a date: total cash-sale income (collections with contract_id null), total expenses, and net cash in hand. Contract money is NOT counted.",
      inputSchema: z.object({ date: z.string().describe("ISO date YYYY-MM-DD") }),
      execute: async ({ date }) => {
        const [colRes, expRes] = await Promise.all([
          supabase.from("collections").select("amount").is("contract_id", null).eq("payment_date", date),
          supabase.from("expenses").select("amount").eq("expense_date", date),
        ]);
        if (colRes.error) throw new Error(colRes.error.message);
        if (expRes.error) throw new Error(expRes.error.message);
        const income = (colRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const expense = (expRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
        return { date, cash_income: income, total_expense: expense, net_cash: income - expense };
      },
    }),

    /** Current stock balances per brick type. */
    getStockSummary: tool({
      description:
        "Get current stock (inventory) balance for each brick type from the live stock ledger. Returns items with quantity and unit (পিস/ফুট).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await (supabase as any).from("current_stock").select("brick_name, quantity");
        if (error) throw new Error(error.message);
        const items = (data ?? []).map((r: any) => ({
          brick: r.brick_name,
          quantity: Number(r.quantity || 0),
          unit: unitFor(r.brick_name),
        }));
        const total_pieces = items.filter((i: any) => i.unit === "পিস").reduce((s: number, i: any) => s + i.quantity, 0);
        return { items, total_pieces };
      },
    }),

    /** Profit & Loss summary from the double-entry journal. */
    getProfitLossSummary: tool({
      description:
        "Get overall profit & loss summary (total income, total expense, net profit) from the accounting journal. Optionally pass a date range to scope.",
      inputSchema: z.object({
        from: z.string().optional().describe("ISO start date YYYY-MM-DD"),
        to: z.string().optional().describe("ISO end date YYYY-MM-DD"),
      }),
      execute: async ({ from, to }) => {
        if (!from && !to) {
          const { data, error } = await (supabase as any).from("profit_loss_summary").select("*").single();
          if (error) throw new Error(error.message);
          return {
            scope: "all_time",
            total_income: Number(data?.total_income || 0),
            total_expense: Number(data?.total_expense || 0),
            net_profit: Number(data?.net_profit || 0),
          };
        }
        let q = (supabase as any)
          .from("journal_lines")
          .select("debit, credit, entry:journal_entries!inner(entry_date), account:accounts!inner(account_type)");
        if (from) q = q.gte("entry.entry_date", from);
        if (to) q = q.lte("entry.entry_date", to);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        let income = 0, expense = 0;
        for (const r of (data ?? []) as any[]) {
          const t = r.account?.account_type;
          const d = Number(r.debit || 0), c = Number(r.credit || 0);
          if (t === "income") income += c - d;
          if (t === "expense") expense += d - c;
        }
        return { scope: { from, to }, total_income: income, total_expense: expense, net_profit: income - expense };
      },
    }),

    /** Trial balance / chart-of-accounts balances. */
    getTrialBalance: tool({
      description: "Get trial balance: each account with its total debit, credit and current balance.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await (supabase as any)
          .from("trial_balance")
          .select("code, name, name_bn, account_type, total_debit, total_credit, balance");
        if (error) throw new Error(error.message);
        return {
          accounts: (data ?? []).map((r: any) => ({
            code: r.code,
            name: r.name_bn || r.name,
            type: r.account_type,
            debit: Number(r.total_debit || 0),
            credit: Number(r.total_credit || 0),
            balance: Number(r.balance || 0),
          })),
        };
      },
    }),
  };
}

