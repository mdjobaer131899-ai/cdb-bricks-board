// CDB Bricks — the assistant's daily routines as phone notifications (Web Push).
// pg_cron calls this every 30 minutes with action "check" (and the x-cron-secret header).
// Each routine in agent_routines has a time; from that time until 22:00 Dhaka, if the day's
// work is not done yet, the admins' phones get one reminder (attendance and day close get a
// second one two hours later). Tapping it opens the right place in the app.
// The app calls "test" (admin only, with the user's login) to send today's attendance reminder now.
// Push keys are the ones weather-alerts made (app_secrets vapid_public / vapid_private).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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
const tk = (x: number) => `৳${bn(Math.round(x))}`;

/** today's date and the clock in Dhaka */
function dhakaNow(at = new Date()) {
  const s = at.toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }); // "2026-11-12 15:05:00"
  return { today: s.slice(0, 10), hm: s.slice(11, 16) };
}
function addDays(iso: string, n: number) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

async function getSecret(key: string): Promise<string | null> {
  const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

type Payload = { title: string; body: string; tag: string; url: string; level: "info" };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendTo(subs: Sub[], payload: Payload) {
  const pub = await getSecret("vapid_public");
  const priv = await getSecret("vapid_private");
  if (!pub || !priv) throw new Error("push keys missing: open the weather page once to set up notifications");
  webpush.setVapidDetails("https://cdb-bricks-board.vercel.app", pub, priv);
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3 * 3600, urgency: "normal" },
      );
      sent++;
      await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      errors.push(`${code ?? ""} ${(e as Error).message}`.trim());
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
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

// ------------------------------------------------------------------ what each routine asks
type Builder = (today: string) => Promise<Payload | null>;

const ROUTINES: Record<string, { maxPerDay: number; build: Builder }> = {
  // daily workers on the payroll today, attendance not confirmed yet
  attendance: {
    maxPerDay: 2,
    build: async (today) => {
      const { data: done } = await db.from("agent_checkins").select("id").eq("kind", "attendance").eq("check_date", today).maybeSingle();
      if (done) return null;
      const { data: workers } = await db.from("workers").select("id, active, join_date, leave_date").eq("role", "daily");
      const on = (workers ?? []).filter((w) => w.active !== false && (!w.join_date || w.join_date <= today) && (!w.leave_date || w.leave_date >= today));
      if (!on.length) return null;
      return {
        title: "🧑‍🏭 আজকের হাজিরা দিন",
        body: `ডেলি শ্রমিক ${bn(on.length)} জন। কে কে আসেনি, এখানে চেপে সহকারীকে বলে দিন।`,
        tag: `attendance-${today}`,
        url: "/?ask=attendance",
        level: "info",
      };
    },
  },
  // production is running (entries in the last 7 days) but nothing written today
  kacha: {
    maxPerDay: 1,
    build: async (today) => {
      const { data: recent } = await db.from("kacha_brick_entries").select("id, entry_date")
        .eq("entry_type", "production").gte("entry_date", addDays(today, -7)).lte("entry_date", today).limit(50);
      if (!recent?.length) return null;
      if (recent.some((r) => r.entry_date === today)) return null;
      return {
        title: "🧱 আজকের কাঁচা ইট লেখা হয়নি",
        body: "কোন মিলে কত হাজার ইট হলো, এখনই লিখে রাখুন।",
        tag: `kacha-${today}`,
        url: "/production-steps/kacha",
        level: "info",
      };
    },
  },
  // the drawer not counted today
  day_close: {
    maxPerDay: 2,
    build: async (today) => {
      const { data: closed } = await db.from("cash_day_closes").select("id").eq("close_date", today).maybeSingle();
      if (closed) return null;
      return {
        title: "🔒 আজকের দিন বন্ধ করা হয়নি",
        body: "ড্রয়ারের টাকা গুনে অ্যাপের হিসাবের সাথে মিলিয়ে নিন।",
        tag: `day-close-${today}`,
        url: "/cash-book",
        level: "info",
      };
    },
  },
  // a loan with money left whose date is past, today or tomorrow
  loans: {
    maxPerDay: 1,
    build: async (today) => {
      const { data: loans } = await db.from("loans").select("id, party_name, amount, direction, due_date")
        .not("due_date", "is", null).lte("due_date", addDays(today, 1));
      if (!loans?.length) return null;
      const { data: pays } = await db.from("loan_payments").select("loan_id, amount").in("loan_id", loans.map((l) => l.id));
      const left = loans
        .map((l) => ({ l, left: Number(l.amount) - (pays ?? []).filter((p) => p.loan_id === l.id).reduce((a, p) => a + Number(p.amount), 0) }))
        .filter((x) => x.left > 0.5)
        .sort((a, b) => String(a.l.due_date).localeCompare(String(b.l.due_date)));
      if (!left.length) return null;
      const when = (d: string) => (d < today ? "তারিখ পার হয়ে গেছে" : d === today ? "আজ" : "কাল");
      const lines = left.slice(0, 3).map(({ l, left }) =>
        `${l.party_name}: ${tk(left)} ${l.direction === "taken" ? "শোধ দিতে হবে" : "ফেরত পাওয়ার কথা"}, ${when(String(l.due_date))}`);
      return {
        title: "📅 ঋণের তারিখ এসেছে",
        body: lines.join("\n") + (left.length > 3 ? `\nআরও ${bn(left.length - 3)}টি` : ""),
        tag: `loans-${today}`,
        url: "/loans",
        level: "info",
      };
    },
  },
};

