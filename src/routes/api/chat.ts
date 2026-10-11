import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, streamText, stepCountIs, type UIMessage } from "ai";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAssistantTools } from "@/lib/ai-tools.server";
import { buildWriteTools } from "@/lib/ai-write-tools.server";
import { buildComprehensiveAssistantTools } from "@/lib/ai-comprehensive-tools.server";

const SYSTEM_PROMPT = `
তুমি "CDB Bricks AI সহকারী" — একটি ইট ভাটার অ্যাডমিনের ব্যবসায়িক সহকারী।

সাধারণ নিয়ম:

- সর্বদা পরিষ্কার ও স্বাভাবিক বাংলায় উত্তর দাও।
- সব সংখ্যা ইংরেজি অংকে দাও।
- সাধারণ ইটের একক "পিস"।
- আদলা বা মিক্সার আদলার একক "ফুট"।
- কখনো অনুমান করে উত্তর দেবে না।
- database tool ব্যবহার করে প্রকৃত তথ্য নিয়ে উত্তর দেবে।
- কোনো তথ্য না পেলে বলবে: "দুঃখিত, এই তথ্যটি খুঁজে পাইনি।"
- ব্যবহারকারীর প্রশ্ন অনুযায়ী সঠিক dataset নির্বাচন করবে।
- একই প্রশ্নে অপ্রয়োজনীয়ভাবে একাধিক dataset ব্যবহার করবে না।
- উত্তর সংক্ষিপ্ত রাখবে; প্রয়োজন হলে bullet point ব্যবহার করবে।
- customer / worker / sardar / supplier / party খোঁজার প্রশ্নে searchEntityDetails ব্যবহার করবে।
- কোনো business table বা recent records জানতে চাইলে getBusinessData বা getTableSnapshot ব্যবহার করবে।
- কাঠামোগত count, total, balance, payment, collection, expense, stock, loan, profit-loss প্রশ্নে countRecords/getBusinessData/getProfitLossSummary ব্যবহার করবে।
- ব্যবহারকারী যখন 'সবকিছু', 'সামগ্রিক', 'ড্যাশবোর্ড', 'কী কী আছে', 'অর্থনীতি', 'ব্যবসার সারাংশ' লিখে জিজ্ঞেস করে, getBusinessOverview ব্যবহার করবে।
- getBusinessOverview-এ dashboard summary, customer count, worker count, sardar count, supplier count, sales total, collection total, expense total, stock total, outstanding dues, loss/profit ইত্যাদি একসাথে দেখাবে।

Dataset নির্বাচন:

- customer বা গ্রাহকের তথ্যের জন্য customers dataset ব্যবহার করবে।
- worker বা শ্রমিকের তথ্যের জন্য workers, worker_attendance অথবা worker_payments dataset ব্যবহার করবে।
- sardar বা সরদারের তথ্যের জন্য sardars, sardar_work_entries অথবা sardar_payments dataset ব্যবহার করবে।
- supplier বা সরবরাহকারীর তথ্যের জন্য suppliers অথবা supplier_payments dataset ব্যবহার করবে।
- বিক্রির তথ্যের জন্য sales_entries dataset ব্যবহার করবে।
- collections বা টাকা গ্রহণের তথ্যের জন্য collections dataset ব্যবহার করবে।
- খরচের তথ্যের জন্য expenses dataset ব্যবহার করবে।
- stock বা মজুদের তথ্যের জন্য current_stock অথবা raw_material_stock ব্যবহার করবে।
- লাভ-ক্ষতির প্রশ্নে getProfitLossSummary ব্যবহার করবে।
- মোট কতজন বা কতটি জানতে চাইলে countRecords ব্যবহার করবে।
- কোনো dataset-এর বিস্তারিত বা total জানতে চাইলে getBusinessData ব্যবহার করবে।
- customer, worker, sardar বা supplier-এর নাম খুঁজতে getBusinessData-এর search ব্যবহার করবে।
- dashboard-এর সামগ্রিক সারাংশ শুধুমাত্র ব্যবহারকারী স্পষ্টভাবে dashboard summary চাইলে getDashboardSummary ব্যবহার করবে।
- একক কোনো প্রশ্নের উত্তর দিতে getDashboardSummary ব্যবহার করবে না।

তারিখ ও মৌসুম:

- প্রশ্নে আজ, গতকাল, এই সপ্তাহ, গত মাস বা নির্দিষ্ট সময় থাকলে সেই সময়ের from এবং to date ব্যবহার করবে।
- date scope না থাকলে বর্তমান server-side season context অনুসরণ করবে।
- ব্যবহারকারী যদি স্পষ্টভাবে all time বা সব সময়ের তথ্য চায়, তাহলে season filter ব্যবহার করবে না।
- কোনো তারিখ অনুমান করবে না।

শ্রমিক সংক্রান্ত নিয়ম:

- "মোট কতজন শ্রমিক", "কতজন worker" বা "শ্রমিকের সংখ্যা" প্রশ্নে workers dataset-এর countRecords ব্যবহার করবে।
- "ডেলি শ্রমিক" বললে workers dataset-এর role বা সংশ্লিষ্ট search field ব্যবহার করবে।
- শ্রমিকের উপস্থিতির জন্য worker_attendance ব্যবহার করবে।
- শ্রমিককে দেওয়া টাকার জন্য worker_payments ব্যবহার করবে।

লেখার নিয়ম:

- কোনো টাকা দেওয়া, material purchase বা collection record করার আগে সংশ্লিষ্ট ব্যক্তি খুঁজে নিশ্চিত করবে।
- ব্যবহারকারী স্পষ্টভাবে "হ্যাঁ", "ঠিক আছে" বা "করো" না বলা পর্যন্ত write tool ব্যবহার করবে না।
- কোনো data delete করবে না।
- অস্পষ্ট প্রশ্ন হলে আগে পরিষ্কার করে জিজ্ঞেস করবে।
- একই নামে একাধিক ব্যক্তি থাকলে ব্যবহারকারীকে জিজ্ঞেস করবে কোন ব্যক্তি।

বর্তমান server-side season context tool result-এ দেওয়া থাকবে। সেই scope অনুসরণ করবে।
`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";

          if (!token) {
            return new Response("দয়া করে আবার লগইন করুন (টোকেন নেই)।", { status: 401 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

          if (userError || !userData?.user) {
            return new Response("সেশনের মেয়াদ শেষ — পুনরায় লগইন করুন।", { status: 401 });
          }

          const userId = userData.user.id;

          const { data: roleRows, error: roleError } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .in("role", ["admin", "manager"]);

          if (roleError || !roleRows?.length) {
            return new Response("এই ফিচারটি শুধু অ্যাডমিন বা ম্যানেজারের জন্য।", { status: 403 });
          }
          const userRoles = roleRows.map((row) => row.role);

          const body = (await request.json()) as {
            messages?: UIMessage[];
            seasonId?: string | null;
            format?: "json" | "stream";
          };

          const messages = Array.isArray(body.messages) ? body.messages : [];

          const isJsonResponse =
            body.format === "json" || new URL(request.url).searchParams.get("format") === "json";

          const { data: season } = body.seasonId
            ? await supabaseAdmin
                .from("seasons")
                .select("id,name,start_date,end_date,is_active")
                .eq("id", body.seasonId)
                .maybeSingle()
            : await supabaseAdmin
                .from("seasons")
                .select("id,name,start_date,end_date,is_active")
                .eq("is_active", true)
                .order("start_date", { ascending: false })
                .limit(1)
                .maybeSingle();

          const seasonContext = season
            ? {
                id: season.id,
                name: season.name,
                startDate: season.start_date,
                endDate: season.end_date,
              }
            : {
                id: null,
                name: null,
                startDate: null,
                endDate: null,
              };

          const apiKey = process.env.LOVABLE_API_KEY;

          if (!apiKey) {
            return new Response("AI কনফিগার করা হয়নি (LOVABLE_API_KEY নেই)।", { status: 500 });
          }

          const gateway = createLovableAiGatewayProvider(apiKey);

          const assistantTools = buildAssistantTools(supabaseAdmin);

          const comprehensiveTools = buildComprehensiveAssistantTools(
            supabaseAdmin,
            seasonContext,
            userRoles,
          );

          const writeTools = buildWriteTools(supabaseAdmin, userId);

          const tools = {
            ...assistantTools,
            ...comprehensiveTools,
            ...writeTools,
          };

          if (isJsonResponse) {
            const result = await generateText({
              model: gateway("google/gemini-2.5-flash"),
              system: `${SYSTEM_PROMPT}

বর্তমান মৌসুম:
${JSON.stringify(seasonContext)}`,
              messages: await convertToModelMessages(messages),
              tools,
              stopWhen: stepCountIs(10),
            });

            if (!result.text.trim()) {
              return new Response("AI কোনো উত্তর তৈরি করতে পারেনি। আবার চেষ্টা করুন।", {
                status: 502,
              });
            }

            return Response.json({
              type: "QUERY",
              action: "QUERY",
              reply: result.text,
              reply_bn: result.text,
              data: {},
            });
          }

          const result = streamText({
            model: gateway("google/gemini-2.5-flash"),
            system: `${SYSTEM_PROMPT}

বর্তমান মৌসুম:
${JSON.stringify(seasonContext)}`,
            messages: await convertToModelMessages(messages),
            tools,
            stopWhen: stepCountIs(50),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";

          console.error("[/api/chat] error:", message);

          return new Response(`AI error: ${message}`, {
            status: 500,
          });
        }
      },
    },
  },
});
