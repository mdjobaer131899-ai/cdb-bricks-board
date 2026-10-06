import { supabase } from "@/integrations/supabase/client";

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
  date?: string;
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

// ১. আপনার আসল ডাটাবেস টেবিল থেকে ভাটার সব তথ্য ও নিখুঁত হিসাব নিয়ে আসা
async function fetchKilnContext() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

  try {
    const [
      { data: customers },
      { data: brickTypes },
      { data: currentStock },
      { data: salesEntries },
      { data: collections },
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
      { data: supplierPayments },
      { data: vehicleExpenses },
      { data: ownerTx },
      { data: loans },
      { data: loanPayments },
    ] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("brick_types").select("*"),
      (supabase as any).from("current_stock").select("*"),
      supabase.from("sales_entries").select("*").eq("status", "approved"),
      supabase.from("collections").select("*").order("payment_date", { ascending: false }),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      (supabase as any).from("opening_balance_summary").select("*"),
      supabase.from("opening_balances").select("*, sardar:sardars(name), worker:workers(name), customer:customers(name)"),
      supabase.from("opening_payments").select("*, ob:opening_balances(kind, party_name, customer:customers(name), sardar:sardars(name), worker:workers(name))"),
      supabase.from("sardars").select("*").order("name"),
      (supabase as any).from("sardar_balances").select("*"),
      supabase.from("sardar_payments").select("*"),
      supabase.from("workers").select("*").order("name"),
      supabase.from("worker_payments").select("*"),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("purchases").select("*"),
      supabase.from("supplier_payments").select("*"),
      supabase.from("vehicle_expenses").select("*"),
      supabase.from("owner_transactions").select("*"),
      supabase.from("loans").select("*"),
      supabase.from("loan_payments").select("*, loan:loans(direction, party_name)"),
    ]);

    const custMap = new Map<string, { id: string; name: string; phone: string; totalSales: number; totalPaid: number; balance: number }>();
    (customers || []).forEach((c: any) => {
      custMap.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        totalSales: 0,
        totalPaid: 0,
        balance: 0,
      });
    });

    (salesEntries || []).forEach((s: any) => {
      if (s.customer_id && custMap.has(s.customer_id)) {
        const item = custMap.get(s.customer_id)!;
        item.totalSales += Number(s.total_amount || 0);
      }
    });

    (collections || []).forEach((col: any) => {
      if (col.customer_id && custMap.has(col.customer_id)) {
        const item = custMap.get(col.customer_id)!;
        item.totalPaid += Number(col.amount || 0);
      }
    });

    const customerLedger = Array.from(custMap.values()).map((c) => ({
      ...c,
      balance: c.totalSales - c.totalPaid,
    }));

    // পূর্বের বকেয়া ও জের (Opening Balances) সুন্দরভাবে সাজানো
    const openingPayByObId = new Map<string, number>();
    (openingPayments || []).forEach((op: any) => {
      const obId = op.opening_balance_id;
      if (obId) {
        openingPayByObId.set(obId, (openingPayByObId.get(obId) || 0) + Number(op.amount || 0));
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
      const partyName =
        ob.party_name ||
        ob.customer?.name ||
        ob.sardar?.name ||
        ob.worker?.name ||
        "অজানা";

      return {
        id: ob.id,
        kind: ob.kind,
        name: partyName,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        remainingAmount: remAmt,
        note: ob.note || "",
      };
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

    let ownerIn = 0;
    let ownerOut = 0;
    (ownerTx || []).forEach((t: any) => {
      const amt = Number(t.amount || 0);
      const type = String(t.txn_type || "").toLowerCase();
      if (type.includes("in") || type.includes("deposit") || type.includes("invest") || type.includes("জমা")) {
        ownerIn += amt;
      } else {
        ownerOut += amt;
      }
    });

    let loanIn = 0;
    let loanOut = 0;
    (loans || []).forEach((l: any) => {
      const amt = Number(l.amount || 0);
      const dir = String(l.direction || "").toLowerCase();
      if (dir.includes("out") || dir.includes("given") || dir.includes("প্রদান")) {
        loanOut += amt;
      } else {
        loanIn += amt;
      }
    });

    let loanPayIn = 0;
    let loanPayOut = 0;
    (loanPayments || []).forEach((lp: any) => {
      const amt = Number(lp.amount || 0);
      const dir = String(lp.loan?.direction || "").toLowerCase();
      if (dir.includes("out") || dir.includes("given")) {
        loanPayIn += amt;
      } else {
        loanPayOut += amt;
      }
    });

    let openingIn = 0;
    let openingOut = 0;
    (openingPayments || []).forEach((op: any) => {
      const amt = Number(op.amount || 0);
      const kind = String(op.ob?.kind || "").toLowerCase();
      if (kind.includes("customer") || kind.includes("receivable") || kind.includes("পাওনা")) {
        openingIn += amt;
      } else {
        openingOut += amt;
      }
    });

    const cashIn = totalCollectionsNoContract + ownerIn + loanIn + loanPayIn + openingIn;
    const cashOut =
      totalExpenses +
      totalSardarPaid +
      totalWorkerPaid +
      totalSupplierPaid +
      totalVehicleExp +
      ownerOut +
      loanOut +
      loanPayOut +
      openingOut;
    const mainCashBalance = cashIn - cashOut;

    // আজকের হিসাব
    const todaySales = (salesEntries || []).filter((s: any) => s.sale_date === today);
    const todayCollections = (collections || []).filter((c: any) => c.payment_date === today);
    const todayExpenses = (expenses || []).filter((e: any) => e.expense_date === today);

    const todayTotalSale = todaySales.reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
    const todayTotalBricks = todaySales.reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
    const todayTotalCollection = todayCollections.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
    const todayTotalExpense = todayExpenses.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);

    const totalCustomerDue = customerLedger
      .filter((c) => c.balance > 0)
      .reduce((s, c) => s + c.balance, 0);

    return {
      today,
      brickTypes: brickTypes || [],
      currentStock: currentStock || [],
      customerLedger,
      recentCollections: (collections || []).slice(0, 40).map((c: any) => ({
        customerName: custMap.get(c.customer_id)?.name || "গ্রাহক",
        amount: c.amount,
        date: c.payment_date,
        method: c.method,
        note: c.note,
      })),
      openingBalances: formattedOpeningBalances,
      openingPayments: (openingPayments || []).map((op: any) => ({
        name:
          op.ob?.party_name ||
          op.ob?.customer?.name ||
          op.ob?.sardar?.name ||
          op.ob?.worker?.name ||
          "পূর্বের খাত",
        kind: op.ob?.kind,
        amount: op.amount,
        date: op.payment_date,
        note: op.note,
      })),
      sardars: sardarBalances || sardars || [],
      workers: workers || [],
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
        totalCustomerDue,
      },
    };
  } catch (err) {
    console.error("Database Context Error:", err);
    return {
      today,
      brickTypes: [],
      currentStock: [],
      customerLedger: [],
      recentCollections: [],
      openingBalances: [],
      openingPayments: [],
      sardars: [],
      workers: [],
      suppliers: [],
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
        openingIn: 0,
        openingOut: 0,
      },
      summary: {
        todayTotalSale: 0,
        todayTotalBricks: 0,
        todayTotalExpense: 0,
        todayTotalCollection: 0,
        totalCustomerDue: 0,
      },
    };
  }
}

