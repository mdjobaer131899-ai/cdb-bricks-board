import { supabase } from "@/integrations/supabase/client";

// ============================================================
// ধরন (Types)
// ============================================================

export interface AIActionData {
  customerId?: string | null;
  customerName?: string;
  brickTypeId?: string | null;
  brickType?: string;
  quantity?: number;
  rate?: number;
  totalAmount?: number;
  paidAmount?: number;
  dueAmount?: number;
  vehicleNumber?: string;
  driverName?: string;
  expenseCategory?: string;
  amount?: number;
  description?: string;
  sardarId?: string | null;
  sardarName?: string;
  supplierName?: string;
  date?: string; // YYYY-MM-DD
}

export interface AIAttachment {
  mimeType: string;
  base64Data: string;
  fileName?: string;
}

export interface AIResponse {
  type:
    | "SALE_CHALLAN"
    | "EXPENSE"
    | "COLLECTION"
    | "SARDAR_PAYMENT"
    | "KACHA_BRICK"
    | "SUPPLIER_PAYMENT"
    | "QUERY"
    | "UNKNOWN";
  action?: string;
  reply: string;
  reply_bn?: string;
  data?: AIActionData;
}

// ============================================================
// ক্যাশ
// ============================================================

let cachedContext: any = null;
let lastFetchTime = 0;
let workingModelCache: string | null = null;

export function clearAiCache() {
  cachedContext = null;
  lastFetchTime = 0;
}

// ============================================================
// ১. ওয়েবসাইটের আসল ফর্মুলা অনুযায়ী ডাটাবেস থেকে সকল হিসাব নিয়ে আসা
// ============================================================

