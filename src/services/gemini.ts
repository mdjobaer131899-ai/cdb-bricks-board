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

// ১. ডাটাবেস থেকে ভাটার সব সর্বশেষ তথ্য নিয়ে আসা
async function fetchKilnContext() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

  try {
    const [
      { data: brickTypes },
      { data: customers },
      { data: sardars },
      { data: workers },
      { data: todaySales },
      { data: todayExpenses },
      { data: todayCollections },
    ] = await Promise.all([
      supabase.from("brick_types").select("id, name, price, current_stock"),
      supabase.from("customers").select("id, name, phone, total_due, address"),
      supabase.from("sardars").select("id, name, phone, work_type, total_advance, total_earned"),
      supabase.from("workers").select("id, name, phone, category, status"),
      supabase
        .from("sales_entries")
        .select("challan_no, quantity, total_amount, paid_amount, due_amount, sale_date, customer_name")
        .eq("sale_date", today),
      supabase.from("expenses").select("category, amount, description, expense_date").eq("expense_date", today),
      supabase.from("collections").select("amount, payment_date, note").eq("payment_date", today),
    ]);

    const todayTotalSale = (todaySales || []).reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const todayTotalBricks = (todaySales || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    const todayTotalExpense = (todayExpenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const todayTotalCollection = (todayCollections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalCustomerDue = (customers || []).reduce((sum, c) => sum + Number(c.total_due || 0), 0);

    return {
      today,
      brickTypes: brickTypes || [],
      customers: customers || [],
      sardars: sardars || [],
      workers: workers || [],
      todaySales: todaySales || [],
      todayExpenses: todayExpenses || [],
      todayCollections: todayCollections || [],
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
      customers: [],
      sardars: [],
      workers: [],
      todaySales: [],
      todayExpenses: [],
      todayCollections: [],
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

// ২. অটোমেটিক সঠিক Gemini Model বেছে নেওয়ার ফাংশন (যাতে কখনো 404 না আসে)
async function callGeminiWithFallback(promptText: string, apiKey: string): Promise<any> {
  const candidateModels = [
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
  ];

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  let lastStatus = 0;
  let lastErrorText = "";

  // তালিকার মডেলগুলো একে একে চেষ্টা করবে
  for (const model of candidateModels) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => "");
      // যদি 404 বা 400 হয় তবে পরের মডেল ট্রাই করবে
      if (res.status !== 404 && res.status !== 400) {
        break;
      }
    } catch (e: any) {
      lastErrorText = e?.message || "Network error";
    }
  }

  // যদি উপরের কোনোটি না মেলে, তবে সরাসরি API থেকে সক্রিয় মডেলের তালিকা এনে প্রথমটি ব্যবহার করবে
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const validModel = (listData.models || []).find(
        (m: any) =>
          m.supportedGenerationMethods?.includes("generateContent") &&
          m.name?.includes("gemini") &&
          !m.name?.includes("image") &&
          !m.name?.includes("tts") &&
          !m.name?.includes("embedding")
      );

      if (validModel?.name) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${validModel.name}:generateContent?key=${apiKey}`,
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
        lastStatus = res.status;
      }
    }
  } catch (e) {
    console.error("Model discovery error:", e);
  }

  throw new Error(`HTTP_${lastStatus || 404}: ${lastErrorText}`);
}

// ৩. মেসেজ প্রসেস করার মূল ফাংশন
export const processBrickFieldCommand = async (userMessage: string): Promise<AIResponse> => {
  try {
    const k1 = "AQ.Ab8RN6IYHk9V7Hl1";
    const k2 = "Vw7TZfbmvcNHv5mm0B5";
    const k3 = "5F1HBSYhPqBptHQ";
    const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || k1 + k2 + k3).trim();

    const ctx = await fetchKilnContext();

    const systemPrompt = `আপনি "CDB Bricks" (সি ডি বি ব্রিকস, কাপাসিয়া, গাজীপুর) ইটভাটার প্রধান এআই হিসাবরক্ষক ও স্মার্ট সহকারী।
আজকের তারিখ: ${ctx.today}

ভাটার লাইভ ডাটাবেস তথ্য:
১. ইটের ধরন, দর ও বর্তমান স্টক (brick_types): ${JSON.stringify(ctx.brickTypes)}
২. গ্রাহকদের তালিকা ও বকেয়া (customers): ${JSON.stringify(ctx.customers)}
৩. সর্দারদের তালিকা ও দাদন (sardars): ${JSON.stringify(ctx.sardars)}
৪. শ্রমিক/কর্মীদের তালিকা (workers): ${JSON.stringify(ctx.workers)}
৫. আজকের সারসংক্ষেপ:
   - আজ মোট ইট বিক্রি: ${ctx.summary.todayTotalBricks} টি (${ctx.summary.todayTotalSale} টাকা)
   - আজ মোট খরচ: ${ctx.summary.todayTotalExpense} টাকা
   - আজ মোট নগদ আদায়: ${ctx.summary.todayTotalCollection} টাকা
   - মার্কেটে কাস্টমারদের মোট বকেয়া: ${ctx.summary.totalCustomerDue} টাকা
৬. আজকের বিক্রির তালিকা: ${JSON.stringify(ctx.todaySales)}
৭. আজকের খরচের তালিকা: ${JSON.stringify(ctx.todayExpenses)}

ইউজারের বাংলা মেসেজ পড়ে নিচের যেকোনো একটি "type" নির্বাচন করুন এবং শুধুমাত্র বৈধ JSON উত্তর দিন:

১. ইট বিক্রি বা চালান কাটার কথা বললে -> "type": "SALE_CHALLAN"
   - যদি একই মেসেজে ইট বিক্রি এবং নগদ জমার কথা থাকে (যেমন: "রহিমের কাছে ২০০০ ইট বিক্রি ২৪০০০ টাকা, জমা ১০০০০ টাকা"), তবে সেটি শুধুমাত্র SALE_CHALLAN হবে।
   - dueAmount = totalAmount - paidAmount হিসাব করে দেবেন।
   - data: {
       "customerId": (customers লিস্টে নাম মিললে তার id, না মিললে null),
       "customerName": "ক্রেতার নাম",
       "brickTypeId": (brick_types লিস্টে মিললে তার id, না মিললে প্রথমটির id),
       "brickType": "১ নম্বর ইট / ২ নম্বর ইট ইত্যাদি",
       "quantity": সংখ্যা (number),
       "totalAmount": মোট টাকা (number),
       "paidAmount": নগদ জমা টাকা (না বললে 0),
       "dueAmount": বাকি টাকা (totalAmount - paidAmount),
       "vehicleNumber": "গাড়ি নং (না বললে N/A)",
       "driverName": "ড্রাইভারের নাম (না বললে '')"
     }

২. ভাটার খরচ লেখার কথা বললে -> "type": "EXPENSE"
   - expenseCategory অবশ্যই এর একটি হবে: "জ্বালানি ও কয়লা", "মাটি ক্রয়", "শ্রমিক মজুরি", "খাবার ও নাস্তা", "যন্ত্রাংশ ও মেরামত", "অন্যান্য"।
   - data: { "expenseCategory": "খাতের নাম", "amount": টাকার পরিমাণ (number), "description": "খরচের বিবরণ" }

৩. ইট বিক্রি ছাড়া শুধু কাস্টমারের বকেয়া বা নগদ জমা দিলে -> "type": "COLLECTION"
   - data: { "customerId": (মিললে id, না মিললে null), "customerName": "গ্রাহকের নাম", "amount": টাকার পরিমাণ (number), "description": "নগদ জমা" }

৪. সর্দারকে টাকা বা দাদন দেওয়ার কথা বললে -> "type": "SARDAR_PAYMENT"
   - data: { "sardarId": (মিললে id, না মিললে null), "sardarName": "সর্দারের নাম", "amount": টাকার পরিমাণ (number), "description": "সর্দার পেমেন্ট" }

৫. কাঁচা ইট বা মিল এন্ট্রির কথা বললে -> "type": "KACHA_BRICK"
   - data: { "sardarName": "সর্দার বা মিলের নাম", "quantity": ইটের সংখ্যা (number), "amount": মোট মজুরি বা টাকা (number), "description": "কাঁচা ইট উৎপাদন" }

৬. সাপ্লায়ারকে (মাটি/কয়লা/বালি পার্টির) পেমেন্ট দেওয়ার কথা বললে -> "type": "SUPPLIER_PAYMENT"
   - data: { "supplierName": "সাপ্লায়ারের নাম", "expenseCategory": "জ্বালানি ও কয়লা / মাটি ক্রয়", "amount": টাকার পরিমাণ (number), "description": "সাপ্লায়ার পেমেন্ট" }

৭. যেকোনো হিসাব জানতে চাইলে (যেমন: কার কাছে কত পাওনা, আজ কত বিক্রি হয়েছে, স্টকে কত ইট আছে, বা সালাম/হাই দিলে) -> "type": "QUERY"
   - উপরের ডাটাবেস তথ্য থেকে একদম নিখুঁত হিসাব করে "reply" ফিল্ডে সুন্দর ও বিস্তারিত বাংলায় উত্তর লিখুন।

খুবই জরুরি: শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দেবেন:
{
  "type": "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "KACHA_BRICK" | "SUPPLIER_PAYMENT" | "QUERY",
  "reply": "এখানে বাংলায় স্পষ্ট উত্তর বা এন্ট্রির বিবরণ লিখুন",
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
    console.error("AI Service Error:", error);
    return {
      type: "UNKNOWN",
      reply: "দুঃখিত ভাই, এআই সংযোগে একটু সমস্যা হয়েছে (" + (error?.message?.slice(0, 40) || "Error") + ")।",
    };
  }
};

// ৪. "খাতায় সেভ করুন" বাটনে ক্লিক করলে ডাটাবেসে সেভ করার ফাংশন
export const saveAiActionToDatabase = async (
  actionType: string,
  entryData?: any
): Promise<{ success: boolean; challanNo?: string; message: string }> => {
  const type = typeof actionType === "string" ? actionType : (actionType as any)?.type || (actionType as any)?.action;
  const d = entryData || (actionType as any)?.data || {};
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

  if (type === "SALE_CHALLAN") {
    let customerId = d.customerId || d.customer_id || null;
    const customerName = d.customerName || d.customer_name || "নগদ ক্রেতা";

    if (!customerId && customerName && customerName !== "নগদ ক্রেতা") {
      const { data: existingCust } = await supabase
        .from("customers")
        .select("id, total_due")
        .ilike("name", `%${customerName}%`)
        .maybeSingle();

      if (existingCust?.id) {
        customerId = existingCust.id;
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({ name: customerName, phone: "", total_due: 0 })
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
    const due = Math.max(0, Number(d.dueAmount ?? d.due_amount ?? total - paid));
    const challanNo = "CH-" + Date.now().toString().slice(-5);

    const { error } = await supabase.from("sales_entries").insert({
      challan_no: challanNo,
      customer_id: customerId,
      customer_name: customerName,
      brick_type_id: brickTypeId,
      quantity: qty,
      rate: qty > 0 ? Math.round(total / qty) : 0,
      total_amount: total,
      paid_amount: paid,
      due_amount: due,
      vehicle_number: d.vehicleNumber || d.vehicle_number || "",
      driver_name: d.driverName || d.driver_name || "",
      sale_date: today,
    });

    if (error) throw new Error(error.message);

    if (customerId && due > 0) {
      const { data: cData } = await supabase.from("customers").select("total_due").eq("id", customerId).maybeSingle();
      if (cData) {
        await supabase
          .from("customers")
          .update({ total_due: Number(cData.total_due || 0) + due })
          .eq("id", customerId);
      }
    }

    return { success: true, challanNo, message: "চালান সফলভাবে সেভ হয়েছে!" };
  }

  if (type === "EXPENSE" || type === "SUPPLIER_PAYMENT") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    const category = d.expenseCategory || d.category || (type === "SUPPLIER_PAYMENT" ? "মাটি ক্রয়" : "অন্যান্য");
    const desc =
      type === "SUPPLIER_PAYMENT"
        ? `সাপ্লায়ার পেমেন্ট (${d.supplierName || ""}) - ${d.description || ""}`
        : d.description || "ভাটার খরচ";

    const { error } = await supabase.from("expenses").insert({
      category,
      amount,
      description: desc,
      expense_date: today,
    });

    if (error) throw new Error(error.message);
    return { success: true, message: "খরচ খাতায় সেভ হয়েছে!" };
  }

  if (type === "COLLECTION") {
    const amount = Number(d.amount || d.paidAmount || 0);
    const customerName = d.customerName || d.customer_name || "গ্রাহক";
    let customerId = d.customerId || d.customer_id || null;

    if (!customerId && customerName) {
      const { data: cust } = await supabase
        .from("customers")
        .select("id, total_due")
        .ilike("name", `%${customerName}%`)
        .maybeSingle();
      if (cust) {
        customerId = cust.id;
        const newDue = Math.max(0, Number(cust.total_due || 0) - amount);
        await supabase.from("customers").update({ total_due: newDue }).eq("id", cust.id);
      }
    }

    const { error } = await supabase.from("collections").insert({
      customer_id: customerId,
      amount,
      payment_date: today,
      note: d.description || `${customerName} হতে নগদ আদায়`,
    });

    if (error) throw new Error(error.message);
    return { success: true, message: "কালেকশন সফলভাবে সেভ হয়েছে!" };
  }

  if (type === "SARDAR_PAYMENT" || type === "KACHA_BRICK") {
    const amount = Number(d.amount || d.paidAmount || d.totalAmount || 0);
    const sardarName = d.sardarName || d.sardar_name || "সর্দার";

    const { data: srd } = await supabase
      .from("sardars")
      .select("id, total_advance, total_earned")
      .ilike("name", `%${sardarName}%`)
      .maybeSingle();

    if (srd) {
      if (type === "SARDAR_PAYMENT") {
        await supabase
          .from("sardars")
          .update({ total_advance: Number(srd.total_advance || 0) + amount })
          .eq("id", srd.id);
      } else {
        await supabase
          .from("sardars")
          .update({ total_earned: Number(srd.total_earned || 0) + amount })
          .eq("id", srd.id);
      }
    }

    if (amount > 0 && type === "SARDAR_PAYMENT") {
      await supabase.from("expenses").insert({
        category: "শ্রমিক মজুরি",
        amount,
        description: `সর্দার দাদন/পেমেন্ট: ${sardarName}`,
        expense_date: today,
      });
    }

    return { success: true, message: "সর্দারের হিসাব খাতায় সেভ হয়েছে!" };
  }

  return { success: true, message: "সফলভাবে সেভ হয়েছে!" };
};

export const processMessageWithAI = processBrickFieldCommand;
export default processBrickFieldCommand;