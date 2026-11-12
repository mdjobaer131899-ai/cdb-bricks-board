/**
 * Names (or ids) the user picked recently in a money form, kept on this device only
 * (localStorage), so the next entry for the same person is one tap. A convenience:
 * when storage is blocked or empty the forms work exactly as before.
 */
const MAX = 6;
const key = (scope: string) => `cdb-recent:${scope}`;

export function readRecent(scope: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key(scope)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(scope: string, value: string) {
  const v = value.trim();
  if (!v) return;
  try {
    const next = [v, ...readRecent(scope).filter((x) => x !== v)].slice(0, MAX);
    localStorage.setItem(key(scope), JSON.stringify(next));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}
