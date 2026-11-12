import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The assistant's daily routines (agent_routines): at a set time the app asks for the day's
 * routine work. The Edge Function kiln-routines sends the phone notification; the admin home
 * shows the same as a task. agent_checkins marks a day as done when the data cannot tell.
 * Each notification opens the assistant on that routine (/?ask=<kind>), where it can be
 * answered by voice: who was away, the day's kacha bricks, the drawer count.
 */
export type RoutineKind = "attendance" | "kacha" | "day_close" | "loans" | "morning";
export type Routine = { kind: RoutineKind; enabled: boolean; at_time: string };

export const ROUTINE_INFO: Record<RoutineKind, { label: string; hint: string }> = {
  morning: { label: "সকালের হিসাব", hint: "গতকাল কত এলো-গেলো, হাতে নগদ আর আজকের কাজ" },
  attendance: { label: "ডেলি শ্রমিকের হাজিরা", hint: "সহকারী জিজ্ঞেস করবে কে কে আসেনি" },
  kacha: { label: "কাঁচা ইট লেখা", hint: "উৎপাদন চললে, আজকের কাঁচা ইট লেখা না হলে" },
  day_close: { label: "দিন বন্ধ", hint: "ড্রয়ারের টাকা গোনা না হলে" },
  loans: { label: "ঋণের তারিখ", hint: "কোনো ঋণ শোধ বা ফেরতের তারিখ আজ-কাল হলে" },
};
export const ROUTINE_ORDER: RoutineKind[] = ["morning", "loans", "attendance", "kacha", "day_close"];

/** "15:00:00" → "15:00" */
export const hm = (t: string) => String(t ?? "").slice(0, 5);

export function useRoutines() {
  return useQuery({
    queryKey: ["agent-routines"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_routines").select("kind, enabled, at_time");
      if (error) throw error;
      return (data ?? []) as Routine[];
    },
  });
}

/** marks a routine done for a day (errors ignored: a missing mark only means one extra reminder) */
export async function markCheckin(kind: RoutineKind, date: string, userId: string) {
  await supabase.from("agent_checkins").upsert(
    { kind, check_date: date, done_by: userId },
    { onConflict: "kind,check_date", ignoreDuplicates: true },
  );
}
