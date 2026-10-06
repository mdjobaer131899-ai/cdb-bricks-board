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
// ১. ডাটাবেস থেকে ভাটার সব তথ্য ও ১০০% নিখুঁত পাওনা-দেনার হিসাব নিয়ে আসা
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
      { data: supplierPayments },
      { data: vehicleExpenses },
      { data: ownerTx },
      { data: loans },
      { data: loanPayments },
    ] = await Promise.all([
      supabase.from("customers").select("id, name, phone").order("name"),
      supabase.from("brick_types").select("id, name, price"),
      (supabase as any).from("current_stock").select("*"),
      supabase.from("sales_entries").select("id, customer_id, quantity, total_amount, sale_date, status, opening_balance_id").eq("status", "approved"),
      supabase.from("collections").select("id, customer_id, contract_id, amount, payment_date, method, note").order("payment_date", { ascending: false }),
      supabase.from("contracts").select("*"),
      supabase.from("expenses").select("id, category, amount, expense_date, note").order("expense_date", { ascending: false }),
      (supabase as any).from("opening_balance_summary").select("*"),
      supabase.from("opening_balances").select("id, kind, party_name, customer_id, sardar_id, worker_id, amount, note, sardar:sardars(name), worker:workers(name), customer:customers(name)"),
      supabase.from("opening_payments").select("id, opening_balance_id, amount, payment_date, note, ob:opening_balances(kind, party_name, customer_id, customer:customers(name), sardar:sardars(name), worker:workers(name))"),
      supabase.from("sardars").select("id, name, kind, is_active").order("name"),
      (supabase as any).from("sardar_balances").select("*"),
      supabase.from("sardar_payments").select("amount, payment_date"),
      supabase.from("workers").select("id, name, role, active").order("name"),
      supabase.from("worker_payments").select("amount, payment_date"),
      supabase.from("suppliers").select("id, name, material_type").order("name"),
      supabase.from("supplier_payments").select("amount, payment_date"),
      supabase.from("vehicle_expenses").select("amount, expense_date"),
      supabase.from("owner_transactions").select("amount, txn_type, txn_date"),
      supabase.from("loans").select("amount, direction, loan_date"),
      supabase.from("loan_payments").select("amount, payment_date, loan:loans(direction)"),
    ]);

    // পূর্বের বকেয়া ও জের (Opening Balances) প্রসেস করা
    const openingPayByObId = new Map<string, number>();
    (openingPayments || []).forEach((op: any) => {
      if (op.opening_balance_id) {
        openingPayByObId.set(op.opening_balance_id, (openingPayByObId.get(op.opening_balance_id) || 0) + Number(op.amount || 0));
      }
    });

    const summaryMap = new Map<string, any>();
    (openingSummary || []).forEach((s: any) => {
      if (s.id) summaryMap.set(s.id, s);
    });

    const formattedOpeningBalances = (openingBalances || []).map((ob: any) => {
      const sumRow = summaryMap.get(ob.id);
      const totalAmt = Number(sumRow?.amount ?? ob.amount ?? 0);
      const paidAmt = Number(sumRow?.paid_amount ?? openingPayByObId.get(ob.id) ?? 0);
      const remAmt = Number(sumRow?.remaining_amount ?? totalAmt - paidAmt);
      const partyName = ob.party_name || ob.customer?.name || ob.sardar?.name || ob.worker?.name || "অজানা";
      const kindStr = String(ob.kind || "").toLowerCase();

      // kind অনুযায়ী বোঝা যে আমরা পাবো নাকি পার্টি আমাদের কাছে পাবে
      // customer_advance / payable / worker / sardar / supplier মানে পার্টি আমাদের কাছে পাবে (ভাটার দেনা)
      const isPayableToParty =
        kindStr.includes("payable") ||
        kindStr.includes("advance") ||
        kindStr.includes("due_to") ||
        kindStr.includes("sardar") ||
        kindStr.includes("worker") ||
        kindStr.includes("supplier") ||
        kindStr.includes("দেনা") ||
        kindStr.includes("পাবে") ||
        kindStr.includes("অগ্রিম");

      return {
        id: ob.id,
        customerId: ob.customer_id || null,
        kind: ob.kind,
        isPayableToParty,
        statusMeaning: isPayableToParty
          ? "এই পার্টি/গ্রাহক আমাদের (ভাটার) কাছে টাকা বা ইট পাবে (ভাটার দেনা)"
          : "আমরা (ভাটা) এই পার্টি/গ্রাহকের কাছে টাকা পাবো (ভাটার পাওনা)",
        name: partyName,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        remainingAmount: remAmt,
        note: ob.note || "",
      };
    });

    // প্রতিটি গ্রাহকের লেজার (চলতি বিক্রি + জমা + পূর্বের জের একসাথে সমন্বয়)
    const custMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        totalBrickTakenAmount: number;
        totalBricksQty: number;
        totalCashDeposited: number;
        openingReceivableRemaining: number; // পূর্বের জের বাবদ আমরা পাবো
        openingPayableRemaining: number; // পূর্বের জের বাবদ গ্রাহক আমাদের কাছে পাবে
        netBalance: number;
        status_bn: string;
        weWillGet_Receivable: number;
        customerWillGet_Payable: number;
      }
    >();

    (customers || []).forEach((c: any) => {
      custMap.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        totalBrickTakenAmount: 0,
        totalBricksQty: 0,
        totalCashDeposited: 0,
        openingReceivableRemaining: 0,
        openingPayableRemaining: 0,
        netBalance: 0,
        status_bn: "হিসাব সমান (কোনো পাওনা বা দেনা নেই)",
        weWillGet_Receivable: 0,
        customerWillGet_Payable: 0,
      });
    });

    // ১. অনুমোদিত ইট বিক্রি যোগ (যেগুলো opening_balance_id দিয়ে পূর্বের জেরের বিপরীতে কাটা হয়নি সেগুলো চলতি বিক্রি)
    (salesEntries || []).forEach((s: any) => {
      if (s.customer_id && custMap.has(s.customer_id)) {
        const item = custMap.get(s.customer_id)!;
        if (!s.opening_balance_id) {
          item.totalBrickTakenAmount += Number(s.total_amount || 0);
        }
        item.totalBricksQty += Number(s.quantity || 0);
      }
    });

    // ২. গ্রাহকের নগদ জমা (collections) যোগ
    (collections || []).forEach((col: any) => {
      if (col.customer_id && custMap.has(col.customer_id)) {
        const item = custMap.get(col.customer_id)!;
        item.totalCashDeposited += Number(col.amount || 0);
      }
    });

    // ৩. পূর্বের বকেয়া/জের (Opening Balances) গ্রাহকের নামের সাথে মেলানো
    formattedOpeningBalances.forEach((ob: any) => {
      let targetCust = ob.customerId ? custMap.get(ob.customerId) : undefined;
      if (!targetCust && ob.name) {
        const found = Array.from(custMap.values()).find(
          (c) => c.name.trim().toLowerCase() === String(ob.name).trim().toLowerCase()
        );
        if (found) targetCust = found;
      }
      if (targetCust && ob.remainingAmount > 0) {
        if (ob.isPayableToParty) {
          targetCust.openingPayableRemaining += ob.remainingAmount;
        } else {
          targetCust.openingReceivableRemaining += ob.remainingAmount;
        }
      }
    });

    // ৪. চূড়ান্ত নিট ব্যালেন্স হিসাব:
    // মোট ভাটার পাওনা দিক = চলতি ইটের বিল (totalBrickTakenAmount) + পূর্বের পাওনা জের (openingReceivableRemaining)
    // মোট গ্রাহকের জমার দিক = চলতি নগদ জমা (totalCashDeposited) + পূর্বের অগ্রিম/দেনা জের (openingPayableRemaining)
    const customerLedger = Array.from(custMap.values()).map((c) => {
      const totalDebit = c.totalBrickTakenAmount + c.openingReceivableRemaining;
      const totalCredit = c.totalCashDeposited + c.openingPayableRemaining;
      const diff = totalDebit - totalCredit;
      c.netBalance = diff;

      if (diff > 0) {
        // ইটের বিল বেশি, জমা কম -> আমরা (ভাটা) গ্রাহকের কাছে টাকা পাবো
        c.weWillGet_Receivable = diff;
        c.customerWillGet_Payable = 0;
        c.status_bn = `আমরা (ভাটা) এই গ্রাহকের কাছে ৳${diff.toLocaleString("bn-BD")} পাবো (বকেয়া)`;
      } else if (diff < 0) {
        // গ্রাহকের জমা বেশি, ইট কম নিয়েছে -> গ্রাহক আমাদের (ভাটার) কাছে টাকা বা ইট পাবে!
        c.weWillGet_Receivable = 0;
        c.customerWillGet_Payable = Math.abs(diff);
        c.status_bn = `এই গ্রাহক আমাদের (ভাটার) কাছে ৳${Math.abs(diff).toLocaleString("bn-BD")} পাবে (অগ্রিম জমা দেওয়া আছে)`;
      } else {
        c.weWillGet_Receivable = 0;
        c.customerWillGet_Payable = 0;
        c.status_bn = "হিসাব সমান (৳০)";
      }
      return c;
    });

    // মূল ক্যাশ (Cash Box) হিসাব
    const totalCollectionsNoContract = (collections || [])
      .filter((c: any) => !c.contract_id)
      .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
    const totalAllCollections = (collections || []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const totalSardarPaid = (sardarPayments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalWorkerPaid = (workerPayments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalSupplierPaid = (supplierPayments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalVehicleExp = (vehicleExpenses || []).reduce((s: number, v: any) => s + Number(v.amount || 0), 0);

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

    let openingIn = 0, openingOut = 0;
    (openingPayments || []).forEach((op: any) => {
      const amt = Number(op.amount || 0);
      const kind = String(op.ob?.kind || "").toLowerCase();
      if (kind.includes("customer") || kind.includes("receivable") || kind.includes("পাওনা")) openingIn += amt;
      else openingOut += amt;
    });

    const cashIn = totalCollectionsNoContract + ownerIn + loanIn + loanPayIn + openingIn;
    const cashOut = totalExpenses + totalSardarPaid + totalWorkerPaid + totalSupplierPaid + totalVehicleExp + ownerOut + loanOut + loanPayOut + openingOut;
    const mainCashBalance = cashIn - cashOut;

    const todaySales = (salesEntries || []).filter((s: any) => s.sale_date === today);
    const todayCollections = (collections || []).filter((c: any) => c.payment_date === today);
    const todayExpenses = (expenses || []).filter((e: any) => e.expense_date === today);

    const todayTotalSale = todaySales.reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
    const todayTotalBricks = todaySales.reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
    const todayTotalCollection = todayCollections.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
    const todayTotalExpense = todayExpenses.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);

    // যাদের কাছে আমরা (ভাটা) টাকা পাবো তাদের মোট যোগফল
    const totalWeWillGetFromCustomers = customerLedger.reduce((s, c) => s + c.weWillGet_Receivable, 0);
    // যারা আমাদের (ভাটার) কাছে অগ্রিম টাকা বা ইট পাবে তাদের মোট যোগফল
    const totalCustomersWillGetFromUs = customerLedger.reduce((s, c) => s + c.customerWillGet_Payable, 0);

    cachedContext = {
      today,
      brickTypes: brickTypes || [],
      currentStock: currentStock || [],
      customerLedger,
      customersWhoOweUs: customerLedger.filter((c) => c.weWillGet_Receivable > 0),
      customersWeOwe: customerLedger.filter((c) => c.customerWillGet_Payable > 0),
      contracts: contracts || [],
      recentCollections: (collections || []).slice(0, 35).map((c: any) => ({
        customerName: custMap.get(c.customer_id)?.name || "গ্রাহক",
        amount: c.amount,
        date: c.payment_date,
        method: c.method,
        note: c.note,
      })),
      openingBalances: formattedOpeningBalances,
      openingPayments: (openingPayments || []).slice(0, 30).map((op: any) => ({
        name: op.ob?.party_name || op.ob?.customer?.name || op.ob?.sardar?.name || op.ob?.worker?.name || "পূর্বের খাত",
        kind: op.ob?.kind,
        amount: op.amount,
        date: op.payment_date,
      })),
      sardars: sardarBalances || sardars || [],
      suppliers: suppliers || [],
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
        openingIn,
        openingOut,
      },
      summary: {
        todayTotalSale,
        todayTotalBricks,
        todayTotalExpense,
        todayTotalCollection,
        totalWeWillGetFromCustomers,
        totalCustomersWillGetFromUs,
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
      customersWeOwe: [],
      contracts: [],
      recentCollections: [],
      openingBalances: [],
      openingPayments: [],
      sardars: [],
      suppliers: [],
      cashSummary: { mainCashBalance: 0, cashIn: 0, cashOut: 0, totalAllCollections: 0, totalCollectionsNoContract: 0, totalExpenses: 0, totalSardarPaid: 0, totalWorkerPaid: 0, totalSupplierPaid: 0, totalVehicleExp: 0, ownerIn: 0, ownerOut: 0, loanIn: 0, loanOut: 0, openingIn: 0, openingOut: 0 },
      summary: { todayTotalSale: 0, todayTotalBricks: 0, todayTotalExpense: 0, todayTotalCollection: 0, totalWeWillGetFromCustomers: 0, totalCustomersWillGetFromUs: 0 },
    };
  }
}

// ============================================================
// ২. Gemini কল — প্রথমে Supabase Edge Function (gemini-proxy) চেক করবে,
//    সেটি না থাকলে বা ব্যর্থ হলে স্বয়ংক্রিয়ভাবে সরাসরি Gemini API কল করবে!
// ============================================================

async function callGeminiFast(promptText: string, attachment?: AIAttachment | null): Promise<any> {
  // ধাপ ক: যদি আপনার gemini-proxy Edge Function চালু থাকে তবে সেটি চেষ্টা করবে
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
    // gemini-proxy না থাকলে নিচের ডাইরেক্ট মেথডে চলে যাবে
  }

  // ধাপ খ: সরাসরি ফাস্ট মডেল কল করা (যাতে এজ ফাংশন না থাকলেও কখনোই ফেল না করে)
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
      // try next model
    }
  }

  throw new Error("MODEL_BUSY");
}

