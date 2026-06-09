import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAssistantTools } from "@/lib/ai-tools.server";

const SYSTEM_PROMPT = `তুমি "CDB Bricks AI সহকারী" — একটি ইট ভাটার অ্যাডমিন এর ব্যবসায়িক সহকারী।

নিয়মাবলী:
- সর্বদা প্রাকৃতিক, সাবলীল বাংলা ভাষায় উত্তর দাও।
- সংখ্যা সর্বদা ইংরেজি অংকে দাও কিন্তু একক বাংলায় (যেমন: ৳৪৫,০০০, ৫,০০০ পিস, ২০০ ফুট)।
- ইটের পরিমাণ দেখানোর সময় সঠিক একক ব্যবহার করো:
  - সাধারণ ইট = "পিস"
  - আদলা (১ নং আদলা, ২ নং আদলা, মিক্সার আদলা) = "ফুট"
- সময়সূচক শব্দ যেমন "আজকে", "গতকাল", "এই সপ্তাহে", "গত মাসে" এলে আগে \`resolveDateRange\` টুল ব্যবহার করে তারিখের সীমা বের করো, তারপর উপযুক্ত ডেটা টুল কল করো।
- কখনো অনুমান করে উত্তর দিও না — সবসময় টুল কল করে প্রকৃত ডেটা থেকে উত্তর তৈরি করো।
- যদি কোন ডেটা না পাও, ভদ্রভাবে বলো: "দুঃখিত, এই তথ্যটি খুঁজে পাইনি।"
- উত্তর সংক্ষিপ্ত ও পরিষ্কার রাখো — দরকারে বুলেট পয়েন্ট ব্যবহার করো।
- তুমি শুধুমাত্র পঠনযোগ্য (read-only) — কখনো কোন ডেটা পরিবর্তন বা মুছে ফেলার চেষ্টা করো না।

আজকের তারিখ: ${new Date().toISOString().slice(0, 10)}
`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
          if (!token) {
            console.error("[/api/chat] Missing bearer token");
            return new Response("দয়া করে আবার লগইন করুন (টোকেন নেই)।", { status: 401 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userData?.user) {
            console.error("[/api/chat] getUser failed:", userErr?.message);
            return new Response("সেশনের মেয়াদ শেষ — পুনরায় লগইন করুন।", { status: 401 });
          }
          const userId = userData.user.id;

          const { data: roleRow } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "admin")
            .maybeSingle();
          if (!roleRow) {
            return new Response("এই ফিচারটি শুধু অ্যাডমিনদের জন্য।", { status: 403 });
          }

          const body = (await request.json()) as { messages?: UIMessage[] };
          const messages = Array.isArray(body.messages) ? body.messages : [];

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return new Response("AI কনফিগার করা হয়নি (LOVABLE_API_KEY নেই)।", { status: 500 });
          }
          const gateway = createLovableAiGatewayProvider(apiKey);

          const tools = buildAssistantTools(supabaseAdmin);

          const result = streamText({
            model: gateway("google/gemini-2.5-flash"),
            system: SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages),
            tools,
            stopWhen: stepCountIs(50),
          });

          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.error("[/api/chat] error:", msg);
          return new Response(`AI error: ${msg}`, { status: 500 });
        }
      },
    },
  },
});
