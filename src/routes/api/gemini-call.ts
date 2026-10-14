import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI } from "@google/genai";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

// দ্রুত ও কম ভিড়ের মডেল আগে। যেটা আগে উত্তর দেবে, সেটাই নেওয়া হবে।
const MODELS: { name: string; delay: number }[] = [
  { name: "gemini-3.5-flash-lite", delay: 0 },
  { name: "gemini-3.1-flash-lite", delay: 2000 },
  { name: "gemini-3.5-flash", delay: 4000 },
  { name: process.env.GEMINI_MODEL || "gemini-3.8-flash", delay: 6000 },
];

const OVERALL_TIMEOUT_MS = 25000;

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
            const result = await new Promise<{ text: string; model: string }>((resolve, reject) => {
              let finished = false;
              let pending = MODELS.length;

              const overall = setTimeout(() => {
                if (!finished) {
                  finished = true;
                  reject(new Error("TIMEOUT"));
                }
              }, OVERALL_TIMEOUT_MS);

              for (const m of MODELS) {
                setTimeout(async () => {
                  if (finished) {
                    pending--;
                    return;
                  }
                  try {
                    const config: Record<string, unknown> = {
                      responseMimeType: "application/json",
                    };
                    // lite মডেলে চিন্তার মাত্রা বদলানোর দরকার নেই
                    if (!m.name.includes("lite")) {
                      config.thinkingConfig = { thinkingLevel: "low" };
                    }
                    const res = await ai.models.generateContent({
                      model: m.name,
                      contents: [{ role: "user", parts }],
                      config: config as never,
                    });
                    if (!finished) {
                      finished = true;
                      clearTimeout(overall);
                      resolve({ text: res.text ?? "", model: m.name });
                    }
                  } catch (e) {
                    lastError = e;
                    const status = (e as { status?: number })?.status;
                    console.warn(
                      `[/api/gemini-call] মডেল ${m.name} কাজ করেনি (status: ${status ?? "?"}) ${Date.now() - started}ms`,
                    );
                  } finally {
                    pending--;
                    if (pending <= 0 && !finished) {
                      finished = true;
                      clearTimeout(overall);
                      reject(lastError ?? new Error("ALL_FAILED"));
                    }
                  }
                }, m.delay);
              }
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