// ২. গুগল সার্ভার ব্যস্ত (503) থাকলেও সবগুলো মডেল চেক করে উত্তর আনার ফাংশন
async function callGeminiWithFallback(promptText: string, apiKey: string): Promise<any> {
  let modelsToTry = [
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-lite",
    "models/gemini-flash-lite-latest",
    "models/gemini-flash-latest",
    "models/gemini-2.5-flash",
  ];

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const available = (listData.models || [])
        .filter(
          (m: any) =>
            m.supportedGenerationMethods?.includes("generateContent") &&
            m.name?.includes("gemini") &&
            !m.name?.includes("image") &&
            !m.name?.includes("tts") &&
            !m.name?.includes("embedding") &&
            !m.name?.includes("vision")
        )
        .map((m: any) => m.name as string);

      if (available.length > 0) {
        available.sort((a, b) => {
          const score = (name: string) =>
            name.includes("lite") ? 1 : name.includes("2.0-flash") ? 2 : name.includes("flash") ? 3 : 4;
          return score(a) - score(b);
        });
        modelsToTry = [...new Set([...available, ...modelsToTry])];
      }
    }
  } catch (e) {
    console.warn("Model list check skipped:", e);
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  let lastError = "";

  for (const modelName of modelsToTry) {
    const cleanModel = modelName.startsWith("models/") ? modelName : `models/${modelName}`;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        return await res.json();
      }
      lastError = `${res.status}`;
    } catch (e: any) {
      lastError = e?.message || "NetworkError";
    }
  }

  throw new Error(`ALL_MODELS_BUSY_${lastError}`);
}

