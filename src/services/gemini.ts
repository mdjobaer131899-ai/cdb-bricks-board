import { supabase } from "../integrations/supabase/client";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * ১. ভাটার সবগুলো আসল টেবিল ও ভিউ থেকে লাইভ ডেটা নিয়ে আসার ফাংশন
 */
async function getBrickFieldDatabaseContext() {
  try {
    const [
      customers,
      sales,
      collections,
      expenses,
      brickTypes,
      currentStock,
      rawStock,
      sardars,
      sardarBalances,
      contractSummary,
      openingSummary,
      profitLoss,
      accountBalances,
      workers,
      suppliers,
      loans
    ] = await Promise.all([
      supabase.from("customers").select("*").limit(200),
      supabase.from("sales_entries").select("*").order("sale_date", { ascending: false }).limit(100),
      supabase.from("collections").select("*").order("payment_date", { ascending: false }).limit(100),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(100),
      supabase.from("brick_types").select("*"),
      supabase.from("current_stock").select("*"),
      supabase.from("raw_material_stock").select("*"),
      supabase.from("sardars").select("*").eq("is_active", true),
      supabase.from("sardar_balances").select("*"),
      supabase.from("contract_summary").select("*"),
      supabase.from("opening_balance_summary").select("*"),
      supabase.from("profit_loss_summary").select("*"),
      supabase.from("account_balances").select("*"),
      supabase.from("workers").select("*").eq("active", true),
      supabase.from("suppliers").select("*"),
      supabase.from("loans").select("*").limit(50),
    ]);

    return JSON.stringify({
      brick_types: brickTypes.data || [],
      current_brick_stock: currentStock.data || [],
      raw_material_stock: rawStock.data || [],
      profit_loss_summary: profitLoss.data || [],
      account_balances: accountBalances.data || [],
      customers: customers.data || [],
      contract_summary: contractSummary.data || [],
      opening_balance_summary: openingSummary.data || [],
      recent_sales_challans: sales.data || [],
      recent_collections: collections.data || [],
      recent_expenses: expenses.data || [],
      sardars: sardars.data || [],
      sardar_balances: sardarBalances.data || [],
      active_workers: workers.data || [],
      suppliers: suppliers.data || [],
      loans: loans.data || [],
    });
  } catch (err) {
    console.warn("ডেটাবেস রিড করতে সমস্যা:", err);
    return "{}";
  }
}

/**
 * ২. এআই থেকে প্রাপ্ত যেকোনো কমান্ড সরাসরি Supabase ডেটাবেসে সেভ করার পূর্ণাঙ্গ ফাংশন
 */
