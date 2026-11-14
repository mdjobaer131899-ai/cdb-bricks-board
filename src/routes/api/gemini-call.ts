import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI } from "@google/genai";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

// The same order as the ai-brain Edge Function (the app's first route): the stronger model first,
// the next one at once when it fails or after a wait when it is slow; photos to the Pro model first.
const list = (v: string | undefined, fallback: string[]) => {
  const xs = (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return xs.length ? xs : fallback;
};
const TEXT_MODELS = list(process.env.GEMINI_TEXT_MODELS, [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
const FILE_MODELS = list(process.env.GEMINI_FILE_MODELS, ["gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-3.5-flash-lite"]);
const PLAN = { text: { wait: 8000, overall: 22000 }, file: { wait: 15000, overall: 42000 } };

export const Route = createFileRoute("/api/gemini-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = (request.headers.get("authorization") ?? "")
            .replace(/^Bearer\s+/i, "")
            .trim();
          if (!token) return json({ error: "দয়া করে আবার লগইন করুন।" }, 401);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(token);
          if (uErr || !u?.user) return json({ error: "সেশনের মেয়াদ শেষ, আবার লগইন করুন।" }, 401);

          const { data: roleRow } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", u.user.id)
            .in("role", ["admin", "manager"])
            .limit(1)
            .maybeSingle();
          if (!roleRow) return json({ error: "আপনার অনুমতি নেই।" }, 403);

          const body = (await request.json()) as {
            promptText?: unknown;
            attachment?: { mimeType?: string; base64Data?: string } | null;
          };
          const promptText = typeof body.promptText === "string" ? body.promptText : "";
          if (!promptText || promptText.length > 300_000) {
            return json({ error: "বার্তা খালি বা খুব বড়।" }, 400);
          }

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) return json({ error: "GEMINI_API_KEY কনফিগার করা নেই।" }, 500);

          const parts: Part[] = [{ text: promptText }];
          const att = body.attachment;
          if (att?.base64Data) {
            if (att.base64Data.length > 14_000_000) {
              return json({ error: "ফাইল খুব বড়।" }, 400);
            }
            parts.push({
              inlineData: { mimeType: att.mimeType || "image/jpeg", data: att.base64Data },
            });
          }

          const ai = new GoogleGenAI({ apiKey });
          const started = Date.now();
          let lastError: unknown = null;

          try {
            const hasFile = parts.length > 1;
            const models = hasFile ? FILE_MODELS : TEXT_MODELS;
            const plan = hasFile ? PLAN.file : PLAN.text;
            const runModel = async (name: string) => {
              const config: Record<string, unknown> = { responseMimeType: "application/json" };
              // lite মডেলে চিন্তার মাত্রা বদলানোর দরকার নেই
              if (!name.includes("lite")) config.thinkingConfig = { thinkingLevel: "low" };
              const res = await ai.models.generateContent({ model: name, contents: [{ role: "user", parts }], config: config as never });
              const text = (res.text ?? "").trim();
              if (!text) throw new Error("EMPTY");
              return text;
            };
            const result = await new Promise<{ text: string; model: string }>((resolve, reject) => {
              const timers = new Set<ReturnType<typeof setTimeout>>();
              let finished = false;
              let next = 0;
              let running = 0;
              const finish = (fn: () => void) => {
                if (finished) return;
                finished = true;
                clearTimeout(overall);
                timers.forEach((t) => clearTimeout(t));
                fn();
              };
              const overall = setTimeout(() => finish(() => reject(new Error("TIMEOUT"))), plan.overall);
              const start = () => {
                if (finished || next >= models.length) return;
                const name = models[next++];
                running++;
                let timer: ReturnType<typeof setTimeout> | undefined;
                if (next < models.length) {
                  timer = setTimeout(() => { timers.delete(timer!); start(); }, plan.wait);
                  timers.add(timer);
                }
                runModel(name).then(
                  (text) => finish(() => resolve({ text, model: name })),
                  (e) => {
                    lastError = e;
                    running--;
                    if (finished) return;
                    const status = (e as { status?: number })?.status;
                    console.warn(`[/api/gemini-call] মডেল ${name} কাজ করেনি (status: ${status ?? "?"}) ${Date.now() - started}ms`);
                    if (timer !== undefined && timers.has(timer)) {
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

            console.log(`[/api/gemini-call] ঠিক আছে, ${Date.now() - started}ms, মডেল: ${result.model}`);
            return json({ text: result.text });
          } catch (e) {
            console.error("[/api/gemini-call] সব চেষ্টা ব্যর্থ:", e);
            const timedOut = e instanceof Error && e.message === "TIMEOUT";
            return json(
              { error: timedOut ? "TIMEOUT" : "AI সার্ভিস এখন ব্যস্ত, একটু পরে চেষ্টা করুন।" },
              503,
            );
          }
        } catch (e) {
          console.error("[/api/gemini-call]", e);
          return json({ error: "AI সার্ভিসে সমস্যা হয়েছে।" }, 500);
        }
      },
    },
  },
});