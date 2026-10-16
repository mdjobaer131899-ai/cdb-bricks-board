const PAGE = 1000;

/**
 * Reads every row of a query page by page, so totals are not cut at the
 * Supabase 1000-row API limit. makeQuery must build a fresh, stably ordered
 * query each call (end with .order("id") so pages do not overlap).
 */
export async function fetchAllRows<T = any>(makeQuery: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await makeQuery().range(start, start + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
