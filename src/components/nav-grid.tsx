import { Link } from "@tanstack/react-router";
import { NAV_GROUPS } from "@/components/app-sidebar";
import { usePageAccess } from "@/lib/page-permissions";

/**
 * প্রতিটি বিভাগের আইকনের হালকা রং। টাইল সাদা, শুধু আইকনের পেছনে রং,
 * যাতে বিভাগ চেনা যায় কিন্তু পাতা রঙিন না হয়।
 */
const GROUP_THEME = [
  // ১. বিক্রয় ও চালান: ইটের লাল
  { dot: "bg-primary", chip: "bg-accent text-accent-foreground" },
  // ২. উৎপাদন ও শ্রমিক: অ্যাম্বার
  { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  // ৩. ভাটার হিসাব: সবুজ
  { dot: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  // ৪. রিপোর্ট ও সেটিংস: নীল-ধূসর
  { dot: "bg-slate-500", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
];

/** মোবাইল/ট্যাবলেট: সব পাতার মেনু */
export function NavGrid() {
  const { can, isAdmin } = usePageAccess();

  return (
    <div className="space-y-5 pb-4 lg:hidden">
      {NAV_GROUPS.map((g, idx) => {
        const items = g.items.filter((i) => i.url !== "/" && (i.adminOnly ? isAdmin : can(i.url)));
        if (!items.length) return null;
        const theme = GROUP_THEME[Math.min(idx, GROUP_THEME.length - 1)];

        return (
          <div key={g.label} className="space-y-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${theme.dot}`} aria-hidden="true" />
              <span className="text-[13px] font-bold text-foreground">{g.label}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((it) => (
                <Link
                  key={it.url}
                  to={it.url}
                  className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-2.5 text-center transition active:scale-95"
                >
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${theme.chip}`}>
                    <it.icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="line-clamp-2 text-[12.5px] font-bold leading-tight text-foreground">{it.title}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
