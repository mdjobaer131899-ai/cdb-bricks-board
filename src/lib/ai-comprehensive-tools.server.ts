import { tool } from "ai";
import { z } from "zod";

type SupabaseAdmin = any;

type DateConfig = {
  column: string;
  searchColumns?: string[];
};

const DATASETS: Record<string, DateConfig> = {
  customers: {
    column: "created_at",
    searchColumns: ["name", "phone", "address"],
  },
  workers: {
    column: "created_at",
    searchColumns: ["name", "phone", "role"],
  },
  sardars: {
    column: "created_at",
    searchColumns: ["name", "phone", "mill_name", "kind"],
  },
  suppliers: {
    column: "created_at",
    searchColumns: ["name", "phone", "material_type"],
  },
  owners: {
    column: "created_at",
    searchColumns: ["name", "phone"],
  },
  brick_types: {
    column: "created_at",
    searchColumns: ["name", "description"],
  },
  raw_materials: {
    column: "created_at",
    searchColumns: ["name", "unit"],
  },
  vehicles: {
    column: "created_at",
    searchColumns: ["vehicle_no", "driver_name", "type"],
  },
  seasons: {
    column: "start_date",
    searchColumns: ["name", "note"],
  },
  sales_entries: {
    column: "sale_date",
    searchColumns: ["challan_no", "vehicle_number", "driver_name", "custom_brick_name"],
  },
  collections: {
    column: "payment_date",
    searchColumns: ["method", "note"],
  },
  expenses: {
    column: "expense_date",
    searchColumns: ["category", "note"],
  },
  purchases: {
    column: "purchase_date",
    searchColumns: ["item_name", "note"],
  },
  raw_material_purchases: {
    column: "purchase_date",
    searchColumns: ["supplier_name", "note"],
  },
  production_entries: {
    column: "production_date",
    searchColumns: ["notes"],
  },
  deliveries: {
    column: "delivery_date",
    searchColumns: ["driver_name", "note"],
  },
  orders: {
    column: "order_date",
    searchColumns: ["order_no", "status", "note"],
  },
  contracts: {
    column: "start_date",
    searchColumns: ["contract_no", "status", "notes"],
  },
  loans: {
    column: "loan_date",
    searchColumns: ["party_name", "direction", "note"],
  },
  loan_payments: {
    column: "payment_date",
    searchColumns: ["note"],
  },
  sardar_work_entries: {
    column: "entry_date",
    searchColumns: ["note"],
  },
  sardar_payments: {
    column: "payment_date",
    searchColumns: ["payment_type", "method", "note"],
  },
  worker_attendance: {
    column: "date",
    searchColumns: ["note"],
  },
  worker_payments: {
    column: "payment_date",
    searchColumns: ["payment_type", "note"],
  },
  supplier_payments: {
    column: "payment_date",
    searchColumns: ["note"],
  },
  owner_transactions: {
    column: "txn_date",
    searchColumns: ["txn_type", "note"],
  },
  bank_transactions: {
    column: "txn_date",
    searchColumns: ["direction", "method", "note"],
  },
  transfers: {
    column: "transfer_date",
    searchColumns: ["from_type", "to_type", "note"],
  },
  vehicle_expenses: {
    column: "expense_date",
    searchColumns: ["category", "note"],
  },
  journal_entries: {
    column: "entry_date",
    searchColumns: ["entry_no", "narration", "source"],
  },
  opening_balances: {
    column: "as_of_date",
    searchColumns: ["party_name", "category", "note"],
  },
};

const VIEW_DATASETS = [
  "current_stock",
  "raw_material_stock",
  "sardar_balances",
  "opening_balance_summary",
  "contract_summary",
  "account_balances",
  "trial_balance",
  "profit_loss_summary",
];