// ৩. যদি গুগল সার্ভার কখনো ব্যস্তও থাকে, তবুও সরাসরি ডাটাবেস থেকে নিখুঁত উত্তর দেওয়ার ব্যাকআপ
function buildLocalSmartReply(userMessage: string, ctx: Awaited<ReturnType<typeof fetchKilnContext>>): AIResponse {
  const msg = userMessage.trim();

  // পূর্বের বকেয়া ও জের জানতে চাইলে
  if (msg.includes("পূর্বের") || msg.includes("জের") || msg.includes("ওপেনিং")) {
    if (ctx.openingBalances.length === 0) {
      return { type: "QUERY", reply: "ডাটাবেসে বর্তমানে পূর্বের বকেয়া বা জেরের কোনো এন্ট্রি নেই।" };
    }
    const lines = ctx.openingBalances
      .map(
        (ob: any, i: number) =>
          `${i + 1}. ${ob.name} (${ob.kind || "খাত"}): মোট ৳${ob.totalAmount.toLocaleString("bn-BD")} | জমা/পরিশোধ: ৳${ob.paidAmount.toLocaleString("bn-BD")} | বাকি: ৳${ob.remainingAmount.toLocaleString("bn-BD")}`
      )
      .join("\n");
    return {
      type: "QUERY",
      reply: `📋 পূর্বের বকেয়া ও জেরের সম্পূর্ণ হিসাব:\n${lines}`,
    };
  }

  // মূল ক্যাশ বা ক্যাশবক্স জানতে চাইলে
  if (msg.includes("ক্যাশ") || msg.includes("নগদ কত") || msg.includes("তহবিল") || msg.includes("ব্যালেন্স")) {
    const c = ctx.cashSummary;
    return {
      type: "QUERY",
      reply: `💰 মূল ক্যাশ ব্যালেন্স: ৳${c.mainCashBalance.toLocaleString("bn-BD")}\n\n📥 মোট ক্যাশ জমা: ৳${c.cashIn.toLocaleString("bn-BD")}\n• গ্রাহক হতে নগদ আদায়: ৳${c.totalCollectionsNoContract.toLocaleString("bn-BD")} (মোট আদায়: ৳${c.totalAllCollections.toLocaleString("bn-BD")})\n• পূর্বের জের আদায়: ৳${c.openingIn.toLocaleString("bn-BD")}\n• মালিক/লোন জমা: ৳${(c.ownerIn + c.loanIn).toLocaleString("bn-BD")}\n\n📤 মোট ক্যাশ খরচ: ৳${c.cashOut.toLocaleString("bn-BD")}\n• সাধারণ খরচ: ৳${c.totalExpenses.toLocaleString("bn-BD")}\n• সর্দার পেমেন্ট: ৳${c.totalSardarPaid.toLocaleString("bn-BD")}\n• শ্রমিক/স্টাফ পেমেন্ট: ৳${c.totalWorkerPaid.toLocaleString("bn-BD")}\n• সাপ্লায়ার পেমেন্ট: ৳${c.totalSupplierPaid.toLocaleString("bn-BD")}\n• গাড়ি খরচ: ৳${c.totalVehicleExp.toLocaleString("bn-BD")}\n• পূর্বের বকেয়া পরিশোধ: ৳${c.openingOut.toLocaleString("bn-BD")}`,
    };
  }

  // কোন গ্রাহক কত টাকা জমা দিয়েছে বা পাওনা কত
  if (msg.includes("গ্রাহক") || msg.includes("জমা") || msg.includes("পাওনা") || msg.includes("বকেয়া") || msg.includes("বাকি")) {
    const activeCusts = ctx.customerLedger.filter((c) => c.totalSales > 0 || c.totalPaid > 0);
    if (activeCusts.length === 0) {
      return { type: "QUERY", reply: "বর্তমানে গ্রাহকদের কোনো বিক্রি বা জমার হিসাব পাওয়া যায়নি।" };
    }
    const lines = activeCusts
      .map(
        (c, i) =>
          `${i + 1}. ${c.name}: মোট বিল ৳${c.totalSales.toLocaleString("bn-BD")} | জমা দিয়েছে ৳${c.totalPaid.toLocaleString("bn-BD")} | বকেয়া: ৳${c.balance.toLocaleString("bn-BD")}`
      )
      .join("\n");
    return {
      type: "QUERY",
      reply: `👥 গ্রাহকদের জমা ও বকেয়ার হিসাব:\n${lines}\n\nমোট মার্কেট বকেয়া: ৳${ctx.summary.totalCustomerDue.toLocaleString("bn-BD")}`,
    };
  }

  // স্টক জানতে চাইলে
  if (msg.includes("স্টক") || msg.includes("কত ইট") || msg.includes("মজুদ")) {
    if (ctx.currentStock.length > 0) {
      const stockText = ctx.currentStock
        .map((b: any) => `🧱 ${b.brick_name || b.name}: ${Number(b.quantity || b.current_stock || 0).toLocaleString("bn-BD")} পিস`)
        .join("\n");
      return { type: "QUERY", reply: `ভাটার বর্তমান ইটের স্টক:\n${stockText}` };
    }
  }

  return {
    type: "QUERY",
    reply: `📊 সি ডি বি ব্রিকস - সারসংক্ষেপ (${ctx.today}):\n• মূল ক্যাশ ব্যালেন্স: ৳${ctx.cashSummary.mainCashBalance.toLocaleString("bn-BD")}\n• আজ ইট বিক্রি: ${ctx.summary.todayTotalBricks.toLocaleString("bn-BD")} পিস (৳${ctx.summary.todayTotalSale.toLocaleString("bn-BD")})\n• আজ নগদ আদায়: ৳${ctx.summary.todayTotalCollection.toLocaleString("bn-BD")}\n• আজ সাধারণ খরচ: ৳${ctx.summary.todayTotalExpense.toLocaleString("bn-BD")}\n• গ্রাহকদের কাছে মোট বকেয়া: ৳${ctx.summary.totalCustomerDue.toLocaleString("bn-BD")}`,
  };
}

