/**
 * Every place in the app a user can ask to go to, by voice or by typing ("সরদার পৃষ্ঠায় যাও",
 * "ভেকুর খাতা খোলো"): the menu pages (NAV_GROUPS in components/app-sidebar.tsx) and the places
 * inside them that have their own address (the veku folder, the loans tab, the expense ledger…).
 * `perm` is the page key the permission check uses (page-permissions.ts). Used by the assistant
 * (gemini.ts) and the search bar on every page (components/ask-bar.tsx).
 */
export type PageLink = {
  key: string;
  title: string;
  to: string;
  search?: Record<string, string>;
  /** words people use for the place, most specific first */
  words: string[];
  perm: string;
  adminOnly?: boolean;
};

export const PAGE_LINKS: PageLink[] = [
  { key: "home", title: "হোম", to: "/", perm: "/", words: ["হোম পেজ", "হোম", "ড্যাশবোর্ড", "প্রথম পাতা", "মূল পাতা", "home", "dashboard"] },
  { key: "new-challan", title: "নতুন চালান", to: "/entries/new", perm: "/entries/new", words: ["নতুন চালান", "চালান লিখ", "চালান কাট", "নতুন বিক্রি"] },
  { key: "challans", title: "চালান তালিকা", to: "/challans", perm: "/challans", words: ["চালান তালিকা", "চালানের তালিকা", "সব চালান", "চালান", "challan"] },
  { key: "approvals", title: "অনুমোদন", to: "/approvals", perm: "/approvals", adminOnly: true, words: ["অনুমোদন", "অ্যাপ্রুভ", "এপ্রুভ", "approval"] },
  { key: "customers", title: "গ্রাহক", to: "/customers", perm: "/customers", words: ["গ্রাহক", "কাস্টমার", "ক্রেতা", "customer"] },
  { key: "advance", title: "অগ্রিম বিক্রি", to: "/advance-sales", perm: "/advance-sales", words: ["অগ্রিম বিক্রি", "ঠিক দামে বুকিং", "বুকিং", "অগ্রিম", "advance", "booking"] },
  { key: "kacha", title: "কাঁচা ইট (মিল)", to: "/production-steps/kacha", perm: "/production-steps/kacha", words: ["পটের হিসাব", "কাঁচা ইট", "কাচা ইট", "কাঁচা", "পটের", "মিলের", "মিল", "উৎপাদন", "production"] },
  { key: "load", title: "ভাটায় ঢোকানো", to: "/production-steps/load", perm: "/production-steps/load", words: ["ভাটায় ঢোকানো", "ঢোকানো", "লোড", "load"] },
  { key: "unload", title: "বের করা", to: "/production-steps/unload", perm: "/production-steps/unload", words: ["পাকা ইট বের", "বের করা", "আনলোড", "unload"] },
  { key: "sardars", title: "সরদার খাতা", to: "/sardars", perm: "/sardars", words: ["সরদার খাতা", "সর্দার খাতা", "সরদার", "সর্দার", "দাদন", "sardar"] },
  { key: "daily", title: "ডেলি শ্রমিক", to: "/daily-workers", perm: "/daily-workers", words: ["ডেলি শ্রমিক", "ডেইলি শ্রমিক", "দৈনিক শ্রমিক", "ডেলি", "ডেইলি", "শ্রমিক", "হাজিরা", "লেবার", "daily"] },
  { key: "salaries", title: "মেস্তুরি ও ম্যানেজার বেতন", to: "/salaries", perm: "/salaries", words: ["মেস্তুরি", "মিস্ত্রি", "ম্যানেজার", "স্টাফ", "বেতন", "salary", "staff"] },
  { key: "weather", title: "আবহাওয়া ও সতর্কতা", to: "/weather", perm: "/weather", adminOnly: true, words: ["আবহাওয়া", "আবহাওয়ার", "বৃষ্টি", "weather"] },
  { key: "ledger", title: "খরচের খাতা (খাত ও নাম)", to: "/cash-book", search: { view: "heads" }, perm: "/cash-book", words: ["খরচের খাতা", "খাত ও নাম", "খাত অনুযায়ী", "লেজার", "ledger"] },
  { key: "collections", title: "ইট বিক্রির টাকা", to: "/cash-book", search: { head: "sale" }, perm: "/cash-book", words: ["কালেকশন", "ইট বিক্রির টাকা", "জমার তালিকা", "collection"] },
  { key: "book", title: "কাগজের খাতায় তোলা বাকি", to: "/cash-book", search: { book: "1" }, perm: "/cash-book", words: ["খাতায় তোলা", "কাগজের খাতা", "খাতায় তুলব"] },
  { key: "cash", title: "ক্যাশ বই", to: "/cash-book", perm: "/cash-book", words: ["ক্যাশ বই", "ক্যাশবই", "ক্যাশ বুক", "দিন বন্ধ", "হাতে নগদ", "ক্যাশ", "লেনদেন", "cash"] },
  { key: "dues", title: "পাওনা-দেনা", to: "/dues", perm: "/dues", words: ["পাওনা-দেনা", "পাওনা দেনা", "পাওনাদেনা", "বকেয়ার তালিকা", "পাওনা", "দেনা", "dues"] },
  { key: "reports", title: "রিপোর্ট", to: "/income-expense", search: { tab: "reports" }, perm: "/income-expense", words: ["রিপোর্ট", "প্রতিবেদন", "report"] },
  { key: "pl", title: "লাভ-ক্ষতি", to: "/income-expense", perm: "/income-expense", words: ["লাভ-ক্ষতি", "লাভ ক্ষতি", "লাভক্ষতি", "আয়-ব্যয়", "আয় ব্যয়", "লাভ", "profit"] },
  { key: "veku", title: "ভেকুর খাতা", to: "/purchases", search: { f: "veku" }, perm: "/purchases", words: ["ভেকুর খাতা", "ভেকু", "এক্সকাভেটর", "veku"] },
  { key: "land", title: "জমি ভাড়া", to: "/purchases", search: { f: "land" }, perm: "/purchases", words: ["জমি ভাড়া", "জমির ভাড়া"] },
  { key: "vehicle", title: "গাড়ি ভাড়া", to: "/purchases", search: { f: "vehicle" }, perm: "/purchases", words: ["গাড়ি ভাড়া", "গাড়ির ভাড়া", "ট্রাক্টর", "ট্রিপ"] },
  { key: "clean", title: "পরিচ্ছন্ন কর্মী", to: "/purchases", search: { f: "clean" }, perm: "/purchases", words: ["পরিচ্ছন্ন কর্মী", "পরিচ্ছন্ন", "ঝাড়ুদার", "সুইপার"] },
  { key: "purchases", title: "মালামাল ক্রয়", to: "/purchases", perm: "/purchases", words: ["মালামাল ক্রয়", "মালামাল", "কেনাকাটা", "ক্রয়", "কাঁচামাল", "যন্ত্রাংশ", "purchase"] },
  { key: "suppliers", title: "সাপ্লায়ার", to: "/suppliers", perm: "/suppliers", words: ["সাপ্লায়ার", "সাপ্লাইয়ার", "বিক্রেতা", "supplier"] },
  { key: "loans", title: "ঋণ", to: "/owners", search: { tab: "loans" }, perm: "/owners", words: ["ঋণের", "ঋণ", "লোন", "ধার", "loan"] },
  { key: "owners", title: "মালিক ও ঋণ", to: "/owners", perm: "/owners", words: ["মালিক", "বিনিয়োগ", "উত্তোলন", "owner"] },
  { key: "opening", title: "পূর্বের বকেয়া ও জের", to: "/opening-balances", perm: "/opening-balances", words: ["পূর্বের বকেয়া", "গত বছরের", "পুরোনো বকেয়া", "পুরনো বকেয়া", "জের", "opening"] },
  { key: "seasons", title: "মৌসুম", to: "/seasons", perm: "/seasons", words: ["মৌসুম", "সিজন", "season"] },
  { key: "users", title: "ইউজার ও অনুমতি", to: "/users", perm: "/users", adminOnly: true, words: ["ইউজার", "ব্যবহারকারী", "অনুমতি", "user"] },
  { key: "settings", title: "সেটিংস", to: "/preferences", perm: "/preferences", words: ["সেটিংস", "সেটিং", "ইটের দাম", "ব্যাকআপ", "রুটিন", "settings"] },
];

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[।,.!?;:'"“”‘’()\-–—]/g, " ").replace(/\s+/g, " ").trim();

const NAV_VERBS = ["যাও", "যান", "যাব", "খোলো", "খোল", "খুলুন", "খুলো", "খুলে দাও", "খুলে দিন", "নিয়ে যাও", "নিয়ে চলো", "নিয়ে চল", "চলো", "ওপেন", "open", "go to"];
const PAGE_WORDS = ["পৃষ্ঠা", "পৃষ্টা", "পাতা", "পেজ", "পেইজ", "page"];

/** the places whose words appear in the text, best (longest word) first */
export function matchPages(text: string): Array<{ page: PageLink; score: number }> {
  const t = norm(text);
  if (!t) return [];
  const out: Array<{ page: PageLink; score: number }> = [];
  for (const p of PAGE_LINKS) {
    let best = 0;
    for (const w of p.words) {
      const n = norm(w);
      if (n && t.includes(n)) best = Math.max(best, n.length);
      // the title typed in part ("সরদ", "ক্যাশ ব")
      else if (t.length >= 2 && norm(p.title).startsWith(t)) best = Math.max(best, t.length);
    }
    if (best) out.push({ page: p, score: best });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * "সরদার পৃষ্ঠায় যাও", "ভেকুর খাতা খোলো", "ক্যাশ বই" (just a place name): the page to open, or
 * null when the words ask for something else (an entry or a question).
 */
export function navIntent(text: string): PageLink | null {
  const t = norm(text);
  if (!t) return null;
  const words = t.split(" ");
  const verb = NAV_VERBS.some((v) => t.includes(norm(v)));
  const pageWord = PAGE_WORDS.some((v) => t.includes(v));
  // money or a count in the words means an entry, not a page ("২৮ নম্বর পাতায় তুলেছি")
  const hasNumber = /[0-9০-৯]/.test(t);
  if (hasNumber) return null;
  if (!verb && !(pageWord && words.length <= 6)) return null;
  const hit = matchPages(t)[0];
  return hit ? hit.page : null;
}

export const pageByKey = (key: string) => PAGE_LINKS.find((p) => p.key === key) ?? null;
