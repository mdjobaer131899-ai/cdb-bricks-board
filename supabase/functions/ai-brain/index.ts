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

// The stronger model answers first. If it fails, the next one starts at once; if it is slow, the
// next one also starts after a wait, and the first answer is taken. Photos and ledger pages go to
// the Pro model first: it needs a billed key (e.g. the Google AI Pro subscription's monthly Cloud
// credit on the key's project); on a free key it fails at once and the next model answers.
// Secrets GEMINI_TEXT_MODELS / GEMINI_FILE_MODELS (comma separated) change the order.
const list = (v: string | undefined, fallback: string[]) => {
  const xs = (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return xs.length ? xs : fallback;
};
const TEXT_MODELS = list(Deno.env.get("GEMINI_TEXT_MODELS"), [Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
const FILE_MODELS = list(Deno.env.get("GEMINI_FILE_MODELS"), ["gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-3.5-flash-lite"]);
// the app waits 25 s for text and 45 s for a photo (gemini.ts AI_BUDGET_MS / AI_FILE_BUDGET_MS)
const PLAN = { text: { wait: 8_000, overall: 22_000 }, file: { wait: 15_000, overall: 42_000 } };

/** models in order: the next starts when one fails, or after waitMs while it is still thinking */
function cascade(
  models: string[], waitMs: number, overallMs: number,
  run: (model: string, signal: AbortSignal) => Promise<string>,
): Promise<{ text: string; model: string }> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timers = new Set<number>();
    let finished = false;
    let next = 0;
    let running = 0;
    let lastError: unknown = null;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(overall);
      timers.forEach((t) => clearTimeout(t));
      fn();
      controller.abort();
    };
    const overall = setTimeout(() => finish(() => reject(new Error("TIMEOUT"))), overallMs);
    const start = () => {
      if (finished || next >= models.length) return;
      const m = models[next++];
      running++;
      let timer: number | undefined;
      if (next < models.length) {
        timer = setTimeout(() => { timers.delete(timer!); start(); }, waitMs);
        timers.add(timer);
      }
      run(m, controller.signal).then(
        (text) => finish(() => resolve({ text, model: m })),
        (e) => {
          lastError = e;
          running--;
          if (finished) return;
          console.warn(`[ai-brain] ${m} কাজ করেনি:`, e instanceof Error ? e.message : e);
          if (timer !== undefined && timers.has(timer)) {
            // failed before its wait: the next model now
            clearTimeout(timer);
            timers.delete(timer);
            start();
          } else if (running <= 0 && next >= models.length) {
            finish(() => reject(lastError ?? new Error("ALL_FAILED")));
          }
        },
      );
    };
    start();
  });
}

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

    // ৪. শক্তিশালী মডেল আগে; না পারলে বা দেরি করলে পরেরটা
    const started = Date.now();
    const hasFile = parts.length > 1;
    const plan = hasFile ? PLAN.file : PLAN.text;
    const result = await cascade(hasFile ? FILE_MODELS : TEXT_MODELS, plan.wait, plan.overall,
      (model, signal) => callModel(model, apiKey, parts, signal));

    console.log(`[ai-brain] ঠিক আছে, ${Date.now() - started}ms, মডেল: ${result.model}`);
    return json({ text: result.text, model: result.model });
  } catch (e) {
    const timedOut = e instanceof Error && e.message === "TIMEOUT";
    console.error("[ai-brain]", e);
    return json({ error: timedOut ? "TIMEOUT" : "AI সার্ভিস এখন ব্যস্ত, একটু পরে চেষ্টা করুন।" }, timedOut ? 504 : 503);
  }
});