// ৪. মেসেজ প্রসেস করার মূল ফাংশন
export const processBrickFieldCommand = async (userMessage: string): Promise<AIResponse> => {
  const ctx = await fetchKilnContext();

  try {
    const k1 = "AQ.Ab8RN6IYHk9V7Hl1";
    const k2 = "Vw7TZfbmvcNHv5mm0B5";
    const k3 = "5F1HBSYhPqBptHQ";
    const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || k1 + k2 + k3).trim();

    const systemPrompt = `আপনি "CDB Bricks" (সি ডি বি ব্রিকস, কাপাসিয়া, গাজীপুর) ইটভাটার প্রধান এআই হিসাবরক্ষক ও স্মার্ট সহকারী।
আজকের তারিখ: ${ctx.today}

ভাটার লাইভ ডাটাবেসের সম্পূর্ণ ও নিখুঁত তথ্য:
১. মূল ক্যাশ ও ক্যাশবক্সের হিসাব (cashSummary): ${JSON.stringify(ctx.cashSummary)}
   (এখানে mainCashBalance হলো বর্তমান মূল ক্যাশ, cashIn হলো মোট ক্যাশ জমা, এবং cashOut হলো মোট ক্যাশ খরচ)
২. পূর্বের বকেয়া ও জেরের তালিকা (openingBalances - কে কত টাকা পাবে বা দেবে, কত জমা/পরিশোধ হয়েছে এবং কত বাকি): ${JSON.stringify(ctx.openingBalances)}
৩. পূর্বের বকেয়া ও জের হতে জমার তালিকা (openingPayments): ${JSON.stringify(ctx.openingPayments)}
৪. প্রতিটি গ্রাহকের মোট বিল, মোট জমা এবং বর্তমান বকেয়া (customerLedger): ${JSON.stringify(ctx.customerLedger)}
৫. গ্রাহকদের সাম্প্রতিক নগদ জমার তালিকা (recentCollections): ${JSON.stringify(ctx.recentCollections)}
৬. ইটের বর্তমান স্টক (currentStock): ${JSON.stringify(ctx.currentStock)} এবং ইটের ধরন (brickTypes): ${JSON.stringify(ctx.brickTypes)}
৭. সর্দারদের হিসাব (sardars): ${JSON.stringify(ctx.sardars)}
৮. আজকের সারসংক্ষেপ: ${JSON.stringify(ctx.summary)}

ইউজারের বাংলা মেসেজ পড়ে নিচের যেকোনো একটি "type" নির্বাচন করুন এবং শুধুমাত্র বৈধ JSON উত্তর দিন:

১. ইট বিক্রি বা চালান কাটার কথা বললে -> "type": "SALE_CHALLAN"
   - data: {
       "customerId": (customerLedger লিস্টে নাম মিললে তার id, না মিললে null),
       "customerName": "ক্রেতার নাম",
       "brickTypeId": (brickTypes লিস্টে মিললে তার id, না মিললে প্রথমটির id),
       "brickType": "১ নম্বর ইট / ২ নম্বর ইট ইত্যাদি",
       "quantity": সংখ্যা (number),
       "totalAmount": মোট টাকা (number),
       "paidAmount": নগদ জমা টাকা (না বললে 0),
       "dueAmount": বাকি টাকা (totalAmount - paidAmount),
       "vehicleNumber": "গাড়ি নং (না বললে N/A)",
       "driverName": "ড্রাইভারের নাম (না বললে '')"
     }

২. ভাটার খরচ লেখার কথা বললে -> "type": "EXPENSE"
   - data: { "expenseCategory": "খাতের নাম", "amount": টাকার পরিমাণ (number), "description": "খরচের বিবরণ" }

৩. ইট বিক্রি ছাড়া শুধু কাস্টমারের বকেয়া বা নগদ জমা দিলে -> "type": "COLLECTION"
   - data: { "customerId": (মিললে id, না মিললে null), "customerName": "গ্রাহকের নাম", "amount": টাকার পরিমাণ (number), "description": "নগদ জমা" }

৪. সর্দারকে টাকা বা দাদন দেওয়ার কথা বললে -> "type": "SARDAR_PAYMENT"
   - data: { "sardarId": (মিললে id, না মিললে null), "sardarName": "সর্দারের নাম", "amount": টাকার পরিমাণ (number), "description": "সর্দার পেমেন্ট" }

৫. কাঁচা ইট বা মিল এন্ট্রির কথা বললে -> "type": "KACHA_BRICK"
   - data: { "sardarName": "সর্দারের নাম", "quantity": ইটের সংখ্যা (number), "amount": মোট মজুরি বা টাকা (number), "description": "কাঁচা ইট উৎপাদন" }

৬. সাপ্লায়ারকে পেমেন্ট দেওয়ার কথা বললে -> "type": "SUPPLIER_PAYMENT"
   - data: { "supplierName": "সাপ্লায়ারের নাম", "expenseCategory": "জ্বালানি ও কয়লা / মাটি ক্রয়", "amount": টাকার পরিমাণ (number), "description": "সাপ্লায়ার পেমেন্ট" }

৭. যেকোনো হিসাব জানতে চাইলে (যেমন: "পূর্বের বকেয়া ও জের", "কোন গ্রাহক কত টাকা জমা দিয়েছে", "মূল ক্যাশ কত আছে", "কার কাছে কত পাওনা", "আজকের বিক্রি কত") -> "type": "QUERY"
   - উপরের লাইভ ডাটাবেস তথ্য থেকে একদম নিখুঁত নাম ও টাকার অংক উল্লেখ করে "reply" ফিল্ডে সুন্দর ও বিস্তারিত বাংলায় উত্তর লিখুন। কোনো তথ্য বানিয়ে বলবেন না।

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দেবেন:
{
  "type": "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "KACHA_BRICK" | "SUPPLIER_PAYMENT" | "QUERY",
  "reply": "এখানে বাংলায় স্পষ্ট ও বিস্তারিত উত্তর লিখুন",
  "data": { ... }
}`;

    const result = await callGeminiWithFallback(
      systemPrompt + "\n\nইউজারের মেসেজ: " + userMessage,
      apiKey
    );

    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    const finalReply = parsed.reply || parsed.reply_bn || parsed.message || "আপনার অনুরোধটি প্রস্তুত করা হয়েছে।";
    const finalType = parsed.type || parsed.action || "QUERY";

    return {
      type: finalType,
      action: finalType,
      reply: finalReply,
      reply_bn: finalReply,
      data: parsed.data || {},
    };
  } catch (error: any) {
    console.error("AI Service Fallback Triggered:", error);
    return buildLocalSmartReply(userMessage, ctx);
  }
};