const ROLE_TABLE_ACCESS: Record<string, string[]> = {
  admin: Object.keys(DATASETS).concat(VIEW_DATASETS),
  manager: [
    "customers",
    "workers",
    "sardars",
    "suppliers",
    "sales_entries",
    "collections",
    "expenses",
    "purchases",
    "raw_material_purchases",
    "sardar_work_entries",
    "sardar_payments",
    "worker_attendance",
    "worker_payments",
    "supplier_payments",
    "owner_transactions",
    "vehicle_expenses",
    "opening_balances",
    "current_stock",
    "sardar_balances",
    "profit_loss_summary",
  ],
};

function getAllowedDatasetsForRole(userRoles: string[]) {
  const normalizedRoles = new Set(
    (userRoles || []).map((role) => String(role || "").trim().toLowerCase()).filter(Boolean),
  );
  const allowed = new Set<string>();

  for (const role of normalizedRoles) {
    const tables = ROLE_TABLE_ACCESS[role] || [];
    for (const table of tables) allowed.add(table);
  }

  return [...allowed].sort();
}

const SUM_FIELDS: Record<string, string[]> = {
  sales_entries: ["quantity", "total_amount"],
  collections: ["amount"],
  expenses: ["amount"],
  purchases: ["quantity", "total_amount"],
  raw_material_purchases: ["quantity", "total_amount"],
  production_entries: ["quantity", "total_cost"],
  deliveries: ["quantity"],
  orders: ["quantity", "delivered_quantity", "remaining_quantity", "advance"],
  contracts: ["booked_quantity", "booked_value", "delivered_quantity", "advance_paid"],
  loans: ["amount"],
  loan_payments: ["amount"],
  sardar_work_entries: ["quantity", "amount"],
  sardar_payments: ["amount"],
  worker_attendance: ["advance_paid", "overtime_hours"],
  worker_payments: ["amount"],
  supplier_payments: ["amount"],
  owner_transactions: ["amount"],
  bank_transactions: ["amount"],
  transfers: ["amount"],
  vehicle_expenses: ["amount"],
  opening_balances: ["amount"],
  current_stock: ["quantity"],
  raw_material_stock: ["in_stock", "purchased_qty", "used_qty", "purchased_amount"],
  sardar_balances: ["total_quantity", "total_due", "total_paid", "total_advance", "balance"],
  opening_balance_summary: ["amount", "paid_amount", "remaining_amount"],
  contract_summary: [
    "booked_quantity",
    "booked_value",
    "delivered_quantity",
    "delivered_value",
    "collected_amount",
    "due_amount",
  ],
  profit_loss_summary: ["total_income", "total_expense", "net_profit"],
};

