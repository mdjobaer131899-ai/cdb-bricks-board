import { supabase } from "../integrations/supabase/client";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

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
      supabase.from("workers").select("*").eq("active", true),
      supabase.from("suppliers").select("*"),
      supabase.from("loans").select("*").limit(50),
    ]);

    return JSON.stringify({
      brick_types: brickTypes.data || [],
      current_brick_stock: currentStock.data || [],
      raw_material_stock: rawStock.data || [],
      customers: customers.data || [],
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
    console.warn("Database context error:", err);
    return "{}";
  }
}

export async function saveAiActionToDatabase(actionType: string, data: any) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("লগইন করা নেই।");

  const today = new Date().toISOString().split("T")[0];

  // ১. চালান এন্ট্রি (SALE_CHALLAN)
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
          .insert({ name: data.customerName.trim(), phone: data.phone || null, created_by: userId })
          .select("id")
          .single();
        if (newCust) customerId = newCust.id;
      }
    }

    const { data: brickTypes } = await supabase.from("brick_types").select("*");
    let brickTypeId = brickTypes?.[0]?.id;
    if (data.brickType && brickTypes) {
      const matched = brickTypes.find((b) => b.name.toLowerCase().includes(data.brickType.toLowerCase()));
      if (matched) brickTypeId = matched.id;
    }

    const { data: challanNoData } = await supabase.rpc("next_challan_number", { _date: today, _prefix: "CH" });
    const challanNo = challanNoData || `CH-${Date.now().toString().slice(-5)}`;

    const qty = Number(data.quantity) || 0;
    const total = Number(data.totalAmount) || 0;
    const unitPrice = qty > 0 ? total / qty : 0;

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

  // ২. খরচ এন্ট্রি (EXPENSE)
  if (actionType === "EXPENSE") {
    const cat = data.expenseCategory || "অন্যান্য";
    const detailName = data.customerName || data.description || "";
    const finalCategory = detailName && !cat.includes(detailName) ? `${cat} — ${detailName}` : cat;

    const { error } = await supabase.from("expenses").insert({
      category: finalCategory,
      amount: Number(data.amount || data.paidAmount) || 0,
      expense_date: today,
      note: data.description || detailName || "AI এন্ট্রি",
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৩. কালেকশন বা জমা (COLLECTION)
  if (actionType === "COLLECTION") {
    const custName = (data.customerName || data.description || "নগদ জমা").trim();
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
      note: data.description || `${custName} — AI জমা`,
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৪. সরদার পেমেন্ট (SARDAR_PAYMENT)
  if (actionType === "SARDAR_PAYMENT") {
    const name = (data.sardarName || data.customerName || "").trim();
    if (!name) throw new Error("সরদারের নাম দিতে হবে।");

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

    const { error } = await supabase.from("sardar_payments").insert({
      sardar_id: sardarId,
      amount: Number(data.amount || data.paidAmount) || 0,
      payment_date: today,
      payment_type: "advance",
      method: "cash",
      note: data.description || "AI সরদার পেমেন্ট",
      created_by: userId,
    });
    if (error) throw error;
    return { success: true };
  }

  // ৫. ডেইলি শ্রমিক পেমেন্ট/হাজিরা (WORKER_PAYMENT)
  if (actionType === "WORKER_PAYMENT") {
    const workerName = (data.workerName || data.customerName || "").trim();
    if (!workerName) throw new Error("শ্রমিকের নাম দিতে হবে।");

    const { error } = await supabase.from("workers").insert({
      name: workerName,
      phone: data.phone || null,
      role: data.role || "শ্রমিক",
      daily_wage: Number(data.wage || data.amount) || 0,
      active: true,
    });
    if (error) throw error;
    return { success: true };
  }

  throw new Error("অজানা অপারেশন");
}

export async function processBrickFieldCommand(userMessage: string) {
  try {
    if (!apiKey) {
      return { type: "QUERY", reply: "Gemini API Key পাওয়া যায়নি।" };
    }

    const dbData = await getBrickFieldDatabaseContext();

    const systemPrompt = `
তুমি "CDB Bricks" (ইট ভাটা, কাপাসিয়া, গাজীপুর) এর ম্যানেজার ও সহকারী।
আজকের তারিখ: ${new Date().toISOString().slice(0, 10)}

ডাটাবেস তথ্য:
${dbData}

নির্দেশিকা:
- যেকোনো হিসাব বা এন্ট্রি করার সময় সঠিক JSON ফরম্যাটে রিপ্লাই দেবে।
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }, { text: `ইনপুট: "${userMessage}"` }] }],
      }),
    });

    const data = await response.json();
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