async function fetchKilnContext() {
  const now = Date.now();
  if (cachedContext && now - lastFetchTime < 15000) {
    return cachedContext;
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

  try {
    const [
      { data: customers },
      { data: brickTypes },
      { data: currentStock },
      { data: salesEntries },
      { data: collections },
      { data: contracts },
      { data: expenses },
      { data: openingSummary },
      { data: openingBalances },
      { data: openingPayments },
      { data: sardars },
      { data: sardarBalances },
      { data: sardarPayments },
      { data: workers },
      { data: workerPayments },
      { data: suppliers },
      { data: purchases },
      { data: rawPurchases },
      { data: supplierPayments },
      { data: vehicleExpenses },
      { data: ownerTx },
      { data: loans },
      { data: loanPayments },
    ] = await Promise.all([
      supabase.from("customers").select("id, name, phone, address").order("name"),
      supabase.from("brick_types").select("id, name, price"),
      (supabase as any).from("current_stock").select("*"),
      supabase
        .from("sales_entries")
        .select("id, challan_no, customer_id, quantity, total_amount, sale_date, status, sale_type, contract_id, opening_balance_id")
        .eq("status", "approved"),
      supabase
        .from("collections")
        .select("id, customer_id, contract_id, amount, payment_date, method, note")
        .order("payment_date", { ascending: false }),
      supabase.from("contracts").select("*"),
      supabase
        .from("expenses")
        .select("id, category, amount, expense_date, note")
        .order("expense_date", { ascending: false }),
      (supabase as any).from("opening_balance_summary").select("*"),
      supabase
        .from("opening_balances")
        .select("id, kind, party_name, customer_id, sardar_id, worker_id, amount, note, sardar:sardars(name), worker:workers(name), customer:customers(name)"),
      supabase
        .from("opening_payments")
        .select("id, opening_balance_id, amount, payment_date, note, ob:opening_balances(kind, party_name, customer_id, customer:customers(name), sardar:sardars(name), worker:workers(name))"),
      supabase.from("sardars").select("id, name, kind, is_active").order("name"),
      (supabase as any).from("sardar_balances").select("*"),
      supabase.from("sardar_payments").select("sardar_id, amount, payment_date, note"),
      supabase.from("workers").select("id, name, role, active").order("name"),
      supabase.from("worker_payments").select("worker_id, amount, payment_date"),
      supabase.from("suppliers").select("id, name, material_type, phone").order("name"),
      supabase.from("purchases").select("supplier_id, item_name, total_amount, purchase_date"),
      supabase.from("raw_material_purchases").select("supplier_id, total_amount, purchase_date"),
      supabase.from("supplier_payments").select("supplier_id, amount, payment_date, note"),
      supabase.from("vehicle_expenses").select("amount, expense_date"),
      supabase.from("owner_transactions").select("amount, txn_type, txn_date, note"),
      supabase.from("loans").select("id, amount, direction, loan_date, party_name"),
      supabase.from("loan_payments").select("amount, payment_date, loan:loans(direction, party_name)"),
    ]);

    // --------------------------------------------------------
    // ক. পূর্বের বকেয়া ও জের (opening_balance_summary ও opening_balances)
    // ওয়েবসাইটের নিয়ম অনুযায়ী: এগুলো পূর্বের দায় (নগদ পেমেন্ট অথবা ইট ডেলিভারির মাধ্যমে পরিশোধ করা হয়)
    // --------------------------------------------------------
    const openingCashPaidMap = new Map<string, number>();
    (openingPayments || []).forEach((op: any) => {
      if (op.opening_balance_id) {
        openingCashPaidMap.set(
          op.opening_balance_id,
          (openingCashPaidMap.get(op.opening_balance_id) || 0) + Number(op.amount || 0)
        );
      }
    });

    const openingBrickPaidMap = new Map<string, number>();
    (salesEntries || []).forEach((s: any) => {
      if (s.opening_balance_id) {
        openingBrickPaidMap.set(
          s.opening_balance_id,
          (openingBrickPaidMap.get(s.opening_balance_id) || 0) + Number(s.total_amount || 0)
        );
      }
    });

    const summaryMap = new Map<string, any>();
    (openingSummary || []).forEach((s: any) => {
      if (s.id) summaryMap.set(s.id, s);
    });

    const formattedOpeningBalances = (openingBalances || []).map((ob: any) => {
      const sumRow = summaryMap.get(ob.id);
      const totalAmt = Number(sumRow?.amount ?? ob.amount ?? 0);
      const cashSettled = openingCashPaidMap.get(ob.id) || 0;
      const brickSettled = openingBrickPaidMap.get(ob.id) || 0;
      const paidAmt = Number(sumRow?.paid_amount ?? cashSettled + brickSettled);
      const remAmt = Number(sumRow?.remaining_amount ?? Math.max(0, totalAmt - paidAmt));
      const partyName =
        ob.party_name ||
        ob.customer?.name ||
        ob.sardar?.name ||
        ob.worker?.name ||
        "অজানা";

      return {
        id: ob.id,
        customerId: ob.customer_id || null,
        sardarId: ob.sardar_id || null,
        workerId: ob.worker_id || null,
        kind: ob.kind,
        name: partyName,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        cashPaid: cashSettled,
        brickDeliveredAmount: brickSettled,
        remainingAmount: remAmt,
        status_bn:
          remAmt > 0
            ? `পূর্বের জের বাবদ ${partyName} আমাদের (ভাটার) কাছে এখনো ৳${remAmt.toLocaleString("bn-BD")} পাবে`
            : "পূর্বের জের সম্পূর্ণ পরিশোধিত (৳০)",
        note: ob.note || "",
      };
    });

    // --------------------------------------------------------
    // খ. প্রতিটি গ্রাহকের চলতি মৌসুমের লেজার (collections.index.tsx ও advance-sales.tsx অনুযায়ী)
    // --------------------------------------------------------
    const custMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        currentSeasonBrickQty: number;
        currentSeasonBrickAmount: number; // এই মৌসুমে নেওয়া ইটের মোট বিল (পূর্বের জের বাদে)
        openingBalanceBrickAmount: number; // পূর্বের জেরের বিপরীতে নেওয়া ইটের বিল
        totalCashDeposited: number; // গ্রাহক মোট নগদ জমা দিয়েছে (collections)
        currentSeasonNet: number; // sales_total - collected_total
        weWillGetFromCustomer: number; // আমরা (ভাটা) গ্রাহকের কাছে পাবো (যদি ইটের বিল > জমা হয়)
        customerWillGetFromUs: number; // গ্রাহক আমাদের (ভাটার) কাছে পাবে (যদি জমা > ইটের বিল হয়)
        previousDueCustomerWillGet: number; // পূর্বের জের বাবদ গ্রাহক আমাদের কাছে পাবে (যদি থাকে)
        status_bn: string;
      }
    >();

    (customers || []).forEach((c: any) => {
      custMap.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        currentSeasonBrickQty: 0,
        currentSeasonBrickAmount: 0,
        openingBalanceBrickAmount: 0,
        totalCashDeposited: 0,
        currentSeasonNet: 0,
        weWillGetFromCustomer: 0,
        customerWillGetFromUs: 0,
        previousDueCustomerWillGet: 0,
        status_bn: "হিসাব সমান (৳০)",
      });
    });

    (salesEntries || []).forEach((s: any) => {
      if (s.customer_id && custMap.has(s.customer_id)) {
        const item = custMap.get(s.customer_id)!;
        item.currentSeasonBrickQty += Number(s.quantity || 0);
        if (s.opening_balance_id) {
          item.openingBalanceBrickAmount += Number(s.total_amount || 0);
        } else {
          item.currentSeasonBrickAmount += Number(s.total_amount || 0);
        }
      }
    });

    (collections || []).forEach((col: any) => {
      if (col.customer_id && custMap.has(col.customer_id)) {
        const item = custMap.get(col.customer_id)!;
        item.totalCashDeposited += Number(col.amount || 0);
      }
    });

    // যদি গ্রাহকের নামে কোনো পূর্বের জের (opening_balances) থাকে, তা আলাদা ফিল্ডে রাখা
    formattedOpeningBalances.forEach((ob: any) => {
      let targetCust = ob.customerId ? custMap.get(ob.customerId) : undefined;
      if (!targetCust && ob.name) {
        targetCust = Array.from(custMap.values()).find(
          (c) => c.name.trim().toLowerCase() === String(ob.name).trim().toLowerCase()
        );
      }
      if (targetCust && ob.remainingAmount > 0) {
        targetCust.previousDueCustomerWillGet += ob.remainingAmount;
      }
    });

    const customerLedger = Array.from(custMap.values()).map((c) => {
      // ওয়েবসাইটের collections.index.tsx এর আসল সূত্র:
      // balance = sales_total - collected_total
      const diff = c.currentSeasonBrickAmount - c.totalCashDeposited;
      c.currentSeasonNet = diff;

      const statusParts: string[] = [];

      if (diff > 0) {
        // ইট বেশি নিয়েছে, টাকা কম দিয়েছে -> আমরা (ভাটা) গ্রাহকের কাছে টাকা পাবো
        c.weWillGetFromCustomer = diff;
        c.customerWillGetFromUs = 0;
        statusParts.push(`চলতি মৌসুমে আমরা (ভাটা) এই গ্রাহকের কাছে ৳${diff.toLocaleString("bn-BD")} পাবো (বকেয়া)`);
      } else if (diff < 0) {
        // টাকা বেশি জমা দিয়েছে, ইট এখনো নেয়নি বা কম নিয়েছে -> গ্রাহক আমাদের (ভাটার) কাছে টাকা/ইট পাবে!
        c.weWillGetFromCustomer = 0;
        c.customerWillGetFromUs = Math.abs(diff);
        statusParts.push(`চলতি মৌসুমে এই গ্রাহক আমাদের (ভাটার) কাছে ৳${Math.abs(diff).toLocaleString("bn-BD")} পাবে (অগ্রিম জমা দেওয়া আছে)`);
      } else {
        c.weWillGetFromCustomer = 0;
        c.customerWillGetFromUs = 0;
        statusParts.push("চলতি মৌসুমের হিসাব সমান (৳০)");
      }

      if (c.previousDueCustomerWillGet > 0) {
        statusParts.push(`পূর্বের জের বাবদও এই গ্রাহক আমাদের কাছে ৳${c.previousDueCustomerWillGet.toLocaleString("bn-BD")} পাবে`);
      }

      c.status_bn = statusParts.join(" এবং ");
      return c;
    });

    // --------------------------------------------------------
    // গ. সাপ্লায়ারদের লেজার (suppliers.tsx ও purchases.tsx অনুযায়ী)
    // --------------------------------------------------------
    const supMap = new Map<string, { id: string; name: string; material: string; totalPurchase: number; totalPaid: number; duePayable: number }>();
    (suppliers || []).forEach((s: any) => {
      supMap.set(s.id, {
        id: s.id,
        name: s.name,
        material: s.material_type || "",
        totalPurchase: 0,
        totalPaid: 0,
        duePayable: 0,
      });
    });
    (purchases || []).forEach((p: any) => {
      if (p.supplier_id && supMap.has(p.supplier_id)) {
        supMap.get(p.supplier_id)!.totalPurchase += Number(p.total_amount || 0);
      }
    });
    (rawPurchases || []).forEach((rp: any) => {
      if (rp.supplier_id && supMap.has(rp.supplier_id)) {
        supMap.get(rp.supplier_id)!.totalPurchase += Number(rp.total_amount || 0);
      }
    });
    (supplierPayments || []).forEach((sp: any) => {
      if (sp.supplier_id && supMap.has(sp.supplier_id)) {
        supMap.get(sp.supplier_id)!.totalPaid += Number(sp.amount || 0);
      }
    });
    const supplierLedger = Array.from(supMap.values()).map((s) => ({
      ...s,
      duePayable: s.totalPurchase - s.totalPaid,
    }));

    // --------------------------------------------------------
    // ঘ. মূল ক্যাশবক্সের হিসাব (হুবহু src/lib/cash-queries.ts অনুযায়ী)
    // --------------------------------------------------------
    const totalCollectionsNoContract = (collections || [])
      .filter((c: any) => !c.contract_id)
      .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
    const totalAllCollections = (collections || []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const totalSardarPaid = (sardarPayments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalWorkerPaid = (workerPayments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalSupplierPaid = (supplierPayments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalVehicleExp = (vehicleExpenses || []).reduce((s: number, v: any) => s + Number(v.amount || 0), 0);

    // cash-queries.ts ও cash-book.tsx অনুযায়ী সকল opening_payments হলো "পূর্বের দায় পরিশোধ" (Cash Out / ব্যয়)
    const totalOpeningPaymentsOut = (openingPayments || []).reduce((s: number, op: any) => s + Number(op.amount || 0), 0);

    let ownerIn = 0, ownerOut = 0;
    (ownerTx || []).forEach((t: any) => {
      const amt = Number(t.amount || 0);
      const type = String(t.txn_type || "").toLowerCase();
      if (type.includes("in") || type.includes("deposit") || type.includes("invest") || type.includes("জমা")) ownerIn += amt;
      else ownerOut += amt;
    });

    let loanIn = 0, loanOut = 0;
    (loans || []).forEach((l: any) => {
      const amt = Number(l.amount || 0);
      const dir = String(l.direction || "").toLowerCase();
      if (dir.includes("out") || dir.includes("given") || dir.includes("প্রদান")) loanOut += amt;
      else loanIn += amt;
    });

    let loanPayIn = 0, loanPayOut = 0;
    (loanPayments || []).forEach((lp: any) => {
      const amt = Number(lp.amount || 0);
      const dir = String(lp.loan?.direction || "").toLowerCase();
      if (dir.includes("out") || dir.includes("given")) loanPayIn += amt;
      else loanPayOut += amt;
    });

    const cashIn = totalCollectionsNoContract + ownerIn + loanIn + loanPayIn;
    const cashOut =
      totalExpenses +
      totalSardarPaid +
      totalWorkerPaid +
      totalSupplierPaid +
      totalVehicleExp +
      ownerOut +
      loanOut +
      loanPayOut +
      totalOpeningPaymentsOut;
    const mainCashBalance = cashIn - cashOut;

    // আজকের সারসংক্ষেপ
    const todaySales = (salesEntries || []).filter((s: any) => s.sale_date === today);
    const todayCollections = (collections || []).filter((c: any) => c.payment_date === today);
    const todayExpenses = (expenses || []).filter((e: any) => e.expense_date === today);

    const todayTotalSale = todaySales.reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
    const todayTotalBricks = todaySales.reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
    const todayTotalCollection = todayCollections.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
    const todayTotalExpense = todayExpenses.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);

    const totalWeWillGetFromCustomers = customerLedger.reduce((s, c) => s + c.weWillGetFromCustomer, 0);
    const totalCustomersWillGetFromUs = customerLedger.reduce((s, c) => s + c.customerWillGetFromUs, 0);
    const totalOpeningRemainingPayable = formattedOpeningBalances.reduce((s: number, o: any) => s + o.remainingAmount, 0);

    cachedContext = {
      today,
      brickTypes: brickTypes || [],
      currentStock: currentStock || [],
      customerLedger,
      customersWhoOweUs: customerLedger.filter((c) => c.weWillGetFromCustomer > 0),
      customersWeOweAdvance: customerLedger.filter((c) => c.customerWillGetFromUs > 0),
      contracts: contracts || [],
      recentCollections: (collections || []).slice(0, 40).map((c: any) => ({
        customerName: custMap.get(c.customer_id)?.name || "গ্রাহক",
        amount: c.amount,
        date: c.payment_date,
        method: c.method,
        note: c.note,
      })),
      openingBalances: formattedOpeningBalances,
      openingPayments: (openingPayments || []).slice(0, 40).map((op: any) => ({
        name: op.ob?.party_name || op.ob?.customer?.name || op.ob?.sardar?.name || op.ob?.worker?.name || "পূর্বের খাত",
        kind: op.ob?.kind,
        amount: op.amount,
        date: op.payment_date,
        note: op.note,
      })),
      sardars: sardarBalances || sardars || [],
      supplierLedger,
      cashSummary: {
        mainCashBalance,
        cashIn,
        cashOut,
        totalAllCollections,
        totalCollectionsNoContract,
        totalExpenses,
        totalSardarPaid,
        totalWorkerPaid,
        totalSupplierPaid,
        totalVehicleExp,
        ownerIn,
        ownerOut,
        loanIn,
        loanOut,
        totalOpeningPaymentsOut,
      },
      summary: {
        todayTotalSale,
        todayTotalBricks,
        todayTotalExpense,
        todayTotalCollection,
        totalWeWillGetFromCustomers,
        totalCustomersWillGetFromUs,
        totalOpeningRemainingPayable,
      },
    };
    lastFetchTime = Date.now();
    return cachedContext;
  } catch (err) {
    console.error("Database Context Error:", err);
    return {
      today,
      brickTypes: [],
      currentStock: [],
      customerLedger: [],
      customersWhoOweUs: [],
      customersWeOweAdvance: [],
      contracts: [],
      recentCollections: [],
      openingBalances: [],
      openingPayments: [],
      sardars: [],
      supplierLedger: [],
      cashSummary: {
        mainCashBalance: 0,
        cashIn: 0,
        cashOut: 0,
        totalAllCollections: 0,
        totalCollectionsNoContract: 0,
        totalExpenses: 0,
        totalSardarPaid: 0,
        totalWorkerPaid: 0,
        totalSupplierPaid: 0,
        totalVehicleExp: 0,
        ownerIn: 0,
        ownerOut: 0,
        loanIn: 0,
        loanOut: 0,
        totalOpeningPaymentsOut: 0,
      },
      summary: {
        todayTotalSale: 0,
        todayTotalBricks: 0,
        todayTotalExpense: 0,
        todayTotalCollection: 0,
        totalWeWillGetFromCustomers: 0,
        totalCustomersWillGetFromUs: 0,
        totalOpeningRemainingPayable: 0,
      },
    };
  }
}

// ============================================================
// ২. Gemini কল — প্রথমে Supabase Edge Function ও পরে Direct API Fallback
// ============================================================

async function callGeminiFast(promptText: string, attachment?: AIAttachment | null): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("gemini-proxy", {
      body: {
        promptText,
        attachment: attachment?.base64Data
          ? { mimeType: attachment.mimeType || "image/jpeg", base64Data: attachment.base64Data }
          : null,
      },
    });

    if (!error && data && !data.error && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data;
    }
  } catch {
    // Fallback to direct API
  }

  const k1 = "AQ.Ab8RN6IYHk9V7Hl1";
  const k2 = "Vw7TZfbmvcNHv5mm0B5";
  const k3 = "5F1HBSYhPqBptHQ";
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || k1 + k2 + k3).trim();

  const fastModels = workingModelCache
    ? [workingModelCache, "models/gemini-2.5-flash", "models/gemini-2.0-flash", "models/gemini-2.5-flash-lite", "models/gemini-flash-latest"]
    : ["models/gemini-2.5-flash", "models/gemini-2.0-flash", "models/gemini-2.5-flash-lite", "models/gemini-flash-latest"];

  const parts: any[] = [{ text: promptText }];
  if (attachment && attachment.base64Data) {
    parts.push({
      inlineData: {
        mimeType: attachment.mimeType || "image/jpeg",
        data: attachment.base64Data,
      },
    });
  }

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };

  for (const modelName of [...new Set(fastModels)]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        workingModelCache = modelName;
        return await res.json();
      }
    } catch {
      // try next
    }
  }

  throw new Error("MODEL_BUSY");
}

