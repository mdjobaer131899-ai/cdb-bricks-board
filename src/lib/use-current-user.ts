import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

export interface CurrentUser {
  user: User;
  role: Role;
  fullName: string;
}

interface State {
  loading: boolean;
  data: CurrentUser | null;
}

export function useCurrentUser(): State {
  const [state, setState] = useState<State>({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;

    async function load(user: User | null) {
      if (!user) {
        if (!cancelled) setState({ loading: false, data: null });
        return;
      }
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).order("role", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setState({
        loading: false,
        data: {
          user,
          role: (roleRes.data?.role as Role) ?? "manager",
          fullName: profileRes.data?.full_name || user.email || "User",
        },
      });
    }

    supabase.auth.getUser().then(({ data }) => load(data.user));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
