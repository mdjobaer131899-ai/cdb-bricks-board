import { supabase } from "@/integrations/supabase/client";

export interface AIResponse {
  action: "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "WORKER_ADD" | "QUERY" | "UNKNOWN";
  data?: {
    customer_id?: string | null;
    customer_name?: string;
    brick_type_id?: string;
    brick_name?: string;
    quantity?: number;
    total_amount?: number;
    paid_amount?: number;
    vehicle_number?: string;
    driver_name?: string;
    category?: string;
    expense_type?: string;
    amount?: number;
    description?: string;
    sardar_id?: string;
    sardar_name?: string;
    worker_name?: string;
    worker_phone?: string;
    worker_Category?: string;
    date?: string;
  };
  reply_bn: string;
}

// ডাটাবেস থেকে সব দরকারি তথ্য নিয়ে আসা
async function fetchDatabaseContext() {
  const today = new Date().toISOString().split("T")[0];

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
    supabase.from("sales_entries").select("challan_no, quantity, total_amount, sale_date").eq("sale_date", today),
    supabase.from("expenses").select("category, amount, description, expense_date").eq("expense_date", today),
    supabase.from("collections").select("amount, payment_date, note").eq("payment_date", today),
  ]);

  return {
    today,
    brickTypes: brickTypes || [],
    customers: customers || [],
    sardars: sardars || [],
    workers: workers || [],
    todaySales: todaySales || [],
    todayExpenses: todayExpenses || [],
    todayCollections: todayCollections || [],
  };
}

export const processMessageWithAI = async (userMessage: string): Promise<AIResponse> => {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return {
        action: "UNKNOWN",
        reply_bn: "ভাই, আপনার .env ফাইলে VITE_GEMINI_API_KEY সেট করা নেই!",
      };
    }

    const ctx = await fetchDatabaseContext();

    const systemPrompt = `আপনি "CDB Bricks" ইটভাটার স্মার্ট এআই ম্যানেজার। আজকের তারিখ: ${ctx.today}।

ভাটার বর্তমান ডাটাবেস তথ্য:
- ইটের ধরন ও স্টক (brick_types): ${JSON.stringify(ctx.brickTypes)}
- কাস্টমার লিস্ট (customers): ${JSON.stringify(ctx.customers)}
- সর্দার লিস্ট (sardars): ${JSON.stringify(ctx.sardars)}
- কর্মী লিস্ট (workers): ${JSON.stringify(ctx.workers)}
- আজকের বিক্রি: ${JSON.stringify(ctx.todaySales)}
- আজকের খরচ: ${JSON.stringify(ctx.todayExpenses)}
- আজকের নগদ জমা: ${JSON.stringify(ctx.todayCollections)}

আপনার কাজ ইউজারের বাংলা মেসেজ পড়ে নিচের যেকোনো একটি action নির্বাচন করা এবং শুধুমাত্র বৈধ JSON উত্তর দেওয়া:

১. ইট বিক্রি বা চালান হলে -> action: "SALE_CHALLAN"
   - data: { customer_id (ম্যাচ করলে id দিন, না করলে null), customer_name, brick_type_id (ম্যাচ করে id দিন), brick_name, quantity (সংখ্যা), total_amount (মোট টাকা), paid_amount (নগদ জমা দিলে সেই টাকা, না দিলে 0), vehicle_number, driver_name, date: "${ctx.today}" }
২. ভাটার খরচ হলে -> action: "EXPENSE"
   - data: { category (যেমন: "জ্বালানি ও কয়লা", "মাটি ক্রয়", "শ্রমিক মজুরি", "খাবার ও নাস্তা", "যন্ত্রাংশ ও মেরামত", "অন্যান্য"), amount (টাকা), description (বিবরণ), date: "${ctx.today}" }
৩. কাস্টমার বকেয়া বা নগদ জমা দিলে (বিক্রি ছাড়া শুধু জমা) -> action: "COLLECTION"
   - data: { customer_id, customer_name, amount, description, date: "${ctx.today}" }
৪. সর্দারকে টাকা বা দাদন দিলে -> action: "SARDAR_PAYMENT"
   - data: { sardar_id, sardar_name, amount, description, date: "${ctx.today}" }
৫. নতুন শ্রমিক/কর্মী যোগ করতে বললে -> action: "WORKER_ADD"
   - data: { worker_name, worker_phone, worker_Category (যেমন: "পাথেরায়", "বোঝাই", "পোড়ানো", "অন্যান্য") }
৬. যেকোনো হিসাব বা প্রশ্ন জিজ্ঞেস করলে -> action: "QUERY" (উপরে দেওয়া ডাটাবেস তথ্য থেকে নির্ভুল হিসাব করে reply_bn এ উত্তর দিন)
৭. না বুঝলে -> action: "UNKNOWN"

খুবই জরুরি: শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দেবেন, কোনো বাড়তি কথা বা markdown লিখবেন না:
{
  "action": "SALE_CHALLAN" | "EXPENSE" | "COLLECTION" | "SARDAR_PAYMENT" | "WORKER_ADD" | "QUERY" | "UNKNOWN",
  "data": { ... },
  "reply_bn": "সুন্দর বাংলায় কনফার্মেশন বা প্রশ্নের উত্তর"
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

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson) as AIResponse;
  } catch (error) {
    console.error("AI Error:", error);
    return {
      action: "UNKNOWN",
      reply_bn: "দুঃখিত ভাই, সংযোগে একটু সমস্যা হচ্ছে। আবার চেষ্টা করুন।",
    };
  }
};