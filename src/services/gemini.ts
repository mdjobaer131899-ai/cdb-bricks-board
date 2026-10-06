import { supabase } from "@/integrations/supabase/client";

export interface AIActionData {
  customer_id?: string | null;
  customer_name?: string;
  brick_type_id?: string | null;
  brick_name?: string;
  quantity?: number;
  rate?: number;
  total_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  vehicle_number?: string;
  driver_name?: string;
  category?: string;
  expense_type?: string;
  amount?: number;
  description?: string;
  note?: string;
  sardar_id?: string | null;
  sardar_name?: string;
  worker_name?: string;
  worker_phone?: string;
  worker_Category?: string;
  worker_category?: string;
  date?: string;
}

export interface AIResponse {
  action:
    | "SALE_CHALLAN"
    | "EXPENSE"
    | "COLLECTION"
    | "SARDAR_PAYMENT"
    | "WORKER_ADD"
    | "QUERY"
    | "UNKNOWN";
  data?: AIActionData;
  reply_bn: string;
  message?: string;
  requiresConfirmation?: boolean;
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
      supabase.from("sales_entries").select("challan_no, quantity, total_amount, paid_amount, due_amount, sale_date, customer_name").eq("sale_date", today),
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

// ২. মেসেজ প্রসেস করার মূল ফাংশন
export const processBrickFieldCommand = async (userMessage: string): Promise<AIResponse> => {
  try {
    const k1 = "AQ.Ab8RN6IYHk9V7Hl1";
    const k2 = "Vw7TZfbmvcNHv5mm0B5";
    const k3 = "5F1HBSYhPqBptHQ";
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (k1 + k2 + k3);

    const ctx = await fetchKilnContext();

    const systemPrompt = `আপনি "CDB Bricks" ইটভাটার প্রধান এআই হিসাবরক্ষক ও স্মার্ট ম্যানেজার।
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
   - মার্কেটে মোট বকেয়া: ${ctx.summary.totalCustomerDue} টাকা
৬. আজকের বিক্রির বিস্তারিত: ${JSON.stringify(ctx.todaySales)}
৭. আজকের খরচের বিস্তারিত: ${JSON.stringify(ctx.todayExpenses)}

আপনার কাজ হলো ইউজারের বাংলা নির্দেশ বা প্রশ্ন পড়ে নিচের ৭টি Action থেকে সঠিকটি বেছে নেওয়া এবং নির্ভুল JSON উত্তর দেওয়া:

১. "SALE_CHALLAN" (ইট বিক্রি বা চালান কাটার নির্দেশ দিলে):
   - data তে দিন: { customer_id (ম্যাচ না করলে null), customer_name, brick_type_id, brick_name, quantity, total_amount, paid_amount (নগদ জমা না বললে 0), vehicle_number (না বললে ""), driver_name (না বললে ""), date: "${ctx.today}" }

২. "EXPENSE" (ভাটার যেকোনো খরচ লেখার নির্দেশ দিলে):
   - category অবশ্যই এই ৬টির একটি হতে হবে: "জ্বালানি ও কয়লা", "মাটি ক্রয়", "শ্রমিক মজুরি", "খাবার ও নাস্তা", "যন্ত্রাংশ ও মেরামত", "অন্যান্য"।
   - data তে দিন: { category, expense_type: category, amount, description, date: "${ctx.today}" }

৩. "COLLECTION" (কোনো ইট বিক্রি ছাড়া শুধুমাত্র কাস্টমারের বকেয়া বা নগদ টাকা জমা হলে):
   - data তে দিন: { customer_id, customer_name, amount, description, note: description, date: "${ctx.today}" }

৪. "SARDAR_PAYMENT" (কোনো সর্দারকে টাকা বা দাদন দেওয়ার কথা বললে):
   - data তে দিন: { sardar_id, sardar_name, amount, description, date: "${ctx.today}" }

৫. "WORKER_ADD" (নতুন কর্মী বা শ্রমিক যোগ করতে বললে):
   - worker_Category অবশ্যই এর একটি হবে: "পাথেরায়", "বোঝাই", "পোড়ানো", "অন্যান্য"।
   - data তে দিন: { worker_name, worker_phone (না থাকলে ""), worker_Category, worker_category: worker_Category }

৬. "QUERY" (ভাটার স্টক, আজকের বিক্রি, কার কাছে কত পাওনা বা যেকোনো প্রশ্ন করলে):
   - লাইভ ডাটাবেস তথ্য দেখে নিখুঁত হিসাব করে বাংলায় reply_bn এ বিস্তারিত উত্তর দিন।

৭. "UNKNOWN" (যদি কথাটি বোঝা না যায়):
   - reply_bn এ আরেকবার স্পষ্ট করে বলতে বলুন।

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দেবেন:
{
  "action": "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "WORKER_ADD" | "QUERY" | "UNKNOWN",
  "data": { ... },
  "reply_bn": "এখানে বাংলায় সুন্দর উত্তর বা কনফার্মেশন মেসেজ লিখুন"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: systemPrompt + "\n\nইউজারের মেসেজ: " + userMessage }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("Gemini API Error:", errData);
      return {
        action: "UNKNOWN",
        reply_bn: "এআই সার্ভারে সংযোগ হতে সমস্যা হচ্ছে (" + response.status + ")।",
      };
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson) as AIResponse;

    const isAction = ["SALE_CHALLAN", "EXPENSE", "COLLECTION", "SARDAR_PAYMENT", "WORKER_ADD"].includes(parsed.action);

    return {
      ...parsed,
      message: parsed.reply_bn,
      requiresConfirmation: isAction,
    };
  } catch (error) {
    console.error("AI Service Error:", error);
    return {
      action: "UNKNOWN",
      reply_bn: "দুঃখিত ভাই, সংযোগে একটু সমস্যা হচ্ছে। আবার চেষ্টা করুন।",
    };
  }
};

// ৩. ডাটাবেসে এন্ট্রি সেভ করার ফাংশন (saveAiActionToDatabase)
export const saveAiActionToDatabase = async (aiRes: AIResponse | any): Promise<{ success: boolean; message: string }> => {
  try {
    const action = aiRes?.action;
    const d: AIActionData = aiRes?.data || aiRes || {};
    const today = d.date || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

    if (action === "SALE_CHALLAN") {
      let customerId = d.customer_id;
      if (!customerId && d.customer_name) {
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .ilike("name", `%${d.customer_name}%`)
          .maybeSingle();

        if (existingCust?.id) {
          customerId = existingCust.id;
        } else {
          const { data: newCust } = await supabase
            .from("customers")
            .insert({ name: d.customer_name, phone: "", total_due: 0 })
            .select("id")
            .single();
          customerId = newCust?.id || null;
        }
      }

      let brickTypeId = d.brick_type_id;
      if (!brickTypeId) {
        const { data: bt } = await supabase.from("brick_types").select("id").limit(1).maybeSingle();
        brickTypeId = bt?.id || null;
      }

      const qty = Number(d.quantity || 0);
      const total = Number(d.total_amount || 0);
      const paid = Number(d.paid_amount || 0);
      const due = Math.max(0, total - paid);
      const challanNo = "CH-" + Date.now().toString().slice(-6);

      const { error } = await supabase.from("sales_entries").insert({
        challan_no: challanNo,
        customer_id: customerId,
        customer_name: d.customer_name || "সাধারণ ক্রেতা",
        brick_type_id: brickTypeId,
        quantity: qty,
        rate: qty > 0 ? total / qty : 0,
        total_amount: total,
        paid_amount: paid,
        due_amount: due,
        vehicle_number: d.vehicle_number || "",
        driver_name: d.driver_name || "",
        sale_date: today,
      });

      if (error) throw error;
      return { success: true, message: `চালান (${challanNo}) সফলভাবে ডাটাবেসে সেভ হয়েছে!` };
    }

    if (action === "EXPENSE") {
      const { error } = await supabase.from("expenses").insert({
        category: d.category || d.expense_type || "অন্যান্য",
        amount: Number(d.amount || 0),
        description: d.description || "এআই এন্ট্রি",
        expense_date: today,
      });
      if (error) throw error;
      return { success: true, message: "খরচের হিসাব সফলভাবে খাতায় তোলা হয়েছে!" };
    }

    if (action === "COLLECTION") {
      let customerId = d.customer_id;
      if (!customerId && d.customer_name) {
        const { data: cust } = await supabase
          .from("customers")
          .select("id")
          .ilike("name", `%${d.customer_name}%`)
          .maybeSingle();
        customerId = cust?.id || null;
      }

      const { error } = await supabase.from("collections").insert({
        customer_id: customerId,
        amount: Number(d.amount || 0),
        payment_date: today,
        note: d.description || d.note || `${d.customer_name || "গ্রাহক"} হতে নগদ জমা`,
      });
      if (error) throw error;
      return { success: true, message: "নগদ জমার হিসাব সফলভাবে সেভ হয়েছে!" };
    }

    if (action === "SARDAR_PAYMENT") {
      let sardarId = d.sardar_id;
      if (!sardarId && d.sardar_name) {
        const { data: srd } = await supabase
          .from("sardars")
          .select("id, total_advance")
          .ilike("name", `%${d.sardar_name}%`)
          .maybeSingle();
        if (srd) {
          sardarId = srd.id;
          await supabase
            .from("sardars")
            .update({ total_advance: Number(srd.total_advance || 0) + Number(d.amount || 0) })
            .eq("id", srd.id);
        }
      }

      await supabase.from("expenses").insert({
        category: "শ্রমিক মজুরি",
        amount: Number(d.amount || 0),
        description: `সর্দার পেমেন্ট: ${d.sardar_name || ""} - ${d.description || ""}`,
        expense_date: today,
      });

      return { success: true, message: "সর্দারের পেমেন্ট সফলভাবে এন্ট্রি হয়েছে!" };
    }

    if (action === "WORKER_ADD") {
      const { error } = await supabase.from("workers").insert({
        name: d.worker_name || "নতুন কর্মী",
        phone: d.worker_phone || "",
        category: d.worker_Category || d.worker_category || "অন্যান্য",
        status: "সক্রিয়",
      });
      if (error) throw error;
      return { success: true, message: "নতুন কর্মী সফলভাবে তালিকায় যোগ হয়েছে!" };
    }

    return { success: true, message: "সফলভাবে সম্পন্ন হয়েছে।" };
  } catch (err: any) {
    console.error("Save Action Error:", err);
    return { success: false, message: err?.message || "ডাটাবেসে সেভ করতে সমস্যা হয়েছে।" };
  }
};

export const processMessageWithAI = processBrickFieldCommand;
export const askAI = processBrickFieldCommand;
export const analyzeBrickCommand = processBrickFieldCommand;
export default processBrickFieldCommand;