export async function saveAiActionToDatabase(actionType: string, data: any) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  if (!userId) {
    throw new Error("লগইন তথ্য পাওয়া যায়নি। দয়া করে আবার লগইন করুন।");
  }

  const today = new Date().toISOString().split("T")[0];

  // ১) চালান বা ইট বিক্রি (SALE_CHALLAN)
  if (actionType === "SALE_CHALLAN") {
    let customerId = null;
    if (data.customerName) {
      const { data: existingCust } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", `%${data.customerName.trim()}%`)
        .maybeSingle();

      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({
            name: data.customerName.trim(),
            phone: data.phone || null,
            created_by: userId,
          })
          .select("id")
          .single();
        if (newCust) customerId = newCust.id;
      }
    }

    const { data: brickTypes } = await supabase.from("brick_types").select("*");
    let brickTypeId = brickTypes?.[0]?.id;
    if (data.brickType && brickTypes) {
      const matched = brickTypes.find((b) =>
        b.name.toLowerCase().includes(data.brickType.toLowerCase())
      );
      if (matched) brickTypeId = matched.id;
    }

    if (!brickTypeId) throw new Error("ইটের ধরন পাওয়া যায়নি।");

    const { data: challanNoData } = await supabase.rpc("next_challan_number", {
      _date: today,
      _prefix: "CH",
    });
    const challanNo = challanNoData || `CH-${Date.now().toString().slice(-5)}`;

    const qty = Number(data.quantity) || 0;
    const total = Number(data.totalAmount) || 0;
    const unitPrice = qty > 0 ? total / qty : Number(data.rate || 0) / 1000;

    const { data: saleRow, error: saleErr } = await supabase
      .from("sales_entries")
      .insert({
        challan_no: challanNo,
        customer_id: customerId,
        brick_type_id: brickTypeId,
        quantity: qty,
        unit_price: unitPrice,
        total_amount: total,
        sale_date: today,
        sale_type: "regular",
        status: "approved",
        vehicle_number: data.vehicleNumber || null,
        driver_name: data.driverName || null,
        notes: `AI চালান (${data.customerName || "নগদ"})`,
        created_by: userId,
      })
      .select("*")
      .single();

    if (saleErr) throw saleErr;

    const paid = Number(data.paidAmount) || 0;
    if (paid > 0 && customerId) {
      await supabase.from("collections").insert({
        customer_id: customerId,
        amount: paid,
        payment_date: today,
        method: "cash",
        note: `চালান #${challanNo} বাবদ নগদ জমা`,
        created_by: userId,
      });
    }

    return { success: true, challanNo, saleRow };
  }

  // ২) সাধারণ খরচ বা ব্যয় সেভ করা (EXPENSE)
  if (actionType === "EXPENSE") {
    const cat = data.expenseCategory || "আনুষাঙ্গিক";
    const detailName = data.customerName || data.description || "";
    const finalCategory = detailName && !cat.includes(detailName) ? `${cat} — ${detailName}` : cat;

    const { error } = await supabase.from("expenses").insert({
      category: finalCategory,
      amount: Number(data.amount || data.paidAmount) || 0,
      expense_date: today,
      note: data.description || detailName || "AI ব্যয় এন্ট্রি",
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৩) যেকোনো নগদ আয় বা কাস্টমারের টাকা জমা নেওয়া (COLLECTION / INCOME)
  if (actionType === "COLLECTION") {
    const custName = (data.customerName || data.description || "সাধারণ নগদ আয়").trim();
    let customerId = null;

    const { data: existingCust } = await supabase
      .from("customers")
      .select("id")
      .ilike("name", `%${custName}%`)
      .maybeSingle();

    if (existingCust) {
      customerId = existingCust.id;
    } else {
      const { data: newCust } = await supabase
        .from("customers")
        .insert({ name: custName, created_by: userId })
        .select("id")
        .single();
      if (newCust) customerId = newCust.id;
    }

    const { error } = await supabase.from("collections").insert({
      customer_id: customerId!,
      amount: Number(data.paidAmount || data.amount) || 0,
      payment_date: today,
      method: "cash",
      note: data.description || `${custName} — AI নগদ আয় এন্ট্রি`,
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৪) সর্দারদের পেমেন্ট বা দাদন দেওয়া (SARDAR_PAYMENT)
  if (actionType === "SARDAR_PAYMENT") {
    const name = (data.sardarName || data.customerName || "").trim();
    if (!name) throw new Error("সর্দারের নাম উল্লেখ করুন।");

    let sardarId = null;
    const { data: existingSardar } = await supabase
      .from("sardars")
      .select("id")
      .ilike("name", `%${name}%`)
      .maybeSingle();

    if (existingSardar) {
      sardarId = existingSardar.id;
    } else {
      const { data: newSardar } = await supabase
        .from("sardars")
        .insert({ name, is_active: true })
        .select("id")
        .single();
      if (newSardar) sardarId = newSardar.id;
    }

    if (!sardarId) throw new Error("সর্দার খুঁজে পাওয়া যায়নি।");

    const { error } = await supabase.from("sardar_payments").insert({
      sardar_id: sardarId,
      amount: Number(data.amount || data.paidAmount) || 0,
      payment_date: today,
      payment_type: "advance",
      method: "cash",
      note: data.description || "AI সর্দার পেমেন্ট",
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৫) কাঁচা ইট (মিল) উৎপাদন এন্ট্রি (KACHA_BRICK)
  if (actionType === "KACHA_BRICK") {
    const name = (data.sardarName || data.customerName || "").trim();
    let sardarId = null;
    if (name) {
      const { data: existingSardar } = await supabase
        .from("sardars")
        .select("id")
        .ilike("name", `%${name}%`)
        .maybeSingle();
      if (existingSardar) sardarId = existingSardar.id;
    }

    const qty = Number(data.quantity) || 0;
    const rate = Number(data.rate) || 0;
    const amt = Number(data.totalAmount || data.amount) || (qty / 1000) * rate;

    const { error } = await supabase.from("kacha_brick_entries").insert({
      sardar_id: sardarId,
      quantity: qty,
      rate: rate,
      amount: amt,
      entry_date: today,
      entry_type: "production",
      note: data.description || `AI কাঁচা ইট এন্ট্রি (${name})`,
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৬) সাপ্লায়ার পেমেন্ট (SUPPLIER_PAYMENT)
  if (actionType === "SUPPLIER_PAYMENT") {
    const name = (data.supplierName || data.customerName || "").trim();
    if (!name) throw new Error("সাপ্লায়ারের নাম উল্লেখ করুন।");

    let supplierId = null;
    const { data: existingSup } = await supabase
      .from("suppliers")
      .select("id")
      .ilike("name", `%${name}%`)
      .maybeSingle();

    if (existingSup) {
      supplierId = existingSup.id;
    } else {
      const { data: newSup } = await supabase
        .from("suppliers")
        .insert({ name })
        .select("id")
        .single();
      if (newSup) supplierId = newSup.id;
    }

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_id: supplierId!,
      amount: Number(data.amount || data.paidAmount) || 0,
      payment_date: today,
      note: data.description || "AI সাপ্লায়ার পেমেন্ট",
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  throw new Error("অজানা অ্যাকশন টাইপ");
}

async function callGeminiWithFallback(systemPrompt: string, userMessage: string) {
  const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-pro"];
  let lastError = "";

  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                { text: `ইউজারের প্রশ্ন/নির্দেশ: "${userMessage}"` },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      if (!data.error) return data;
      lastError = data.error.message;
    } catch (err: any) {
      lastError = err.message;
    }
  }
  throw new Error(lastError || "সার্ভার ব্যস্ত আছে।");
}

export async function processBrickFieldCommand(userMessage: string) {
  try {
    if (!apiKey) {
      return { type: "QUERY", reply: "Gemini API Key পাওয়া যায়নি।" };
    }

    const dbData = await getBrickFieldDatabaseContext();

    const systemPrompt = `
তুমি "CDB Bricks" (সিডিবি ব্রিকস, কাপাসিয়া, গাজীপুর) ইটের ভাটার প্রধান এআই একাউন্ট্যান্ট ও ম্যানেজার।
আজকের তারিখ: ৬ অক্টোবর, ২০২৬।

নিচে ভাটার সম্পূর্ণ লাইভ ডেটাবেস (Supabase) দেওয়া হলো:
${dbData}

নিয়মাবলী:
১. প্রশ্ন-উত্তর (QUERY): কাস্টমারের জমা/বাকি, সর্দারদের ব্যালেন্স (sardar_balances), ইটের স্টক (current_brick_stock), কয়লা/মাটির স্টক (raw_material_stock), ক্যাশ ব্যালেন্স (account_balances), লাভ-ক্ষতি (profit_loss_summary) বা পূর্বের বকেয়া (opening_balance_summary) জানতে চাইলে ডেটাবেস থেকে নিখুঁত হিসাব করে বাংলায় উত্তর দাও।
২. নতুন চালান/ইট বিক্রি (SALE_CHALLAN): ইট বিক্রির কথা বললে type হবে "SALE_CHALLAN"।
৩. নগদ আয় বা কাস্টমার টাকা জমা (COLLECTION): যেকোনো নগদ আয় বা কাস্টমার টাকা জমা দিলে type হবে "COLLECTION"।
৪. সাধারণ খরচ বা ব্যয় (EXPENSE): যেকোনো খরচ বা ব্যয়ের কথা বললে type হবে "EXPENSE"।
৫. সর্দার পেমেন্ট (SARDAR_PAYMENT): কোনো সর্দারকে টাকা বা খোরাকি বা দাদন দেওয়ার কথা বললে type হবে "SARDAR_PAYMENT"।
৬. কাঁচা ইট উৎপাদন (KACHA_BRICK): মিল বা সর্দার কাঁচা ইট তৈরি করেছে বললে type হবে "KACHA_BRICK"।
৭. সাপ্লায়ার পেমেন্ট (SUPPLIER_PAYMENT): কয়লা বা মাটির পার্টি/সাপ্লায়ারকে টাকা দিলে type হবে "SUPPLIER_PAYMENT"।

শুধুমাত্র বৈধ JSON রিটার্ন করবে:
{
  "type": "QUERY" | "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "KACHA_BRICK" | "SUPPLIER_PAYMENT",
  "reply": "ইউজারকে বাংলায় দেওয়া স্পষ্ট উত্তর",
  "data": {
    "customerName": "",
    "sardarName": "",
    "supplierName": "",
    "phone": "",
    "brickType": "১ নম্বর ইট",
    "quantity": 0,
    "rate": 0,
    "totalAmount": 0,
    "paidAmount": 0,
    "dueAmount": 0,
    "vehicleNumber": "",
    "driverName": "",
    "expenseCategory": "আনুষাঙ্গিক",
    "amount": 0,
    "description": ""
  }
}
`;

    const data = await callGeminiWithFallback(systemPrompt, userMessage);
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      return JSON.parse(cleanJson);
    } catch {
      return { type: "QUERY", reply: rawText };
    }
  } catch (error: any) {
    return { type: "QUERY", reply: `ত্রুটি: ${error.message}` };
  }
}