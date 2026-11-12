import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { fetchCashHistory } from "@/lib/cash-queries";

/**
 * The paper cash book (খাতা). Every money-out line of the cash book is copied by hand into a
 * paper book; book_marks keeps, per cash line key (fetchCashHistory's id), whether it was
 * written there and on which page. A line with no tick is "খাতায় তোলা বাকি" — so every new
 * expense, from any form or the AI, waits there until it is ticked.
 */
export type BookMark = { page: number | null; checked: boolean };

/** every tick, page by page so none is lost past the 1000-row API limit */
export async function fetchBookMarks(): Promise<Record<string, BookMark>> {
  const rows = await fetchAllRows<{ entry_key: string; page: number | null; checked: boolean }>(
    () => supabase.from("book_marks").select("entry_key, page, checked").order("entry_key"),
  );
  const m: Record<string, BookMark> = {};
  for (const r of rows) m[r.entry_key] = { page: r.page, checked: r.checked };
  return m;
}

/** money out this season not yet in the paper book: how many and how much (home card) */
export function useUnbooked(enabled = true) {
  return useQuery({
    queryKey: ["book-unbooked"],
    enabled,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const [hist, marks] = await Promise.all([fetchCashHistory(), fetchBookMarks()]);
      const rows = hist.filter((r) => r.dir === "out" && !marks[r.id]?.checked);
      return { n: rows.length, total: rows.reduce((a, r) => a + r.amount, 0), oldest: rows.length ? rows[rows.length - 1].date : null };
    },
  });
}
