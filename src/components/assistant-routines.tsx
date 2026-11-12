import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { currentPushSubscription, enablePush, pushPermission, sendRoutineTestPush } from "@/lib/push";
import { ROUTINE_INFO, ROUTINE_ORDER, hm, useRoutines, type Routine, type RoutineKind } from "@/lib/routines";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * সহকারীর রুটিন (settings, admin): each routine with its time and an on/off switch, whether
 * this phone gets the notifications, and a button to send the attendance reminder now.
 */
export function RoutinesCard() {
  const { data: me } = useCurrentUser();
  const routinesQ = useRoutines();
  const [push, setPush] = useState<"on" | "off" | "blocked" | "unsupported" | "checking">("checking");

  useEffect(() => {
    void (async () => {
      const perm = pushPermission();
      if (perm === "unsupported") return setPush("unsupported");
      if (perm === "denied") return setPush("blocked");
      setPush((await currentPushSubscription()) ? "on" : "off");
    })();
  }, []);

  // a successful mutation refreshes every query (router.tsx)
  const save = useMutation({
    mutationFn: async (r: Partial<Routine> & { kind: RoutineKind }) => {
      const { error } = await supabase.from("agent_routines").update({ ...r, updated_by: me?.user.id ?? null, updated_at: new Date().toISOString() }).eq("kind", r.kind);
      if (error) throw error;
    },
    onSuccess: () => toast.success("রুটিন বদলানো হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });
  const turnOn = useMutation({
    mutationFn: async () => { await enablePush(me!.user.id); },
    onSuccess: () => { setPush("on"); toast.success("এই ফোনে নোটিফিকেশন চালু হয়েছে"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: sendRoutineTestPush,
    onSuccess: () => toast.success("পরীক্ষার নোটিফিকেশন পাঠানো হয়েছে, ফোনে দেখুন"),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = ROUTINE_ORDER.map((k) => routinesQ.data?.find((r) => r.kind === k)).filter(Boolean) as Routine[];

  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="text-[15px] font-semibold leading-tight">ফোনে মনে করিয়ে দেওয়া</div>
          <div className="text-xs text-muted-foreground">
            {push === "on" ? "এই ফোনে নোটিফিকেশন চালু আছে। নির্দিষ্ট সময়ে কাজ বাকি থাকলে খবর আসবে।"
              : push === "blocked" ? "ব্রাউজারে এই সাইটের নোটিফিকেশন বন্ধ করা আছে। ব্রাউজারের সেটিংস থেকে চালু করুন।"
              : push === "unsupported" ? "এই ব্রাউজারে নোটিফিকেশন চলে না। ফোনে Chrome দিয়ে খুলুন।"
              : push === "off" ? "এই ফোনে নোটিফিকেশন বন্ধ। চালু না করলে শুধু হোম পাতার কাজের তালিকায় দেখাবে।"
              : "দেখা হচ্ছে..."}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {push === "off" && (
              <button type="button" disabled={turnOn.isPending || !me} onClick={() => turnOn.mutate()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
                {turnOn.isPending ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "নোটিফিকেশন চালু করুন"}
              </button>
            )}
            {push === "on" && (
              <button type="button" disabled={test.isPending} onClick={() => test.mutate()} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-60">
                {test.isPending ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "এখন একটা পরীক্ষা পাঠান"}
              </button>
            )}
            <Link to={"/weather" as never} className="rounded-lg px-1 py-1.5 text-xs font-bold text-primary">আবহাওয়ার সতর্কতা</Link>
          </div>
        </div>
      </div>

      {routinesQ.isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">লোড হচ্ছে...</div>}
      {list.map((r) => (
        <div key={r.kind} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className={`text-[15px] font-semibold leading-tight ${r.enabled ? "" : "text-muted-foreground"}`}>{ROUTINE_INFO[r.kind].label}</div>
            <div className="text-xs text-muted-foreground">{ROUTINE_INFO[r.kind].hint}</div>
          </div>
          <input
            type="time"
            aria-label={`${ROUTINE_INFO[r.kind].label}: সময়`}
            disabled={!r.enabled || save.isPending}
            defaultValue={hm(r.at_time)}
            onChange={(e) => { const v = e.target.value; if (/^\d{2}:\d{2}$/.test(v) && v !== hm(r.at_time)) save.mutate({ kind: r.kind, at_time: v }); }}
            className="num h-9 w-[104px] rounded-lg border bg-background px-2 text-sm disabled:opacity-50"
          />
          <button
            type="button"
            role="switch"
            aria-checked={r.enabled}
            aria-label={`${ROUTINE_INFO[r.kind].label} ${r.enabled ? "বন্ধ করুন" : "চালু করুন"}`}
            disabled={save.isPending}
            onClick={() => save.mutate({ kind: r.kind, enabled: !r.enabled })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${r.enabled ? "bg-primary" : "bg-stone-300 dark:bg-stone-600"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${r.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      ))}
      <p className="px-4 py-2.5 text-xs text-muted-foreground">সময় হওয়ার পর কাজ বাকি থাকলে একবার খবর আসে (হাজিরা ও দিন বন্ধ: দুই ঘণ্টা পর আরেকবার)। রাত ১০টা থেকে সকাল ৬টা পর্যন্ত কিছু আসে না।</p>
    </div>
  );
}