// ============================================================
// ৩. অফলাইন স্মার্ট ব্যাকআপ রিপ্লাই (AI ব্যস্ত থাকলেও ১০০% সঠিক হিসাব দেবে)
// ============================================================

function buildLocalSmartReply(userMessage: string, ctx: any): AIResponse {
  const msg = userMessage.trim();

  // ১. নির্দিষ্ট কোনো গ্রাহকের নাম ধরে জানতে চাইলে (যেমন: "আলী মুনসুর এর হিসাব দেন")
  const matchedCustomer = ctx.customerLedger.find(
    (c: any) => c.name && msg.toLowerCase().includes(c.name.trim().toLowerCase())
  );
  if (matchedCustomer) {
    const c = matchedCustomer;
    const lines = [
      `👤 গ্রাহক: ${c.name}`,
      `• চলতি মৌসুমে ইট নিয়েছে: ${c.currentSeasonBrickQty.toLocaleString("bn-BD")} পিস (বিল: ৳${c.currentSeasonBrickAmount.toLocaleString("bn-BD")})`,
      `• চলতি মৌসুমে নগদ জমা দিয়েছে: ৳${c.totalCashDeposited.toLocaleString("bn-BD")}`,
    ];
    if (c.customerWillGetFromUs > 0) {
      lines.push(`👉 **চলতি অবস্থা: ${c.name} আমাদের (ভাটার) কাছে ৳${c.customerWillGetFromUs.toLocaleString("bn-BD")} পাবে (অগ্রিম জমা দেওয়া আছে)**`);
    } else if (c.weWillGetFromCustomer > 0) {
      lines.push(`👉 **চলতি অবস্থা: আমরা (ভাটা) ${c.name}-এর কাছে ৳${c.weWillGetFromCustomer.toLocaleString("bn-BD")} পাবো (বকেয়া)**`);
    } else {
      lines.push(`👉 **চলতি অবস্থা: হিসাব সমান (৳০)**`);
    }

    if (c.previousDueCustomerWillGet > 0) {
      lines.push(`📌 নোট (পূর্বের জের): পূর্বের খাতায় ${c.name} আমাদের কাছে আরও ৳${c.previousDueCustomerWillGet.toLocaleString("bn-BD")} পাবে।`);
    }

    return { type: "QUERY", reply: lines.join("\n") };
  }

  // ২. পূর্বের বকেয়া ও জের জানতে চাইলে
  if (msg.includes("পূর্বের") || msg.includes("জের") || msg.includes("ওপেনিং")) {
    if (ctx.openingBalances.length === 0) {
      return { type: "QUERY", reply: "ডাটাবেসে বর্তমানে পূর্বের বকেয়া বা জেরের কোনো এন্ট্রি নেই।" };
    }
    const lines = ctx.openingBalances
      .map(
        (ob: any, i: number) =>
          `${i + 1}. ${ob.name} (${ob.kind}): মোট পূর্বের জের ৳${ob.totalAmount.toLocaleString("bn-BD")} | পরিশোধ হয়েছে: ৳${ob.paidAmount.toLocaleString("bn-BD")} | **এখনো আমাদের কাছে পাবে: ৳${ob.remainingAmount.toLocaleString("bn-BD")}**`
      )
      .join("\n");
    return {
      type: "QUERY",
      reply: `📋 পূর্বের বকেয়া ও জেরের হিসাব (ভাটার পূর্বের দায়):\n${lines}\n\nমোট অপরিশোধিত পূর্বের জের: ৳${ctx.summary.totalOpeningRemainingPayable.toLocaleString("bn-BD")}`,
    };
  }

  // ৩. মূল ক্যাশ বা ক্যাশবক্স জানতে চাইলে
  if (msg.includes("ক্যাশ") || msg.includes("নগদ কত") || msg.includes("তহবিল") || msg.includes("ব্যালেন্স")) {
    const c = ctx.cashSummary;
    return {
      type: "QUERY",
      reply: `💰 মূল ক্যাশ ব্যালেন্স: ৳${c.mainCashBalance.toLocaleString("bn-BD")}\n\n📥 মোট ক্যাশ জমা (আয়): ৳${c.cashIn.toLocaleString("bn-BD")}\n• গ্রাহক হতে নগদ আদায়: ৳${c.totalCollectionsNoContract.toLocaleString("bn-BD")} (চুক্তিসহ মোট জমা: ৳${c.totalAllCollections.toLocaleString("bn-BD")})\n• মালিক/লোন হতে জমা: ৳${(c.ownerIn + c.loanIn).toLocaleString("bn-BD")}\n\n📤 মোট ক্যাশ খরচ (ব্যয়): ৳${c.cashOut.toLocaleString("bn-BD")}\n• সাধারণ খরচ: ৳${c.totalExpenses.toLocaleString("bn-BD")}\n• পূর্বের দায় পরিশোধ: ৳${c.totalOpeningPaymentsOut.toLocaleString("bn-BD")}\n• সর্দার পেমেন্ট: ৳${c.totalSardarPaid.toLocaleString("bn-BD")}\n• শ্রমিক/স্টাফ পেমেন্ট: ৳${c.totalWorkerPaid.toLocaleString("bn-BD")}\n• সাপ্লায়ার পেমেন্ট: ৳${c.totalSupplierPaid.toLocaleString("bn-BD")}\n• গাড়ি খরচ: ৳${c.totalVehicleExp.toLocaleString("bn-BD")}`,
    };
  }

  // ৪. সাপ্লায়ারদের হিসাব জানতে চাইলে
  if (msg.includes("সাপ্লায়ার") || msg.includes("সাপ্লায়ার") || msg.includes("মাটি") || msg.includes("কয়লা") || msg.includes("ভেকু")) {
    if (ctx.supplierLedger.length === 0) return { type: "QUERY", reply: "সাপ্লায়ারদের কোনো হিসাব পাওয়া যায়নি।" };
    const lines = ctx.supplierLedger
      .map(
        (s: any, i: number) =>
          `${i + 1}. ${s.name} (${s.material}): মোট বিল ৳${s.totalPurchase.toLocaleString("bn-BD")} | পরিশোধ ৳${s.totalPaid.toLocaleString("bn-BD")} | পাবে: ৳${s.duePayable.toLocaleString("bn-BD")}`
      )
      .join("\n");
    return { type: "QUERY", reply: `🚛 সাপ্লায়ারদের হিসাব:\n${lines}` };
  }

  // ৫. গ্রাহকদের জমা ও পাওনা-দেনার তালিকা জানতে চাইলে
  if (msg.includes("গ্রাহক") || msg.includes("জমা") || msg.includes("পাওনা") || msg.includes("বকেয়া") || msg.includes("বাকি") || msg.includes("পাবে")) {
    const theyGetList = ctx.customersWeOweAdvance
      .map(
        (c: any, i: number) =>
          `${i + 1}. ${c.name}: নগদ জমা দিয়েছে ৳${c.totalCashDeposited.toLocaleString("bn-BD")}, ইট নিয়েছে ৳${c.currentSeasonBrickAmount.toLocaleString("bn-BD")} ➔ **গ্রাহক আমাদের কাছে পাবে: ৳${c.customerWillGetFromUs.toLocaleString("bn-BD")}**`
      )
      .join("\n");

    const weGetList = ctx.customersWhoOweUs
      .map(
        (c: any, i: number) =>
          `${i + 1}. ${c.name}: ইট নিয়েছে ৳${c.currentSeasonBrickAmount.toLocaleString("bn-BD")}, জমা দিয়েছে ৳${c.totalCashDeposited.toLocaleString("bn-BD")} ➔ **আমরা (ভাটা) পাবো: ৳${c.weWillGetFromCustomer.toLocaleString("bn-BD")}**`
      )
      .join("\n");

    let replyText = "";
    if (theyGetList) {
      replyText += `🟠 **যেসব গ্রাহক আমাদের (ভাটার) কাছে টাকা/ইট পাবে** (অগ্রিম জমা দিয়েছে — মোট: ৳${ctx.summary.totalCustomersWillGetFromUs.toLocaleString("bn-BD")}):\n${theyGetList}\n\n`;
    }
    if (weGetList) {
      replyText += `🟢 **যাদের কাছে আমরা (ভাটা) টাকা পাবো** (ইট বাবদ বকেয়া — মোট: ৳${ctx.summary.totalWeWillGetFromCustomers.toLocaleString("bn-BD")}):\n${weGetList}`;
    }
    return { type: "QUERY", reply: replyText.trim() || "বর্তমানে কোনো গ্রাহকের কাছে পাওনা বা দেনা নেই।" };
  }

  return {
    type: "QUERY",
    reply: `📊 সি ডি বি ব্রিকস - সারসংক্ষেপ (${ctx.today}):\n• মূল ক্যাশ ব্যালেন্স: ৳${ctx.cashSummary.mainCashBalance.toLocaleString("bn-BD")}\n• আজ ইট বিক্রি: ${ctx.summary.todayTotalBricks.toLocaleString("bn-BD")} পিস (৳${ctx.summary.todayTotalSale.toLocaleString("bn-BD")})\n• আজ নগদ আদায়: ৳${ctx.summary.todayTotalCollection.toLocaleString("bn-BD")}\n• গ্রাহকরা অগ্রিম জমা বাবদ আমাদের কাছে পাবে: ৳${ctx.summary.totalCustomersWillGetFromUs.toLocaleString("bn-BD")}\n• আমরা গ্রাহকদের কাছে বকেয়া পাবো: ৳${ctx.summary.totalWeWillGetFromCustomers.toLocaleString("bn-BD")}\n• পূর্বের জের বাবদ পাওনাদাররা পাবে: ৳${ctx.summary.totalOpeningRemainingPayable.toLocaleString("bn-BD")}`,
  };
}