async function check(now = new Date()) {
  const subs = await allSubs();
  if (subs.length === 0) return { subs: 0, sent: [] };
  const { today, hm } = dhakaNow(now);
  if (hm < "06:00" || hm >= "22:00") return { subs: subs.length, quiet: true };
  const { data: routines } = await db.from("agent_routines").select("kind, enabled, at_time");
  const out: string[] = [];
  for (const r of routines ?? []) {
    const spec = ROUTINES[r.kind];
    if (!spec || !r.enabled || hm < String(r.at_time).slice(0, 5)) continue;
    const key = `routine:${r.kind}:${today}`;
    const { data: sent } = await db.from("weather_alert_log").select("sent_at").like("signal_key", `${key}%`).order("sent_at", { ascending: false });
    const count = sent?.length ?? 0;
    if (count >= spec.maxPerDay) continue;
    // a second reminder only two hours after the first
    if (count > 0 && now.getTime() - new Date(sent![0].sent_at).getTime() < 2 * 3600_000) continue;
    const payload = await spec.build(today);
    if (!payload) continue;
    if (count > 0) payload.title = `আবার মনে করাচ্ছি — ${payload.title}`;
    const res = await sendTo(subs, payload);
    await db.from("weather_alert_log").insert({ signal_key: `${key}:${count + 1}`, level: "info", title: payload.title });
    out.push(`${r.kind}:${res.sent}${res.errors.length ? ` (${res.errors.join("; ")})` : ""}`);
  }
  return { subs: subs.length, sent: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const action = String(body.action ?? "");

  try {
    if (action === "check") {
      const secret = await getSecret("weather_cron_secret");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
      return json(await check());
    }

    if (action === "test") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await db.auth.getUser(token);
      if (!u?.user) return json({ error: "আবার লগইন করুন" }, 401);
      const { data: role } = await db.from("user_roles").select("role").eq("user_id", u.user.id).maybeSingle();
      if (role?.role !== "admin") return json({ error: "শুধু এডমিন" }, 403);
      const subs = await allSubs(u.user.id);
      if (subs.length === 0) return json({ error: "এই ফোনে নোটিফিকেশন চালু নেই। আবহাওয়া পাতা থেকে চালু করুন।" }, 400);
      const { today } = dhakaNow();
      return json(await sendTo(subs, {
        title: "🧑‍🏭 পরীক্ষা: আজকের হাজিরা দিন",
        body: "এভাবেই প্রতিদিন হাজিরার সময় খবর আসবে। চাপলে সহকারী খুলে হাজিরা চাইবে।",
        tag: `routine-test-${today}`,
        url: "/?ask=attendance",
        level: "info",
      }));
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[kiln-routines]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
