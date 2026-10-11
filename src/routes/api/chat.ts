import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, streamText, stepCountIs, type UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createClient } from "@supabase/supabase-js";

import { buildAssistantTools } from "@/lib/ai-tools.server";
import { buildComprehensiveAssistantTools } from "@/lib/ai-comprehensive-tools.server";
import type { Database } from "@/integrations/supabase/types";

const CHAT_TIMEOUT_MS = 45_000;
const MAX_CHAT_TOOL_STEPS = 4;

const SYSTEM_PROMPT = `
তুমি "CDB Bricks AI সহকারী" — একটি ইট ভাটার অ্যাডমিনের ব্যবসায়িক সহকারী।

সাধারণ নিয়ম:

- সর্বদা পরিষ্কার ও স্বাভাবিক বাংলায় উত্তর দাও।
- সব সংখ্যা ইংরেজি অংকে দাও।
- সাধারণ ইটের একক "পিস"।
- আদলা বা মিক্সার আদলার একক "ফুট"।
- কখনো অনুমান করে উত্তর দেবে না।
- database tool ব্যবহার করে প্রকৃত তথ্য নিয়ে উত্তর দেবে।
- countRecords বা getBusinessData-এর ফল পাওয়ার পর একই প্রশ্নের জন্য আবার verifyDatabaseAnswer বা অন্য tool চালাবে না।
- verifyDatabaseAnswer শুধু ব্যবহারকারী স্পষ্টভাবে তথ্য যাচাই বা মিলিয়ে দেখতে বললে ব্যবহার করবে।
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

- AI chat বর্তমানে শুধু তথ্য পড়তে পারে; কোনো database record তৈরি, পরিবর্তন বা মুছতে পারে না।
- কোনো record লেখার অনুরোধ এলে সংশ্লিষ্ট website form ব্যবহার করতে বলবে।
- অস্পষ্ট প্রশ্ন হলে আগে পরিষ্কার করে জিজ্ঞেস করবে।
- একই নামে একাধিক ব্যক্তি থাকলে ব্যবহারকারীকে জিজ্ঞেস করবে কোন ব্যক্তি।

বর্তমান server-side season context tool result-এ দেওয়া থাকবে। সেই scope অনুসরণ করবে।
`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let timeoutSignal: AbortSignal | undefined;
        let requestStage = "request setup";

        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";

          if (!token) {
            return new Response("দয়া করে আবার লগইন করুন (টোকেন নেই)।", { status: 401 });
          }

          timeoutSignal = AbortSignal.timeout(CHAT_TIMEOUT_MS);
          const abortSignal = AbortSignal.any([request.signal, timeoutSignal]);
          requestStage = "Supabase authentication";

          const supabaseUrl =
            process.env.SUPABASE_URL ||
            process.env.VITE_SUPABASE_URL ||
            import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY ||
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            import.meta.env.VITE_SUPABASE_ANON_KEY;

          if (!supabaseUrl || !supabaseKey) {
            throw new Error("AI chat-এর জন্য Supabase URL ও publishable key কনফিগার করা নেই।");
          }

          const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
            global: {
              fetch: (input, init) => fetch(input, { ...init, signal: abortSignal }),
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });

          const { data: userData, error: userError } = await supabase.auth.getUser(token);

          if (userError || !userData?.user) {
            return new Response("সেশনের মেয়াদ শেষ — পুনরায় লগইন করুন।", { status: 401 });
          }

          const userId = userData.user.id;

          requestStage = "role lookup";
          const { data: roleRows, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .in("role", ["admin", "manager"]);

          if (roleError || !roleRows?.length) {
            return new Response("এই ফিচারটি শুধু অ্যাডমিন বা ম্যানেজারের জন্য।", { status: 403 });
          }
          const userRoles = roleRows.map((row) => row.role);
          requestStage = "page permission lookup";
          const { data: permissionRows, error: permissionError } = await supabase
            .from("page_permissions")
            .select("page_key")
            .eq("user_id", userId);
          if (permissionError) throw new Error(permissionError.message);
          const pagePermissions = (permissionRows ?? []).map((row) => row.page_key);

          const body = (await request.json()) as {
            messages?: UIMessage[];
            seasonId?: string | null;
            format?: "json" | "stream";
          };

          const messages = Array.isArray(body.messages) ? body.messages : [];

          const isJsonResponse =
            body.format === "json" || new URL(request.url).searchParams.get("format") === "json";

          requestStage = "season lookup";
          const { data: season } = body.seasonId
            ? await supabase
                .from("seasons")
                .select("id,name,start_date,end_date,is_active")
                .eq("id", body.seasonId)
                .maybeSingle()
            : await supabase
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

          const lovableApiKey = process.env.LOVABLE_API_KEY;
          const geminiApiKey =
            process.env.GEMINI_API_KEY ||
            process.env.VITE_GEMINI_API_KEY ||
            import.meta.env.VITE_GEMINI_API_KEY;

          if (!lovableApiKey && !geminiApiKey) {
            return new Response(
              "AI সেবা কনফিগার করা নেই। Vercel-এর Production Environment Variables-এ LOVABLE_API_KEY অথবা GEMINI_API_KEY যোগ করে নতুন deployment দিন।",
              { status: 503 },
            );
          }

          const model = lovableApiKey
            ? createOpenAICompatible({
                name: "lovable",
                baseURL: "https://ai.gateway.lovable.dev/v1",
                headers: {
                  "Lovable-API-Key": lovableApiKey,
                  "X-Lovable-AIG-SDK": "vercel-ai-sdk",
                },
              })("google/gemini-3.8-flash")
            : createOpenAICompatible({
                name: "google",
                baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
                headers: {
                  Authorization: `Bearer ${geminiApiKey}`,
                },
              })("gemini-3.8-flash");

          const assistantTools = buildAssistantTools(supabase);

          const comprehensiveTools = buildComprehensiveAssistantTools(
            supabase,
            seasonContext,
            userRoles,
            pagePermissions,
          );

          const tools = userRoles.includes("admin")
            ? { ...assistantTools, ...comprehensiveTools }
            : comprehensiveTools;

          requestStage = "AI model/tool execution";
          console.info("[/api/chat] generation started", {
            format: isJsonResponse ? "json" : "stream",
            toolCount: Object.keys(tools).length,
          });

          if (isJsonResponse) {
            const result = await generateText({
              model,
              system: `${SYSTEM_PROMPT}

বর্তমান মৌসুম:
${JSON.stringify(seasonContext)}`,
              messages: await convertToModelMessages(messages),
              tools,
              abortSignal,
              stopWhen: stepCountIs(MAX_CHAT_TOOL_STEPS),
            });

            if (timeoutSignal.aborted) {
              throw new DOMException("AI request timed out", "TimeoutError");
            }

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
            model,
            system: `${SYSTEM_PROMPT}

বর্তমান মৌসুম:
${JSON.stringify(seasonContext)}`,
            messages: await convertToModelMessages(messages),
            tools,
            abortSignal,
            stopWhen: stepCountIs(MAX_CHAT_TOOL_STEPS),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";

          if (
            timeoutSignal?.aborted ||
            (error instanceof Error &&
              (error.name === "TimeoutError" || error.name === "AbortError"))
          ) {
            console.error("[/api/chat] request timed out or was cancelled:", {
              stage: requestStage,
              message,
            });
            return new Response("উত্তর তৈরি করতে বেশি সময় লাগছে। ছোট করে প্রশ্নটি আবার করুন।", {
              status: 504,
            });
          }

          console.error("[/api/chat] error:", message);

          return new Response(`AI error: ${message}`, {
            status: 500,
          });
        }
      },
    },
  },
});
