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

export function useCurrentUser(): State {
  const [state, setState] = useState<Omit<State, "refetch">>({ loading: true, data: null });

  const load = useCallback(async (user: User | null) => {
    if (!user) {
      setState({ loading: false, data: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).order("role", { ascending: true }).limit(1).maybeSingle(),
    ]);
    const rawRole = roleRes.data?.role;
    const validRole: Role | null = rawRole === "admin" || rawRole === "manager" ? rawRole : null;

    setState({
      loading: false,
      data: {
        user,
        role: validRole,
        fullName: profileRes.data?.full_name || user.email || "User",
      },
    });
  }, []);

  const refetch = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await load(data.user);
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) load(data.user);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) load(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  return {
    ...state,
    refetch,
  };
}