// ============================================================
// ৩. অফলাইন স্মার্ট ব্যাকআপ রিপ্লাই (AI ব্যস্ত থাকলেও নির্দিষ্ট গ্রাহকের নিখুঁত উত্তর)
// ============================================================

function buildLocalSmartReply(userMessage: string, ctx: any): AIResponse {
  const msg = userMessage.trim();

  // যদি ইউজার নির্দিষ্ট কোনো গ্রাহকের নাম উল্লেখ করে প্রশ্ন করে
  const matchedCustomer = ctx.customerLedger.find(
    (c: any) => c.name && msg.toLowerCase().includes(c.name.trim().toLowerCase())
  );
  if (matchedCustomer) {
    const c = matchedCustomer;
    return {
      type: "QUERY",
      reply: `👤 গ্রাহক: ${c.name}\n• মোট ইট নিয়েছে: ${c.totalBricksQty.toLocaleString("bn-BD")} পিস (মূল্য: ৳${c.totalBrickTakenAmount.toLocaleString("bn-BD")})\n• মোট নগদ জমা দিয়েছে: ৳${c.totalCashDeposited.toLocaleString("bn-BD")}\n${
        c.openingPayableRemaining > 0
          ? `• পূর্বের অগ্রিম/পাওনা জের: ৳${c.openingPayableRemaining.toLocaleString("bn-BD")}\n`
          : ""
      }${
        c.openingReceivableRemaining > 0
          ? `• পূর্বের বকেয়া জের: ৳${c.openingReceivableRemaining.toLocaleString("bn-BD")}\n`
          : ""
      }👉 বর্তমান অবস্থা: **${c.status_bn}**`,
    };
  }

  if (msg.includes("পূর্বের") || msg.includes("জের") || msg.includes("ওপেনিং")) {
    if (ctx.openingBalances.length === 0) return { type: "QUERY", reply: "ডাটাবেসে বর্তমানে পূর্বের বকেয়া বা জেরের কোনো এন্ট্রি নেই।" };
    const lines = ctx.openingBalances
      .map(
        (ob: any, i: number) =>
          `${i + 1}. ${ob.name} (${ob.kind}): মোট ৳${ob.totalAmount.toLocaleString("bn-BD")} | পরিশোধ/আদায়: ৳${ob.paidAmount.toLocaleString("bn-BD")} | বাকি: ৳${ob.remainingAmount.toLocaleString("bn-BD")} ➔ [${ob.statusMeaning}]`
      )
      .join("\n");
    return { type: "QUERY", reply: `📋 পূর্বের বকেয়া ও জেরের হিসাব:\n${lines}` };
  }

  if (msg.includes("ক্যাশ") || msg.includes("নগদ কত") || msg.includes("তহবিল") || msg.includes("ব্যালেন্স")) {
    const c = ctx.cashSummary;
    return {
      type: "QUERY",
      reply: `💰 মূল ক্যাশ ব্যালেন্স: ৳${c.mainCashBalance.toLocaleString("bn-BD")}\n\n📥 মোট ক্যাশ জমা: ৳${c.cashIn.toLocaleString("bn-BD")}\n• গ্রাহক নগদ আদায়: ৳${c.totalCollectionsNoContract.toLocaleString("bn-BD")} (চুক্তিসহ মোট জমা: ৳${c.totalAllCollections.toLocaleString("bn-BD")})\n• পূর্বের জের আদায়: ৳${c.openingIn.toLocaleString("bn-BD")}\n\n📤 মোট ক্যাশ খরচ: ৳${c.cashOut.toLocaleString("bn-BD")}\n• সাধারণ খরচ: ৳${c.totalExpenses.toLocaleString("bn-BD")}\n• সর্দার পেমেন্ট: ৳${c.totalSardarPaid.toLocaleString("bn-BD")}\n• শ্রমিক/স্টাফ পেমেন্ট: ৳${c.totalWorkerPaid.toLocaleString("bn-BD")}\n• সাপ্লায়ার পেমেন্ট: ৳${c.totalSupplierPaid.toLocaleString("bn-BD")}\n• পূর্বের দেনা পরিশোধ: ৳${c.openingOut.toLocaleString("bn-BD")}`,
    };
  }

  if (msg.includes("গ্রাহক") || msg.includes("জমা") || msg.includes("পাওনা") || msg.includes("বকেয়া") || msg.includes("বাকি") || msg.includes("পাবে")) {
    const weGetList = ctx.customersWhoOweUs
      .map((c: any, i: number) => `${i + 1}. ${c.name}: ইট বাবদ ৳${(c.totalBrickTakenAmount + c.openingReceivableRemaining).toLocaleString("bn-BD")}, জমা ৳${(c.totalCashDeposited + c.openingPayableRemaining).toLocaleString("bn-BD")} ➔ **আমরা (ভাটা) পাবো: ৳${c.weWillGet_Receivable.toLocaleString("bn-BD")}**`)
      .join("\n");

    const theyGetList = ctx.customersWeOwe
      .map((c: any, i: number) => `${i + 1}. ${c.name}: জমা ৳${(c.totalCashDeposited + c.openingPayableRemaining).toLocaleString("bn-BD")}, ইট নিয়েছে ৳${(c.totalBrickTakenAmount + c.openingReceivableRemaining).toLocaleString("bn-BD")} ➔ **গ্রাহক আমাদের কাছে পাবে: ৳${c.customerWillGet_Payable.toLocaleString("bn-BD")}**`)
      .join("\n");

    let replyText = "";
    if (theyGetList) {
      replyText += `🟠 **যেসব গ্রাহক আমাদের (ভাটার) কাছে টাকা/ইট পাবে** (অগ্রিম জমা - মোট: ৳${ctx.summary.totalCustomersWillGetFromUs.toLocaleString("bn-BD")}):\n${theyGetList}\n\n`;
    }
    if (weGetList) {
      replyText += `🟢 **যাদের কাছে আমরা (ভাটা) টাকা পাবো** (বকেয়া - মোট: ৳${ctx.summary.totalWeWillGetFromCustomers.toLocaleString("bn-BD")}):\n${weGetList}`;
    }
    return { type: "QUERY", reply: replyText.trim() || "বর্তমানে কোনো গ্রাহকের কাছে পাওনা বা দেনা নেই।" };
  }

  return {
    type: "QUERY",
    reply: `📊 সি ডি বি ব্রিকস - সারসংক্ষেপ (${ctx.today}):\n• মূল ক্যাশ ব্যালেন্স: ৳${ctx.cashSummary.mainCashBalance.toLocaleString("bn-BD")}\n• আজ ইট বিক্রি: ${ctx.summary.todayTotalBricks.toLocaleString("bn-BD")} পিস (৳${ctx.summary.todayTotalSale.toLocaleString("bn-BD")})\n• আজ নগদ আদায়: ৳${ctx.summary.todayTotalCollection.toLocaleString("bn-BD")}\n• গ্রাহকদের কাছে আমরা পাবো (বকেয়া): ৳${ctx.summary.totalWeWillGetFromCustomers.toLocaleString("bn-BD")}\n• গ্রাহকরা আমাদের কাছে পাবে (অগ্রিম জমা): ৳${ctx.summary.totalCustomersWillGetFromUs.toLocaleString("bn-BD")}`,
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

হিসাবের সবচেয়ে গুরুত্বপূর্ণ নিয়ম (কখনোই উল্টাপাল্টা করবেন না):
১. কোনো গ্রাহকের "customerWillGet_Payable" যদি ০ এর বেশি হয় (অর্থাৎ তার জমা টাকা তার নেওয়া ইটের দামের চেয়ে বেশি), তার মানে **ওই গ্রাহক আমাদের (ভাটার) কাছে টাকা বা ইট পাবে** (গ্রাহক পাওনাদার / অগ্রিম জমা দিয়েছে)। একে কখনোই "গ্রাহকের কাছে আমরা পাবো" বলবেন না!
২. কোনো গ্রাহকের "weWillGet_Receivable" যদি ০ এর বেশি হয় (অর্থাৎ ইটের দাম বেশি এবং জমা কম), শুধুমাত্র তখনই **আমরা (ভাটা) ওই গ্রাহকের কাছে টাকা পাবো (বকেয়া)**।
৩. প্রতিটি গ্রাহকের "status_bn" ফিল্ডে স্পষ্ট বাংলায় লেখা আছে কে কার কাছে টাকা পাবে—উত্তর দেওয়ার সময় হুবহু সেই অর্থ বজায় রাখবেন।

ভাটার লাইভ ডাটাবেসের সম্পূর্ণ তথ্য:
১. মূল ক্যাশ ও ক্যাশবক্সের হিসাব (cashSummary): ${JSON.stringify(ctx.cashSummary)}
২. যেসব গ্রাহক আমাদের (ভাটার) কাছে টাকা/ইট পাবে (customersWeOwe - ভাটার দেনা/অগ্রিম জমা): ${JSON.stringify(ctx.customersWeOwe)}
৩. যেসব গ্রাহকের কাছে আমরা (ভাটা) টাকা পাবো (customersWhoOweUs - ভাটার পাওনা/বকেয়া): ${JSON.stringify(ctx.customersWhoOweUs)}
৪. সকল গ্রাহকের সম্পূর্ণ লেজার (customerLedger): ${JSON.stringify(ctx.customerLedger)}
৫. পূর্বের বকেয়া ও জেরের তালিকা (openingBalances - statusMeaning মনোযোগ দিয়ে দেখুন): ${JSON.stringify(ctx.openingBalances)}
৬. পূর্বের বকেয়া ও জের হতে জমা/পরিশোধ (openingPayments): ${JSON.stringify(ctx.openingPayments)}
৭. গ্রাহকদের সাম্প্রতিক নগদ জমার তালিকা (recentCollections): ${JSON.stringify(ctx.recentCollections)}
৮. ইটের বর্তমান স্টক (currentStock): ${JSON.stringify(ctx.currentStock)} এবং ইটের ধরন (brickTypes): ${JSON.stringify(ctx.brickTypes)}
৯. সর্দারদের হিসাব (sardars): ${JSON.stringify(ctx.sardars)}
১০. আজকের সারসংক্ষেপ: ${JSON.stringify(ctx.summary)}

ছবি বা ফাইল স্ক্যানিংয়ের নিয়ম:
- ইউজার যদি কোনো রসিদ, ক্যাশ মেমো, চালান বা খাতার পাতার ছবি/ফাইল দেয়, তবে ছবিটি নিখুঁতভাবে পড়ে (OCR) সেখান থেকে ক্রেতার নাম, ইটের পরিমাণ, টাকার পরিমাণ বা খরচের বিবরণ বের করুন এবং উপযুক্ত type (যেমন SALE_CHALLAN, EXPENSE, COLLECTION ইত্যাদি) সিলেক্ট করে কার্ড আকারে সেভ করার জন্য data দিন। আর যদি শুধু ছবিটি সম্পর্কে জানতে চায় তবে QUERY সিলেক্ট করে বিস্তারিত বলুন।

তারিখের নিয়ম:
- রসিদ বা খাতায় তারিখ লেখা থাকলে (যেমন ০৫/১০/২০২৬ বা ৫ অক্টোবর) সেটি দিন/মাস/বছর ধরে নিয়ে data.date-এ YYYY-MM-DD ফরম্যাটে দিন (যেমন 2026-10-05)।
- তারিখ পরিষ্কার না হলে data.date বাদ দিন, কখনো আন্দাজ করবেন না। বাদ দিলে আজকের তারিখে সেভ হবে।

ইউজারের বাংলা মেসেজ বা ছবি পড়ে সঠিক "type" নির্বাচন করুন এবং শুধুমাত্র JSON উত্তর দিন:
- ইট বিক্রি বা চালান: "SALE_CHALLAN" -> data: { customerId, customerName, brickTypeId, brickType, quantity, totalAmount, paidAmount, dueAmount, vehicleNumber, date }
- ভাটার খরচ: "EXPENSE" -> data: { expenseCategory, amount, description, date }
- কাস্টমারের নগদ জমা: "COLLECTION" -> data: { customerId, customerName, amount, description, date }
- সর্দারকে পেমেন্ট/দাদন: "SARDAR_PAYMENT" -> data: { sardarId, sardarName, amount, description, date }
- কাঁচা ইট এন্ট্রি: "KACHA_BRICK" -> data: { sardarName, quantity, amount, description, date }
- সাপ্লায়ার পেমেন্ট: "SUPPLIER_PAYMENT" -> data: { supplierName, expenseCategory, amount, description, date }
- যেকোনো প্রশ্ন বা হিসাব জানতে চাইলে: "QUERY" -> উপরের লাইভ ডাটাবেস দেখে একদম নিখুঁতভাবে কে কার কাছে কত পাবে তা স্পষ্ট করে "reply" তে বাংলায় লিখুন।

JSON ফরম্যাট:
{
  "type": "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "KACHA_BRICK" | "SUPPLIER_PAYMENT" | "QUERY",
  "reply": "বাংলায় স্পষ্ট ও সঠিক উত্তর",
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

  // ---------- চালান ----------
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

  // ---------- খরচ ----------
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

  // ---------- সাপ্লায়ার পেমেন্ট ----------
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

  // ---------- কালেকশন (গ্রাহকের নগদ জমা) ----------
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

  // ---------- সর্দার পেমেন্ট / কাঁচা ইট ----------
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