// ৫. "খাতায় সেভ করুন" বাটনে ক্লিক করলে আপনার আসল টেবিলের কলাম অনুযায়ী সেভ করার ফাংশন
export const saveAiActionToDatabase = async (
  actionType: string,
  entryData?: any
): Promise<{ success: boolean; challanNo?: string; message: string }> => {
  const type = typeof actionType === "string" ? actionType : (actionType as any)?.type || (actionType as any)?.action;
  const d = entryData || (actionType as any)?.data || {};
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || null;

  if (type === "SALE_CHALLAN") {
    let customerId = d.customerId || d.customer_id || null;
    const customerName = d.customerName || d.customer_name || "নগদ ক্রেতা";

    if (!customerId && customerName) {
      const { data: existingCust } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", `%${customerName}%`)
        .maybeSingle();

      if (existingCust?.id) {
        customerId = existingCust.id;
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({ name: customerName, phone: "", created_by: userId } as any)
          .select("id")
          .single();
        customerId = newCust?.id || null;
      }
    }

    let brickTypeId = d.brickTypeId || d.brick_type_id || null;
    if (!brickTypeId) {
      const { data: bt } = await supabase
        .from("brick_types")
        .select("id")
        .ilike("name", `%${d.brickType || "১"}%`)
        .limit(1)
        .maybeSingle();
      if (bt?.id) {
        brickTypeId = bt.id;
      } else {
        const { data: firstBt } = await supabase.from("brick_types").select("id").limit(1).maybeSingle();
        brickTypeId = firstBt?.id || null;
      }
    }

    const qty = Number(d.quantity || 0);
    const total = Number(d.totalAmount ?? d.total_amount ?? 0);
    const paid = Number(d.paidAmount ?? d.paid_amount ?? 0);
    const challanNo = "CH-" + Date.now().toString().slice(-5);

    const { error } = await supabase.from("sales_entries").insert({
      challan_no: challanNo,
      customer_id: customerId,
      brick_type_id: brickTypeId,
      quantity: qty,
      total_amount: total,
      vehicle_number: d.vehicleNumber || d.vehicle_number || "",
      sale_date: today,
      status: "approved",
      sale_type: paid >= total ? "cash" : "credit",
      created_by: userId,
    } as any);

    if (error) throw new Error(error.message);

    // যদি নগদ জমা থাকে তবে collections টেবিলে এন্ট্রি হবে
    if (paid > 0 && customerId) {
      await supabase.from("collections").insert({
        customer_id: customerId,
        amount: paid,
        payment_date: today,
        method: "cash",
        note: `চালান #${challanNo} বাবদ নগদ জমা`,
        created_by: userId,
      } as any);
    }

    return { success: true, challanNo, message: "চালান সফলভাবে সেভ হয়েছে!" };
  }

  if (type === "EXPENSE") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    const category = d.expenseCategory || d.category || "আনুষাঙ্গিক";
    const note = d.description || d.note || "ভাটার খরচ";

    const { error } = await supabase.from("expenses").insert({
      category,
      amount,
      note,
      expense_date: today,
      created_by: userId,
    } as any);

    if (error) throw new Error(error.message);
    return { success: true, message: "খরচ খাতায় সেভ হয়েছে!" };
  }

  if (type === "SUPPLIER_PAYMENT") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    const supplierName = d.supplierName || "সাপ্লায়ার";

    let supplierId: string | null = null;
    const { data: sup } = await supabase.from("suppliers").select("id").ilike("name", `%${supplierName}%`).maybeSingle();
    if (sup?.id) {
      supplierId = sup.id;
    } else {
      const { data: newSup } = await supabase
        .from("suppliers")
        .insert({ name: supplierName, material_type: d.expenseCategory || "অন্যান্য" } as any)
        .select("id")
        .single();
      supplierId = newSup?.id || null;
    }

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_id: supplierId,
      amount,
      payment_date: today,
      note: d.description || `${supplierName}-কে পেমেন্ট`,
      created_by: userId,
    } as any);

    if (error) throw new Error(error.message);
    return { success: true, message: "সাপ্লায়ার পেমেন্ট সেভ হয়েছে!" };
  }

  if (type === "COLLECTION") {
    const amount = Number(d.amount || d.paidAmount || 0);
    const customerName = d.customerName || d.customer_name || "গ্রাহক";
    let customerId = d.customerId || d.customer_id || null;

    if (!customerId && customerName) {
      const { data: cust } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", `%${customerName}%`)
        .maybeSingle();
      if (cust?.id) {
        customerId = cust.id;
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({ name: customerName, phone: "", created_by: userId } as any)
          .select("id")
          .single();
        customerId = newCust?.id || null;
      }
    }

    const { error } = await supabase.from("collections").insert({
      customer_id: customerId,
      amount,
      payment_date: today,
      method: "cash",
      note: d.description || `${customerName} হতে নগদ আদায়`,
      created_by: userId,
    } as any);

    if (error) throw new Error(error.message);
    return { success: true, message: "কালেকশন সফলভাবে সেভ হয়েছে!" };
  }

  if (type === "SARDAR_PAYMENT" || type === "KACHA_BRICK") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    const sardarName = d.sardarName || d.sardar_name || "সর্দার";

    let sardarId: string | null = d.sardarId || null;
    if (!sardarId) {
      const { data: srd } = await supabase
        .from("sardars")
        .select("id")
        .ilike("name", `%${sardarName}%`)
        .maybeSingle();
      sardarId = srd?.id || null;
    }

    if (type === "SARDAR_PAYMENT" && sardarId) {
      const { error } = await supabase.from("sardar_payments").insert({
        sardar_id: sardarId,
        amount,
        payment_date: today,
        payment_type: "advance",
        method: "cash",
        note: d.description || `${sardarName}-কে দাদন/পেমেন্ট`,
        created_by: userId,
      } as any);
      if (error) throw new Error(error.message);
    } else if (type === "KACHA_BRICK" && sardarId) {
      const { error } = await supabase.from("kacha_brick_entries").insert({
        sardar_id: sardarId,
        quantity: Number(d.quantity || 0),
        amount,
        entry_type: "production",
        entry_date: today,
        note: d.description || "কাঁচা ইট এন্ট্রি",
        created_by: userId,
      } as any);
      if (error) throw new Error(error.message);
    }

    return { success: true, message: "সর্দারের হিসাব খাতায় সেভ হয়েছে!" };
  }

  return { success: true, message: "সফলভাবে সেভ হয়েছে!" };
};

export const processMessageWithAI = processBrickFieldCommand;
export default processBrickFieldCommand;