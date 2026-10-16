// CDB Bricks — weather alerts as phone notifications (Web Push).
// pg_cron calls this every 30 minutes with action "check" (and the x-cron-secret header).
// The app calls it for "public-key" (to subscribe) and "test" (admin only, with the user's login).
// The rules are in kiln-weather.ts, a copy of src/lib/kiln-weather.ts — keep the two the same.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { dhakaHourKey, dryingDay, fetchKilnForecast, kilnSignals, type KilnForecast } from "./kiln-weather.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const bn = (x: number) => Number(x).toLocaleString("bn-BD");
const dhakaDate = (iso: string | Date) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).slice(0, 10);

async function getSecret(key: string): Promise<string | null> {
  const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

/** VAPID keys are made once by this function and kept in app_secrets; the private key never leaves the server */
async function vapidKeys() {
  let pub = await getSecret("vapid_public");
  let priv = await getSecret("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await db.from("app_secrets").upsert(
      [{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }],
      { onConflict: "key", ignoreDuplicates: true },
    );
    pub = await getSecret("vapid_public");
    priv = await getSecret("vapid_private");
  }
  return { publicKey: pub!, privateKey: priv! };
}

type Payload = { title: string; body: string; tag: string; url: string; level: "red" | "orange" | "info" };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendTo(subs: Sub[], payload: Payload) {
  const { publicKey, privateKey } = await vapidKeys();
  webpush.setVapidDetails("https://cdb-bricks-board.vercel.app", publicKey, privateKey);
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: payload.level === "red" ? 3600 : 6 * 3600, urgency: payload.level === "red" ? "high" : "normal" },
      );
      sent++;
      if (s.id) await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      errors.push(`${code ?? ""} ${(e as Error).message}`.trim());
      // the browser dropped this subscription
      if (s.id && (code === 404 || code === 410)) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return { sent, errors };
}

async function allSubs(userId?: string): Promise<Sub[]> {
  let q = db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return (data ?? []) as Sub[];
}

async function lastSent(key: string) {
  const { data } = await db.from("weather_alert_log").select("sent_at, title").eq("signal_key", key)
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data as { sent_at: string; title: string } | null;
}

function morningSummary(f: KilnForecast, today: string): Payload {
  const dry = dryingDay(f, today);
  const days = f.days.slice(0, 3);
  const names = ["আজ", "কাল", "পরশু"];
  const rain = days.map((d, i) => `${names[i]} ${bn(d.rainProb)}%`).join(", ");
  const yellow = kilnSignals(f).filter((s) => s.level === "yellow").map((s) => s.title);
  const parts = [
    dry ? `কাঁচা ইট শুকানো: ${dry.label} (${dry.reason})` : "",
    `বৃষ্টির সম্ভাবনা: ${rain}`,
    ...yellow,
  ].filter(Boolean);
  return { title: "🌤️ আজকের আবহাওয়া — কাপাসিয়া", body: parts.join("\n"), tag: `morning-${today}`, url: "/weather", level: "info" };
}

/** Cron run: send red/orange signals not sent recently, and the 6 am summary */
async function check() {
  const subs = await allSubs();
  if (subs.length === 0) return { subs: 0, sent: [] };
  const f = await fetchKilnForecast();
  const now = new Date();
  const key = dhakaHourKey(now);
  const today = key.slice(0, 10);
  const hour = Number(key.slice(11, 13));
  const quiet = hour >= 22 || hour < 6; // only red at night
  const out: string[] = [];

  for (const s of kilnSignals(f, now)) {
    if (s.level === "yellow") continue; // goes in the morning summary
    if (quiet && s.level !== "red") continue;
    const last = await lastSent(s.key);
    if (last) {
      const ageH = (now.getTime() - new Date(last.sent_at).getTime()) / 3_600_000;
      if (s.level === "red" && ageH < 3) continue; // a red signal repeats at most every 3 hours
      if (s.level === "orange" && dhakaDate(last.sent_at) === today) continue; // orange once a day
    }
    const res = await sendTo(subs, {
      title: `${s.level === "red" ? "🔴 জরুরি" : "🟠 সতর্কতা"}: ${s.title}`,
      body: s.action, tag: s.key, url: "/weather", level: s.level,
    });
    await db.from("weather_alert_log").insert({ signal_key: s.key, level: s.level, title: s.title });
    out.push(`${s.key}:${res.sent}`);
  }

  if (hour === 6) {
    const mk = `morning-${today}`;
    if (!(await lastSent(mk))) {
      const p = morningSummary(f, today);
      const res = await sendTo(subs, p);
      await db.from("weather_alert_log").insert({ signal_key: mk, level: "info", title: p.title });
      out.push(`${mk}:${res.sent}`);
    }
  }
  return { subs: subs.length, sent: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const action = String(body.action ?? "");

  try {
    if (action === "public-key") {
      return json({ publicKey: (await vapidKeys()).publicKey });
    }

    if (action === "check" || action === "selftest") {
      const secret = await getSecret("weather_cron_secret");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
      if (action === "check") return json(await check());
      // selftest: encrypt and send to a given (throwaway) subscription to prove the push path works
      const sub = body.subscription as Sub;
      return json(await sendTo([{ ...sub, id: "" }], { title: "selftest", body: "selftest", tag: "selftest", url: "/", level: "info" }));
    }

    if (action === "test") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await db.auth.getUser(token);
      if (!u?.user) return json({ error: "আবার লগইন করুন" }, 401);
      const { data: role } = await db.from("user_roles").select("role").eq("user_id", u.user.id).maybeSingle();
      if (role?.role !== "admin") return json({ error: "শুধু এডমিন" }, 403);
      const subs = await allSubs(u.user.id);
      if (subs.length === 0) return json({ error: "এই ফোনে নোটিফিকেশন চালু নেই" }, 400);
      const f = await fetchKilnForecast();
      const signals = kilnSignals(f).filter((s) => s.level !== "yellow");
      const res = await sendTo(subs, {
        title: "✅ পরীক্ষা: আবহাওয়ার নোটিফিকেশন চালু আছে",
        body: signals.length ? `এখনকার সংকেত: ${signals.map((s) => s.title).join("; ")}` : "এখন কোনো সতর্কতা নেই। বৃষ্টির আগে এখানে খবর আসবে।",
        tag: "test", url: "/weather", level: "info",
      });
      return json(res);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[weather-alerts]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
