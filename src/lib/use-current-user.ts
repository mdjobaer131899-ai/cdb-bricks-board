import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

export interface CurrentUser {
  user: User;
  role: Role | null;
  fullName: string;
}

interface State {
  loading: boolean;
  data: CurrentUser | null;
  refetch: () => Promise<void>;
}

/* =========================================================
   বর্তমান ইউজার — পুরো অ্যাপে একটাই কপি।

   আগে প্রতিটি পাতা/অংশ আলাদা করে ইউজার আনত, আর ব্রাউজারে ফিরে আসলেই
   (Supabase টোকেন নবায়ন করলে) "লোড হচ্ছে" অবস্থায় চলে যেত। তাতে পুরো পাতা
   মুছে আবার আঁকা হতো, দেখতে রিফ্রেশের মতো লাগত।

   এখন: একবার আনা হয়, সবাই সেটাই ব্যবহার করে। শুধু অন্য কেউ লগইন করলে
   বা লগ আউট হলে নতুন করে আনা হয়। টোকেন নবায়নে কিছুই বদলায় না।
   ========================================================= */

type Snapshot = Omit<State, "refetch">;

let current: Snapshot = { loading: true, data: null };
let loadedFor: string | null | undefined = undefined; // কোন ইউজারের জন্য আনা হয়েছে
let inFlight: Promise<void> | null = null;
let started = false;
const listeners = new Set<(s: Snapshot) => void>();

function publish(next: Snapshot) {
  current = next;
  for (const l of listeners) l(current);
}

async function loadFor(user: User | null, force = false): Promise<void> {
  const id = user?.id ?? null;
  if (!force && loadedFor === id && !current.loading) return;
  if (!force && inFlight && loadedFor === id) return inFlight;
  loadedFor = id;

  if (!user) {
    publish({ loading: false, data: null });
    return;
  }

  // আগের তথ্য থাকলে সেটা দেখাতে থাকে — "লোড হচ্ছে" দেখায় না
  if (!current.data || current.data.user.id !== id) publish({ loading: true, data: null });

  inFlight = (async () => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).order("role", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (loadedFor !== id) return; // এর মধ্যে অন্য ইউজার এসে গেছে

      // নেট না থাকলে আগের ভূমিকা রেখে দেওয়া হয়, যাতে পাতা বন্ধ না হয়
      if ((profileRes.error || roleRes.error) && current.data?.user.id === id) {
        publish({ loading: false, data: { ...current.data, user } });
        return;
      }

      const rawRole = roleRes.data?.role;
      const validRole: Role | null = rawRole === "admin" || rawRole === "manager" ? rawRole : null;
      publish({
        loading: false,
        data: {
          user,
          role: validRole,
          fullName: profileRes.data?.full_name || user.email || "User",
        },
      });
    } catch {
      if (loadedFor === id) publish({ loading: false, data: current.data });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  // getSession নেট ছাড়াই ফোনে রাখা লগইন পড়ে — তাই দ্রুত ও নির্ভরযোগ্য
  supabase.auth.getSession().then(({ data }) => loadFor(data.session?.user ?? null));

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    if (event === "SIGNED_OUT") {
      loadFor(null, true);
      return;
    }
    if (event === "USER_UPDATED") {
      loadFor(user, true);
      return;
    }
    // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED: একই ইউজার হলে কিছু করার নেই
    if ((user?.id ?? null) !== loadedFor) loadFor(user);
  });
}

export function useCurrentUser(): State {
  const [state, setState] = useState<Snapshot>(current);

  useEffect(() => {
    start();
    listeners.add(setState);
    setState(current); // মাউন্টের মাঝে বদলে থাকলে
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refetch = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadFor(data.session?.user ?? null, true);
  }, []);

  return { ...state, refetch };
}