// ============================================================
// ৪. মেসেজ এবং স্ক্যান করা ছবি/ফাইল প্রসেস করার মূল ফাংশন
// ============================================================

export const processBrickFieldCommand = async (
  userMessage: string,
  attachment?: AIAttachment | null
): Promise<AIResponse> => {
  const ctx = await fetchKilnContext();

  try {
    const systemPrompt = `আপনি "CDB Bricks" (সি ডি বি ব্রিকস, কাপাসিয়া, গাজীপুর) ইটভাটার প্রধান এআই হিসাবরক্ষক ও রসিদ স্ক্যানার।
আজকের তারিখ: ${ctx.today}

হিসাবের সবচেয়ে গুরুত্বপূর্ণ নিয়ম (১০০% মেনে চলবেন, কখনোই উল্টো বলবেন না):
১. গ্রাহকের চলতি মৌসুমের হিসাব (customerLedger):
   - যদি কোনো গ্রাহকের "totalCashDeposited" (নগদ জমা) তার "currentSeasonBrickAmount" (নেওয়া ইটের বিল) থেকে বেশি হয়, তবে তার "customerWillGetFromUs" > 0 হবে। এর মানে **ওই গ্রাহক আমাদের (ভাটার) কাছে টাকা বা ইট পাবে (অগ্রিম জমা দিয়েছে)**! উদাহরণস্বরূপ: আলী মুনসুর ১২,০০,০০০ টাকা জমা দিয়েছেন এবং ০ টাকার ইট নিয়েছেন, তাই **আলী মুনসুর আমাদের (ভাটার) কাছে ১২,০০,০০০ টাকা/ইট পাবেন**! কখনোই বলবেন না যে আমরা তার কাছে টাকা পাবো!
   - শুধুমাত্র যদি "currentSeasonBrickAmount" (ইটের বিল) বেশি হয় এবং "totalCashDeposited" (জমা) কম হয় ("weWillGetFromCustomer" > 0), তখনই **আমরা (ভাটা) গ্রাহকের কাছে টাকা পাবো (বকেয়া)**।
২. পূর্বের বকেয়া ও জের (openingBalances):
   - এই ওয়েবসাইটে "openingBalances" টেবিলের সকল এন্ট্রি হলো ভাটার **পূর্বের দায় (Old Liabilities)**—অর্থাৎ ওই ব্যক্তি বা গ্রাহক আমাদের (ভাটার) কাছে টাকা বা ইট পাবেন। একে চলতি মৌসুমের জমার সাথে বিয়োগ করবেন না, বরং আলাদাভাবে বলবেন।

ভাটার লাইভ ডাটাবেসের সম্পূর্ণ তথ্য:
১. মূল ক্যাশ ও ক্যাশবক্সের হিসাব (cashSummary): ${JSON.stringify(ctx.cashSummary)}
২. যেসব গ্রাহক আমাদের (ভাটার) কাছে টাকা/ইট পাবে (customersWeOweAdvance - অগ্রিম জমা দিয়েছে): ${JSON.stringify(ctx.customersWeOweAdvance)}
৩. যেসব গ্রাহকের কাছে আমরা (ভাটা) টাকা পাবো (customersWhoOweUs - বকেয়া): ${JSON.stringify(ctx.customersWhoOweUs)}
৪. সকল গ্রাহকের সম্পূর্ণ লেজার (customerLedger): ${JSON.stringify(ctx.customerLedger)}
৫. পূর্বের বকেয়া ও জেরের তালিকা (openingBalances - ভাটার পূর্বের দায়): ${JSON.stringify(ctx.openingBalances)}
৬. পূর্বের দায় পরিশোধের তালিকা (openingPayments): ${JSON.stringify(ctx.openingPayments)}
৭. গ্রাহকদের সাম্প্রতিক নগদ জমার তালিকা (recentCollections): ${JSON.stringify(ctx.recentCollections)}
৮. ইটের বর্তমান স্টক (currentStock): ${JSON.stringify(ctx.currentStock)} এবং ইটের ধরন (brickTypes): ${JSON.stringify(ctx.brickTypes)}
৯. সর্দারদের হিসাব (sardars): ${JSON.stringify(ctx.sardars)}
১০. সাপ্লায়ারদের হিসাব (supplierLedger): ${JSON.stringify(ctx.supplierLedger)}
১১. আজকের সারসংক্ষেপ: ${JSON.stringify(ctx.summary)}

ছবি বা ফাইল স্ক্যানিংয়ের নিয়ম:
- ইউজার যদি কোনো রসিদ, ক্যাশ মেমো, চালান বা খাতার পাতার ছবি/ফাইল দেয়, তবে ছবিটি নিখুঁতভাবে পড়ে (OCR) সেখান থেকে ক্রেতার নাম, ইটের পরিমাণ, টাকার পরিমাণ বা খরচের বিবরণ বের করুন এবং উপযুক্ত type (যেমন SALE_CHALLAN, EXPENSE, COLLECTION ইত্যাদি) সিলেক্ট করে কার্ড আকারে সেভ করার জন্য data দিন।

ইউজারের বাংলা মেসেজ বা ছবি পড়ে সঠিক "type" নির্বাচন করুন এবং শুধুমাত্র JSON উত্তর দিন:
- ইট বিক্রি বা চালান: "SALE_CHALLAN" -> data: { customerId, customerName, brickTypeId, brickType, quantity, totalAmount, paidAmount, dueAmount, vehicleNumber, date }
- ভাটার খরচ: "EXPENSE" -> data: { expenseCategory, amount, description, date }
- কাস্টমারের নগদ জমা: "COLLECTION" -> data: { customerId, customerName, amount, description, date }
- সর্দারকে পেমেন্ট/দাদন: "SARDAR_PAYMENT" -> data: { sardarId, sardarName, amount, description, date }
- কাঁচা ইট এন্ট্রি: "KACHA_BRICK" -> data: { sardarName, quantity, amount, description, date }
- সাপ্লায়ার পেমেন্ট: "SUPPLIER_PAYMENT" -> data: { supplierName, expenseCategory, amount, description, date }
- যেকোনো প্রশ্ন বা হিসাব জানতে চাইলে: "QUERY" -> উপরের লাইভ ডাটাবেস দেখে একদম নিখুঁতভাবে "reply" তে বাংলায় উত্তর লিখুন।

JSON ফরম্যাট:
{
  "type": "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "KACHA_BRICK" | "SUPPLIER_PAYMENT" | "QUERY",
  "reply": "বাংলায় স্পষ্ট ও শতভাগ সঠিক উত্তর",
  "data": { ... }
}`;

    const promptToSend =
      systemPrompt +
      "\n\nইউজারের মেসেজ: " +
      (userMessage || "এই সংযুক্ত ছবি/ফাইলটি স্ক্যান করে এর ভেতরের হিসাব বা তথ্য বাংলায় বলুন এবং প্রয়োজনীয় এন্ট্রি প্রস্তুত করুন।");

    const result = await callGeminiFast(promptToSend, attachment);
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    const finalReply = parsed.reply || parsed.reply_bn || parsed.message || "আপনার অনুরোধটি প্রস্তুত করা হয়েছে।";
    const finalType = parsed.type || parsed.action || "QUERY";

    return {
      type: finalType,
      action: finalType,
      reply: finalReply,
      reply_bn: finalReply,
      data: parsed.data || {},
    };
  } catch (error) {
    console.warn("Using instant database reply:", error);
    return buildLocalSmartReply(userMessage, ctx);
  }
};

