import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setSeasonRange } from "@/lib/season-db";

export type SeasonRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const STORAGE_KEY = "cdb_active_season_id";

type Ctx = {
  seasons: SeasonRow[];
  season: SeasonRow | null;
  seasonId: string | null;
  /** সিজনের শুরুর তারিখ (ISO) — কোনো সিজন না থাকলে খুব পুরনো তারিখ */
  from: string;
  /** সিজনের শেষ তারিখ (ISO) */
  to: string;
  /** react-query key-এ ব্যবহারের জন্য */
  key: string;
  setSeasonId: (id: string) => void;
  loading: boolean;
};

const OPEN_FROM = "1900-01-01";
const OPEN_TO = "2999-12-31";

const SeasonContext = createContext<Ctx>({
  seasons: [],
  season: null,
  seasonId: null,
  from: OPEN_FROM,
  to: OPEN_TO,
  key: "all",
  setSeasonId: () => {},
  loading: false,
});

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [seasonId, setSeasonIdState] = useState<string | null>(null);

  const { data: seasons = [], isLoading } = useQuery({
    queryKey: ["seasons-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("id, name, start_date, end_date, is_active")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SeasonRow[];
    },
  });

  // প্রথমবার: localStorage → সক্রিয় সিজন → সর্বশেষ সিজন
  useEffect(() => {
    if (seasons.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && seasons.some((s) => s.id === stored) ? stored : null;
    const fallback = seasons.find((s) => s.is_active)?.id ?? seasons[0].id;
    setSeasonIdState((prev) => (prev && seasons.some((s) => s.id === prev) ? prev : valid ?? fallback));
  }, [seasons]);

  function setSeasonId(id: string) {
    setSeasonIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    // সিজন বদলালে সব ক্যাশড ডেটা রিফ্রেশ হবে
    qc.invalidateQueries();
  }

  const value = useMemo<Ctx>(() => {
    const season = seasons.find((s) => s.id === seasonId) ?? null;
    return {
      seasons,
      season,
      seasonId: season?.id ?? null,
      from: season?.start_date ?? OPEN_FROM,
      to: season?.end_date ?? OPEN_TO,
      key: season?.id ?? "all",
      setSeasonId,
      loading: isLoading,
    };
  }, [seasons, seasonId, isLoading]);

  useEffect(() => {
    setSeasonRange(value.season ? { from: value.from, to: value.to } : null);
  }, [value.season, value.from, value.to]);

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  return useContext(SeasonContext);
}

/** নির্বাচিত সিজনের মধ্যে তারিখ আছে কিনা */
export function useInSeason() {
  const { from, to } = useSeason();
  return (date?: string | null) => !!date && date >= from && date <= to;
}
