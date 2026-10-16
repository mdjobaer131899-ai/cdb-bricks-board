import { supabase } from "@/integrations/supabase/client";

/**
 * Phone notifications for weather signals (Web Push). The service worker is public/sw.js;
 * the Edge Function weather-alerts holds the keys and sends the messages.
 */

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function functionError(error: any): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch { /* not json */ }
  return error?.message ?? "সার্ভারে সমস্যা হয়েছে";
}

/** This phone's current subscription, if notifications are on */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(userId: string) {
  if (!pushSupported()) throw new Error("এই ব্রাউজারে নোটিফিকেশন চলে না। ফোনে Chrome দিয়ে খুলুন।");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("নোটিফিকেশনের অনুমতি দেওয়া হয়নি। ব্রাউজারের সেটিংসে এই সাইটের নোটিফিকেশন চালু করুন।");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const { data, error } = await supabase.functions.invoke("weather-alerts", { body: { action: "public-key" } });
  if (error || !data?.publicKey) throw new Error(error ? await functionError(error) : "সার্ভার থেকে চাবি পাওয়া যায়নি");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) });
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("ফোন থেকে নোটিফিকেশনের ঠিকানা পাওয়া যায়নি");

  const { error: e2 } = await (supabase as any).from("push_subscriptions").upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: "endpoint" },
  );
  if (e2) throw new Error(e2.message);
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await (supabase as any).from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke("weather-alerts", { body: { action: "test" } });
  if (error) throw new Error(await functionError(error));
  if (!data?.sent) throw new Error(data?.errors?.[0] ? `পাঠানো যায়নি: ${data.errors[0]}` : "পাঠানো যায়নি");
  return data;
}