function sumRows(rows: any[], fields: string[]) {
  const result: Record<string, number> = {};

  for (const field of fields) {
    result[field] = rows.reduce((total, row) => {
      const value = Number(row?.[field] ?? 0);

      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  return result;
}

function applySearch(query: any, dataset: string, search?: string | null) {
  if (!search?.trim()) {
    return query;
  }

  const columns = DATASETS[dataset]?.searchColumns ?? [];

  if (columns.length === 0) {
    return query;
  }

  const safeSearch = search.trim().replace(/[%(),]/g, "");

  const expression = columns.map((column) => `${column}.ilike.%${safeSearch}%`).join(",");

  return query.or(expression);
}

async function fetchNames(supabase: SupabaseAdmin, table: string, ids: string[]) {
  if (!ids.length) {
    return new Map<string, string>();
  }

  const { data } = await supabase.from(table).select("id,name").in("id", ids);

  return new Map<string, string>((data ?? []).map((row: any) => [row.id, row.name]));
}

async function enrichRows(supabase: SupabaseAdmin, dataset: string, rows: any[]) {
  if (!rows.length) {
    return rows;
  }

  if (dataset === "sales_entries" || dataset === "orders" || dataset === "collections") {
    const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];

    const customers = await fetchNames(supabase, "customers", customerIds);

    return rows.map((row) => ({
      ...row,
      customer_name: row.customer_id ? (customers.get(row.customer_id) ?? null) : null,
    }));
  }

  if (dataset === "sardar_work_entries" || dataset === "sardar_payments") {
    const sardarIds = [...new Set(rows.map((row) => row.sardar_id).filter(Boolean))];

    const sardars = await fetchNames(supabase, "sardars", sardarIds);

    return rows.map((row) => ({
      ...row,
      sardar_name: row.sardar_id ? (sardars.get(row.sardar_id) ?? null) : null,
    }));
  }

  if (dataset === "worker_attendance" || dataset === "worker_payments") {
    const workerIds = [...new Set(rows.map((row) => row.worker_id).filter(Boolean))];

    const workers = await fetchNames(supabase, "workers", workerIds);

    return rows.map((row) => ({
      ...row,
      worker_name: row.worker_id ? (workers.get(row.worker_id) ?? null) : null,
    }));
  }

  return rows;
}

const DataInput = z.object({
  dataset: z.string(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(100),
});

export function buildComprehensiveAssistantTools(
  supabase: SupabaseAdmin,
  seasonContext?: {
    id?: string | null;
    name?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  userRoles: string[] = [],
) {
  const allowedDatasets = getAllowedDatasetsForRole(userRoles);

  return {
    getRoleAccessSummary: tool({
      description:
        "চলমান ব্যবহারকারীর role অনুযায়ী কোন কোন table বা view দেখা যাবে তা জানায়। AI-কে এই access scope মেনে চলতে সাহায্য করে।",
      inputSchema: z.object({}),
      execute: async () => ({
        roles: userRoles,
        allowedTables: allowedDatasets,
        deniedTables: [...new Set(Object.keys(DATASETS).concat(VIEW_DATASETS))].filter(
          (table) => !allowedDatasets.includes(table),
        ),
      }),
    }),

    listAvailableData: tool({
      description:
        "ডাটাবেসে কোন কোন data table এবং view আছে তা দেখায়। প্রশ্নের dataset জানা না থাকলে আগে এটি ব্যবহার করবে।",
      inputSchema: z.object({}),
      execute: async () => ({
        tables: Object.keys(DATASETS),
        views: VIEW_DATASETS,
        activeSeason: seasonContext ?? null,
        allowedTables: allowedDatasets,
      }),
    }),

    listSeasons: tool({
      description: "সকল মৌসুমের নাম, তারিখ এবং active status দেখায়।",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(50),
      }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("seasons")
          .select("id,name,start_date,end_date,is_active,target_production,note")
          .order("start_date", { ascending: false })
          .limit(limit);

        if (error) {
          throw new Error(error.message);
        }

        return {
          count: data?.length ?? 0,
          rows: data ?? [],
        };
      },
    }),

    countRecords: tool({
      description:
        "অনুমোদিত table বা view-তে মোট কতটি record আছে তা গণনা করে। নির্দিষ্ট from/to না থাকলে বর্তমান মৌসুম অনুযায়ী গণনা করবে।",
      inputSchema: z.object({
        dataset: z.string(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        search: z.string().nullable().optional(),
      }),
      execute: async ({ dataset, from, to, search }) => {
        if (!DATASETS[dataset] && !VIEW_DATASETS.includes(dataset)) {
          throw new Error(`অনুমোদিত dataset নয়: ${dataset}`);
        }

        let query = supabase.from(dataset).select("*", {
          count: "exact",
          head: true,
        });

        const dateConfig = DATASETS[dataset];

        const effectiveFrom = from ?? (dateConfig ? seasonContext?.startDate : null);

        const effectiveTo = to ?? (dateConfig ? seasonContext?.endDate : null);

        if (dateConfig && effectiveFrom) {
          query = query.gte(dateConfig.column, effectiveFrom);
        }

        if (dateConfig && effectiveTo) {
          query = query.lte(dateConfig.column, effectiveTo);
        }

        query = applySearch(query, dataset, search);

        const { count, error } = await query;

        if (error) {
          throw new Error(error.message);
        }

        return {
          dataset,
          count: count ?? 0,
          scope: {
            from: effectiveFrom ?? null,
            to: effectiveTo ?? null,
            season: seasonContext ?? null,
          },
        };
      },
    }),

    getBusinessData: tool({
      description:
        "প্রশ্ন অনুযায়ী অনুমোদিত table বা view থেকে প্রকৃত data, record count এবং totals দেয়। কোনো তথ্য অনুমান করবে না।",
      inputSchema: DataInput,
      execute: async ({ dataset, from, to, search, limit }) => {
        if (!DATASETS[dataset] && !VIEW_DATASETS.includes(dataset)) {
          throw new Error(`অনুমোদিত dataset নয়: ${dataset}`);
        }

        let query = supabase.from(dataset).select("*");

        const dateConfig = DATASETS[dataset];

        const effectiveFrom = from ?? (dateConfig ? seasonContext?.startDate : null);

        const effectiveTo = to ?? (dateConfig ? seasonContext?.endDate : null);

        if (dateConfig && effectiveFrom) {
          query = query.gte(dateConfig.column, effectiveFrom);
        }

        if (dateConfig && effectiveTo) {
          query = query.lte(dateConfig.column, effectiveTo);
        }

        query = applySearch(query, dataset, search);

        const { data, error } = await query
          .order(dateConfig?.column ?? "id", { ascending: false })
          .limit(limit);

        if (error) {
          throw new Error(error.message);
        }

        const rows = await enrichRows(supabase, dataset, data ?? []);

        return {
          dataset,
          count: rows.length,
          rows,
          totals: sumRows(rows, SUM_FIELDS[dataset] ?? []),
          scope: {
            from: effectiveFrom ?? null,
            to: effectiveTo ?? null,
            season: seasonContext ?? null,
          },
        };
      },
    }),

    searchEntityDetails: tool({
      description:
        "কোনও customer, worker, sardar, supplier, বা business party-এর নাম দিয়ে সম্পর্কিত ডেটা খুঁজে দেয়। ব্যবহারকারীর প্রশ্নে নাম/ব্যক্তি উল্লেখ থাকলে এই tool ব্যবহার করবে।",
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .describe("Search term like customer name, worker name, sardar name, supplier name"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ term, limit }) => {
        const cleanTerm = term.trim();
        if (!cleanTerm) {
          return { customers: [], workers: [], sardars: [], suppliers: [] };
        }

        const likeTerm = `%${cleanTerm}%`;
        const [customers, workers, sardars, suppliers] = await Promise.all([
          supabase
            .from("customers")
            .select("id,name,phone,address,created_at")
            .or(`name.ilike.${likeTerm},phone.ilike.${likeTerm},address.ilike.${likeTerm}`)
            .limit(limit),
          supabase
            .from("workers")
            .select("id,name,role,phone,active,created_at")
            .or(`name.ilike.${likeTerm},role.ilike.${likeTerm},phone.ilike.${likeTerm}`)
            .limit(limit),
          supabase
            .from("sardars")
            .select("id,name,kind,phone,mill_name,created_at")
            .or(
              `name.ilike.${likeTerm},kind.ilike.${likeTerm},phone.ilike.${likeTerm},mill_name.ilike.${likeTerm}`,
            )
            .limit(limit),
          supabase
            .from("suppliers")
            .select("id,name,material_type,phone,created_at")
            .or(`name.ilike.${likeTerm},material_type.ilike.${likeTerm},phone.ilike.${likeTerm}`)
            .limit(limit),
        ]);

        const entitySummaries = {
          customers: customers.data ?? [],
          workers: workers.data ?? [],
          sardars: sardars.data ?? [],
          suppliers: suppliers.data ?? [],
        };

        return {
          term: cleanTerm,
          ...entitySummaries,
        };
      },
    }),

    getTableSnapshot: tool({
      description:
        "নির্বাচিত business tables-এর সাম্প্রতিক 20টি রেকর্ড ও count নিয়ে একটি compact snapshot দেয়। এটি ব্যবহারকারী যখন 'সবকিছু', 'সর্বশেষ', বা 'টেবিলের চেক' জানতে চায় তখন ব্যবহার করবে।",
      inputSchema: z.object({
        tables: z
          .array(z.string())
          .default([
            "customers",
            "workers",
            "sardars",
            "suppliers",
            "sales_entries",
            "collections",
            "expenses",
            "purchases",
            "sardar_payments",
            "worker_payments",
          ]),
      }),
      execute: async ({ tables }) => {
        const snapshots: Record<string, any> = {};

        for (const table of tables) {
          if (!allowedDatasets.includes(table)) {
            snapshots[table] = { error: "এই table-এ আপনার পেরমিশন নেই।" };
            continue;
          }

          const dateConfig = DATASETS[table];
          const [countRes, rowsRes] = await Promise.all([
            supabase.from(table).select("id", { count: "exact", head: true }),
            supabase
              .from(table)
              .select("*")
              .order(dateConfig?.column ?? "id", { ascending: false })
              .limit(20),
          ]);

          if (countRes.error) {
            snapshots[table] = { error: countRes.error.message };
            continue;
          }

          snapshots[table] = {
            count: countRes.count ?? 0,
            recent_rows: rowsRes.data ?? [],
          };
        }

        return snapshots;
      },
    }),

    getTableDetailReport: tool({
      description:
        "একটি নির্দিষ্ট data table-এর count, totals, এবং recent rows ফেরত দেয়; date range, search, limit দিয়ে প্রকৃত ডেটা যাচাই করে।",
      inputSchema: z.object({
        table: z.string(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        search: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ table, from, to, search, limit }) => {
        if (!allowedDatasets.includes(table)) {
          throw new Error(`এই table-এ আপনার access নেই: ${table}`);
        }

        if (!DATASETS[table] && !VIEW_DATASETS.includes(table)) {
          throw new Error(`অবৈধ table: ${table}`);
        }

        let query = supabase.from(table).select("*");
        const dateConfig = DATASETS[table];
        const effectiveFrom = from ?? (dateConfig ? seasonContext?.startDate : null);
        const effectiveTo = to ?? (dateConfig ? seasonContext?.endDate : null);

        if (dateConfig && effectiveFrom) query = query.gte(dateConfig.column, effectiveFrom);
        if (dateConfig && effectiveTo) query = query.lte(dateConfig.column, effectiveTo);
        if (search?.trim()) query = applySearch(query, table, search);

        const { data, error } = await query
          .order(dateConfig?.column ?? "id", { ascending: false })
          .limit(limit);

        if (error) throw new Error(error.message);

        const rows = await enrichRows(supabase, table, data ?? []);

        return {
          table,
          count: rows.length,
          totals: sumRows(rows, SUM_FIELDS[table] ?? []),
          rows,
          scope: {
            from: effectiveFrom ?? null,
            to: effectiveTo ?? null,
            season: seasonContext ?? null,
          },
        };
      },
    }),

    getBusinessOverview: tool({
      description:
        "ব্যবসার সামগ্রিক অবস্থান—customer count, worker count, sardar count, supplier list, sales amount, collection amount, expense amount, current stock, outstanding dues, and net profit summary—একসাথে দেয়। ব্যবহারকারী 'সবকিছু', 'সামগ্রিক', 'ড্যাশবোর্ড', 'এন্টারপ্রাইজ স্ট্যাটাস' বলতে চাইলে এটি ব্যবহার করবে।",
      inputSchema: z.object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      }),
      execute: async ({ from, to }) => {
        const effectiveFrom = from ?? seasonContext?.startDate ?? null;
        const effectiveTo = to ?? seasonContext?.endDate ?? null;

        const [customers, workers, sardars, suppliers, sales, collections, expenses, stock, balances] =
          await Promise.all([
            supabase.from("customers").select("id", { count: "exact", head: true }),
            supabase.from("workers").select("id", { count: "exact", head: true }),
            supabase.from("sardars").select("id", { count: "exact", head: true }),
            supabase.from("suppliers").select("id", { count: "exact", head: true }),
            supabase
              .from("sales_entries")
              .select("quantity,total_amount")
              .gte("sale_date", effectiveFrom ?? "1970-01-01")
              .lte("sale_date", effectiveTo ?? "2999-12-31"),
            supabase
              .from("collections")
              .select("amount")
              .gte("payment_date", effectiveFrom ?? "1970-01-01")
              .lte("payment_date", effectiveTo ?? "2999-12-31"),
            supabase
              .from("expenses")
              .select("amount")
              .gte("expense_date", effectiveFrom ?? "1970-01-01")
              .lte("expense_date", effectiveTo ?? "2999-12-31"),
            supabase.from("current_stock").select("quantity,price_per_unit").limit(200),
            supabase
              .from("sardar_balances")
              .select("total_due,total_paid,total_advance,balance")
              .limit(200),
          ]);

        const totalSales = (sales.data ?? []).reduce(
          (sum, row) => sum + Number(row.total_amount ?? 0),
          0,
        );
        const totalCollections = (collections.data ?? []).reduce(
          (sum, row) => sum + Number(row.amount ?? 0),
          0,
        );
        const totalExpenses = (expenses.data ?? []).reduce(
          (sum, row) => sum + Number(row.amount ?? 0),
          0,
        );
        const totalStockQty = (stock.data ?? []).reduce(
          (sum, row) => sum + Number(row.quantity ?? 0),
          0,
        );
        const totalStockValue = (stock.data ?? []).reduce(
          (sum, row) => sum + Number(row.quantity ?? 0) * Number(row.price_per_unit ?? 0),
          0,
        );
        const totalSardarDue = (balances.data ?? []).reduce(
          (sum, row) => sum + Number(row.total_due ?? row.balance ?? 0),
          0,
        );

        return {
          scope: {
            from: effectiveFrom,
            to: effectiveTo,
            season: seasonContext ?? null,
          },
          counts: {
            customers: customers.count ?? 0,
            workers: workers.count ?? 0,
            sardars: sardars.count ?? 0,
            suppliers: suppliers.count ?? 0,
          },
          totals: {
            sales_amount: totalSales,
            collection_amount: totalCollections,
            expense_amount: totalExpenses,
            current_stock_qty: totalStockQty,
            current_stock_value: totalStockValue,
            sardar_outstanding_due: totalSardarDue,
          },
          stock_rows: stock.data ?? [],
          balances_rows: balances.data ?? [],
        };
      },
    }),

    verifyDatabaseAnswer: tool({
      description:
        "একটি reported count/total/summary সত্যি ডাটাবেস থেকে এসেছে কিনা তা পুনরায় query করে যাচাই করে। AI-কে 'আমি নিশ্চিত করছি' বা 'কত' প্রশ্নের উত্তর finalize করার আগে এই tool ব্যবহার করতে হবে।",
      inputSchema: z.object({
        dataset: z.string(),
        metric: z.enum(["count", "sum", "latest"]).default("count"),
        field: z.string().nullable().optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        search: z.string().nullable().optional(),
      }),
      execute: async ({ dataset, metric, field, from, to, search }) => {
        if (!allowedDatasets.includes(dataset)) {
          throw new Error(`এই dataset-এ আপনার access নেই: ${dataset}`);
        }

        const dateConfig = DATASETS[dataset];
        let query = supabase.from(dataset).select(field && metric === "sum" ? field : "*");

        const effectiveFrom = from ?? (dateConfig ? seasonContext?.startDate : null);
        const effectiveTo = to ?? (dateConfig ? seasonContext?.endDate : null);

        if (dateConfig && effectiveFrom) query = query.gte(dateConfig.column, effectiveFrom);
        if (dateConfig && effectiveTo) query = query.lte(dateConfig.column, effectiveTo);
        if (search?.trim()) query = applySearch(query, dataset, search);

        const { data, error } = await query.order(dateConfig?.column ?? "id", { ascending: false }).limit(1000);
        if (error) throw new Error(error.message);

        if (metric === "count") {
          return { dataset, metric, actual: data?.length ?? 0, source: "database", scope: { from: effectiveFrom ?? null, to: effectiveTo ?? null } };
        }

        if (metric === "sum") {
          const targetField = field || "amount";
          const actual = (data ?? []).reduce((sum, row) => sum + Number(row?.[targetField] ?? 0), 0);
          return { dataset, metric, field: targetField, actual, source: "database", scope: { from: effectiveFrom ?? null, to: effectiveTo ?? null } };
        }

        return {
          dataset,
          metric: "latest",
          actual: data?.[0] ?? null,
          source: "database",
          scope: { from: effectiveFrom ?? null, to: effectiveTo ?? null },
        };
      },
    }),

    getDashboardSummary: tool({
      description:
        "শুধুমাত্র ব্যবহারকারী স্পষ্টভাবে 'ড্যাশবোর্ড সারাংশ', 'সামগ্রিক সারাংশ' অথবা 'সব কিছুর সারাংশ' চাইলে এই tool ব্যবহার করবে। কোনো একক প্রশ্নের জন্য এটি ব্যবহার করবে না।",
      inputSchema: z.object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      }),
      execute: async ({ from, to }) => {
        const datasets = [
          "sales_entries",
          "collections",
          "expenses",
          "production_entries",
          "sardar_payments",
          "worker_payments",
        ];

        const result: Record<string, unknown> = {};

        for (const dataset of datasets) {
          const dateConfig = DATASETS[dataset];

          let query = supabase.from(dataset).select("*");

          const effectiveFrom = from ?? seasonContext?.startDate;

          const effectiveTo = to ?? seasonContext?.endDate;

          if (effectiveFrom) {
            query = query.gte(dateConfig.column, effectiveFrom);
          }

          if (effectiveTo) {
            query = query.lte(dateConfig.column, effectiveTo);
          }

          const { data, error } = await query.limit(10000);

          if (error) {
            throw new Error(error.message);
          }

          result[dataset] = {
            count: data?.length ?? 0,
            totals: sumRows(data ?? [], SUM_FIELDS[dataset] ?? []),
          };
        }

        const { data: stock, error: stockError } = await supabase.from("current_stock").select("*");

        if (stockError) {
          throw new Error(stockError.message);
        }

        result.current_stock = {
          count: stock?.length ?? 0,
          totals: sumRows(stock ?? [], ["quantity"]),
          rows: stock ?? [],
        };

        const { data: balances, error: balanceError } = await supabase
          .from("sardar_balances")
          .select("*");

        if (balanceError) {
          throw new Error(balanceError.message);
        }

        result.sardar_balances = {
          count: balances?.length ?? 0,
          totals: sumRows(balances ?? [], ["total_due", "total_paid", "total_advance", "balance"]),
          rows: balances ?? [],
        };

        return {
          scope: {
            from: from ?? seasonContext?.startDate ?? null,
            to: to ?? seasonContext?.endDate ?? null,
            season: seasonContext ?? null,
          },
          result,
        };
      },
    }),

    getProfitLossSummary: tool({
      description: "profit_loss_summary view থেকে মোট income, expense এবং net profit দেখায়।",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase.from("profit_loss_summary").select("*").limit(1);

        if (error) {
          throw new Error(error.message);
        }

        return {
          count: data?.length ?? 0,
          row: data?.[0] ?? null,
          season: seasonContext ?? null,
        };
      },
    }),
  };
}
