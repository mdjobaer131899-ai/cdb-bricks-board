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
            { name: "profiles", fields: ["full_name"] },
          ],
          notes:
            "Adla items (১ নং আদলা, ২ নং আদলা, মিক্সার আদলা) are measured in ফুট. All other bricks are measured in পিস.",
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
  };
}