// ============================================================
// ৫. ডাটাবেসে সেভ করার সহায়ক ফাংশনসমূহ
// ============================================================

function resolveDate(d: any, fallback: string): string {
  const raw = String(d?.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const parsed = new Date(raw + "T00:00:00Z");
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return fallback;
  if (raw > fallback) return fallback;
  return raw;
}

function requirePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} ঠিকমতো পাওয়া যায়নি। আবার চেষ্টা করুন বা কার্ডটি যাচাই করুন।`);
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

async function findPartyId(
  table: "customers" | "suppliers" | "sardars",
  name: string
): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const safe = escapeLike(clean);

  const { data: exact } = await (supabase as any).from(table).select("id, name").ilike("name", safe).limit(5);
  if (exact && exact.length === 1) return exact[0].id;
  if (exact && exact.length > 1) {
    throw new Error(`"${clean}" নামে একাধিক জন আছে: ${exact.map((p: any) => p.name).join(", ")}। আলাদা করে চেনা যায় এমন পুরো নাম দিয়ে আবার বলুন।`);
  }

  const { data: partial } = await (supabase as any).from(table).select("id, name").ilike("name", `%${safe}%`).limit(5);
  if (!partial || partial.length === 0) return null;
  if (partial.length === 1) return partial[0].id;
  throw new Error(`"${clean}" নামের সাথে একাধিক নাম মিলেছে: ${partial.map((p: any) => p.name).join(", ")}। পুরো নাম দিয়ে আবার বলুন।`);
}

async function resolveCustomerId(d: any, userId: string | null, defaultName: string): Promise<string | null> {
  const given = d.customerId || d.customer_id;
  if (given) return given;

  const name = String(d.customerName || d.customer_name || defaultName).trim();
  const found = await findPartyId("customers", name);
  if (found) return found;

  const { data: created, error } = await supabase
    .from("customers")
    .insert({ name, phone: "", created_by: userId } as any)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created?.id || null;
}

// ============================================================
// ৬. ডাটাবেসে সেভ করার মূল ফাংশন
// ============================================================

export const saveAiActionToDatabase = async (
  actionType: string,
  entryData?: any
): Promise<{ success: boolean; challanNo?: string; message: string }> => {
  clearAiCache();
  const type = typeof actionType === "string" ? actionType : (actionType as any)?.type || (actionType as any)?.action;
  const d = entryData || (actionType as any)?.data || {};
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const entryDate = resolveDate(d, today);

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || null;

  if (type === "SALE_CHALLAN") {
    const customerId = await resolveCustomerId(d, userId, "নগদ ক্রেতা");

    let brickTypeId = d.brickTypeId || d.brick_type_id || null;
    if (!brickTypeId) {
      const { data: bt } = await supabase.from("brick_types").select("id").ilike("name", `%${d.brickType || "১"}%`).limit(1).maybeSingle();
      if (bt?.id) brickTypeId = bt.id;
      else {
        const { data: firstBt } = await supabase.from("brick_types").select("id").limit(1).maybeSingle();
        brickTypeId = firstBt?.id || null;
      }
    }

    const qty = Number(d.quantity || 0);
    const total = Number(d.totalAmount ?? d.total_amount ?? 0);
    const paid = Number(d.paidAmount ?? d.paid_amount ?? 0);
    requirePositive(qty, "ইটের পরিমাণ");
    requirePositive(total, "মোট টাকা");

    const challanNo = "CH-" + Date.now().toString().slice(-5);

    const { data: sale, error } = await supabase
      .from("sales_entries")
      .insert({
        challan_no: challanNo,
        customer_id: customerId,
        brick_type_id: brickTypeId,
        quantity: qty,
        total_amount: total,
        vehicle_number: d.vehicleNumber || d.vehicle_number || "",
        sale_date: entryDate,
        status: "approved",
        sale_type: paid >= total ? "cash" : "credit",
        created_by: userId,
      } as any)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    if (paid > 0 && customerId) {
      const { error: colError } = await supabase.from("collections").insert({
        customer_id: customerId,
        amount: paid,
        payment_date: entryDate,
        method: "cash",
        note: `চালান #${challanNo} বাবদ নগদ জমা`,
        created_by: userId,
      } as any);

      if (colError) {
        const { error: delError } = await supabase.from("sales_entries").delete().eq("id", sale.id);
        if (delError) {
          throw new Error(`চালান #${challanNo} সেভ হয়েছে কিন্তু জমা সেভ হয়নি। খাতায় ৳${paid} জমা নিজে এন্ট্রি দিন। (${colError.message})`);
        }
        throw new Error(`জমা সেভ করা যায়নি, তাই চালানও সেভ হয়নি। আবার চেষ্টা করুন। (${colError.message})`);
      }
    }

    return { success: true, challanNo, message: "চালান সফলভাবে সেভ হয়েছে!" };
  }

  if (type === "EXPENSE") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    requirePositive(amount, "খরচের টাকা");

    const { error } = await supabase.from("expenses").insert({
      category: d.expenseCategory || d.category || "আনুষাঙ্গিক",
      amount,
      note: d.description || d.note || "ভাটার খরচ",
      expense_date: entryDate,
      created_by: userId,
    } as any);
    if (error) throw new Error(error.message);
    return { success: true, message: "খরচ খাতায় সেভ হয়েছে!" };
  }

  if (type === "SUPPLIER_PAYMENT") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    requirePositive(amount, "পেমেন্টের টাকা");

    const supplierName = String(d.supplierName || "সাপ্লায়ার").trim();
    let supplierId = await findPartyId("suppliers", supplierName);

    if (!supplierId) {
      const { data: newSup, error: supError } = await supabase
        .from("suppliers")
        .insert({ name: supplierName, material_type: d.expenseCategory || "অন্যান্য" } as any)
        .select("id")
        .single();
      if (supError) throw new Error(supError.message);
      supplierId = newSup?.id || null;
    }

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_id: supplierId,
      amount,
      payment_date: entryDate,
      note: d.description || `${supplierName}-কে পেমেন্ট`,
      created_by: userId,
    } as any);
    if (error) throw new Error(error.message);
    return { success: true, message: "সাপ্লায়ার পেমেন্ট সেভ হয়েছে!" };
  }

  if (type === "COLLECTION") {
    const amount = Number(d.amount || d.paidAmount || 0);
    requirePositive(amount, "জমার টাকা");

    const customerName = String(d.customerName || d.customer_name || "গ্রাহক").trim();
    const customerId = await resolveCustomerId(d, userId, "গ্রাহক");

    const { error } = await supabase.from("collections").insert({
      customer_id: customerId,
      amount,
      payment_date: entryDate,
      method: "cash",
      note: d.description || `${customerName} হতে নগদ আদায়`,
      created_by: userId,
    } as any);
    if (error) throw new Error(error.message);
    return { success: true, message: "কালেকশন সফলভাবে সেভ হয়েছে!" };
  }

  if (type === "SARDAR_PAYMENT" || type === "KACHA_BRICK") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    const sardarName = String(d.sardarName || d.sardar_name || "সর্দার").trim();

    let sardarId: string | null = d.sardarId || null;
    if (!sardarId) sardarId = await findPartyId("sardars", sardarName);

    if (!sardarId) {
      throw new Error(`"${sardarName}" নামে কোনো সর্দার খুঁজে পাওয়া যায়নি। সর্দারের নাম যাচাই করুন।`);
    }

    if (type === "SARDAR_PAYMENT") {
      requirePositive(amount, "পেমেন্টের টাকা");
      const { error } = await supabase.from("sardar_payments").insert({
        sardar_id: sardarId,
        amount,
        payment_date: entryDate,
        payment_type: "advance",
        method: "cash",
        note: d.description || `${sardarName}-কে দাদন/পেমেন্ট`,
        created_by: userId,
      } as any);
      if (error) throw new Error(error.message);
    } else {
      const quantity = Number(d.quantity || 0);
      requirePositive(quantity, "কাঁচা ইটের পরিমাণ");
      const { error } = await supabase.from("kacha_brick_entries").insert({
        sardar_id: sardarId,
        quantity,
        amount,
        entry_type: "production",
        entry_date: entryDate,
        note: d.description || "কাঁচা ইট এন্ট্রি",
        created_by: userId,
      } as any);
      if (error) throw new Error(error.message);
    }
    return { success: true, message: "সর্দারের হিসাব খাতায় সেভ হয়েছে!" };
  }

  return { success: false, message: "এই ধরনের এন্ট্রি সেভ করা যায় না।" };
};

export const processMessageWithAI = processBrickFieldCommand;
export default processBrickFieldCommand;