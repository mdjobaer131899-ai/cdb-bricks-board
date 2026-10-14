// CDB Bricks AI ব্রেন — Supabase ক্লাউড ফাংশন
// ব্রাউজার থেকে প্রশ্ন আসে, এখানে লগইন ও অনুমতি যাচাই করে Gemini-কে পাঠানো হয়।
// Gemini key শুধু Supabase-এর গোপন সেটিংসে (GEMINI_API_KEY) থাকে, কোডে বা ব্রাউজারে নয়।
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// দ্রুত ও কম ভিড়ের মডেল আগে; একটু পরপর পরেরটা শুরু হয়, যেটা আগে উত্তর দেয় সেটাই নেওয়া হয়
const MODELS: { name: string; delay: number }[] = [
  { name: "gemini-3.5-flash-lite", delay: 0 },
  { name: "gemini-3.1-flash-lite", delay: 1500 },
  { name: "gemini-3.5-flash", delay: 3000 },
  { name: Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash", delay: 4500 },
];
const OVERALL_TIMEOUT_MS = 22_000;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function callModel(model: string, apiKey: string, parts: Part[], signal: AbortSignal): Promise<string> {
  const generationConfig: Record<string, unknown> = { responseMimeType: "application/json" };
  if (!model.includes("lite")) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p?.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("EMPTY");
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "শুধু POST অনুরোধ চলে।" }, 405);

  try {
    // ১. লগইন যাচাই
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "দয়া করে আবার লগইন করুন।" }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "সেশনের মেয়াদ শেষ, আবার লগইন করুন।" }, 401);

    // ২. অনুমতি যাচাই (অ্যাডমিন বা ম্যানেজার)
    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", u.user.id);
    const allowed = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "manager");
    if (!allowed) return json({ error: "আপনার অনুমতি নেই।" }, 403);

    // ৩. অনুরোধ পড়া
    const body = (await req.json().catch(() => ({}))) as {
      promptText?: unknown;
      attachment?: { mimeType?: string; base64Data?: string } | null;
    };
    const promptText = typeof body.promptText === "string" ? body.promptText : "";
    if (!promptText || promptText.length > 400_000) return json({ error: "বার্তা খালি বা খুব বড়।" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY সেট করা নেই।" }, 500);

    const parts: Part[] = [{ text: promptText }];
    const att = body.attachment;
    if (att?.base64Data) {
      if (att.base64Data.length > 14_000_000) return json({ error: "ফাইল খুব বড়।" }, 400);
      parts.push({ inlineData: { mimeType: att.mimeType || "image/jpeg", data: att.base64Data } });
    }

    // ৪. মডেলগুলো একটু পরপর শুরু, প্রথম সফল উত্তর নেওয়া
    const started = Date.now();
    const controller = new AbortController();
    const result = await new Promise<{ text: string; model: string }>((resolve, reject) => {
      let finished = false;
      let pending = MODELS.length;
      let lastError: unknown = null;
      const timers: number[] = [];

      const finish = (fn: () => void) => {
        if (finished) return;
        finished = true;
        clearTimeout(overall);
        timers.forEach((t) => clearTimeout(t));
        fn();
        controller.abort();
      };

      const overall = setTimeout(() => finish(() => reject(new Error("TIMEOUT"))), OVERALL_TIMEOUT_MS);

      for (const m of MODELS) {
        timers.push(
          setTimeout(async () => {
            if (finished) return;
            try {
              const text = await callModel(m.name, apiKey, parts, controller.signal);
              finish(() => resolve({ text, model: m.name }));
            } catch (e) {
              lastError = e;
              if (!finished) console.warn(`[ai-brain] ${m.name} কাজ করেনি:`, e instanceof Error ? e.message : e);
            } finally {
              pending--;
              if (pending <= 0) finish(() => reject(lastError ?? new Error("ALL_FAILED")));
            }
          }, m.delay),
        );
      }
    });

    console.log(`[ai-brain] ঠিক আছে, ${Date.now() - started}ms, মডেল: ${result.model}`);
    return json({ text: result.text, model: result.model });
  } catch (e) {
    const timedOut = e instanceof Error && e.message === "TIMEOUT";
    console.error("[ai-brain]", e);
    return json({ error: timedOut ? "TIMEOUT" : "AI সার্ভিস এখন ব্যস্ত, একটু পরে চেষ্টা করুন।" }, timedOut ? 504 : 503);
  }
});
