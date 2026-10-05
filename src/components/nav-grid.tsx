import { Link } from "@tanstack/react-router";
import { NAV_GROUPS } from "@/components/app-sidebar";
import { usePageAccess } from "@/lib/page-permissions";

/**
 * প্রতিটি সেকশনের জন্য আলাদা ইন্ডাস্ট্রিয়াল কালার প্যালেট
 */
function getGroupTheme(idx: number) {
  if (idx === 0) {
    // ১. বিক্রয় ও চালান (Terracotta Red / Orange)
    return {
      bar: "bg-orange-600",
      badge: "text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-500/20",
      cardBorder: "border-b-[3px] border-b-orange-600/80 hover:border-orange-600",
      iconBox: "bg-gradient-to-br from-orange-600 to-red-700 text-white shadow-sm shadow-orange-600/30",
    };
  }
  if (idx === 1) {
    // ২. উৎপাদন ও শ্রমিক (Industrial Amber / Slate)
    return {
      bar: "bg-amber-600",
      badge: "text-amber-800 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
      cardBorder: "border-b-[3px] border-b-amber-500/80 hover:border-amber-500",
      iconBox: "bg-gradient-to-br from-slate-800 to-slate-900 text-amber-400 border border-amber-500/30 shadow-sm",
    };
  }
  if (idx === 2) {
    // ৩. ভাটার হিসাব (Commercial Emerald / Accounting)
    return {
      bar: "bg-emerald-600",
      badge: "text-emerald-800 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      cardBorder: "border-b-[3px] border-b-emerald-600/80 hover:border-emerald-600",
      iconBox: "bg-gradient-to-br from-emerald-600 to-teal-800 text-white shadow-sm shadow-emerald-600/30",
    };
  }
  // ৪. অন্যান্য / রিপোর্ট ও সেটিংস (Corporate Blue-Slate)
  return {
    bar: "bg-blue-700",
    badge: "text-blue-800 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    cardBorder: "border-b-[3px] border-b-blue-700/80 hover:border-blue-700",
    iconBox: "bg-gradient-to-br from-blue-700 to-slate-900 text-white shadow-sm",
  };
}

/** Mobile/tablet: Industrial ERP Command Grid */
export function NavGrid() {
  const { can, isAdmin } = usePageAccess();

  return (
    <div className="space-y-5 lg:hidden pb-4">
      {NAV_GROUPS.map((g, idx) => {
        const items = g.items.filter((i) => i.url !== "/" && (i.adminOnly ? isAdmin : can(i.url)));
        if (!items.length) return null;

        const theme = getGroupTheme(idx);

        return (
          <div key={g.label} className="space-y-2.5">
            {/* ইন্ডাস্ট্রিয়াল সেকশন হেডার */}
            <div className="flex items-center gap-2 px-1">
              <span className={`h-4 w-1.5 rounded-full ${theme.bar}`} />
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                {g.label}
              </span>
              <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            {/* ৩-কলামের মেটালিক কমার্শিয়াল গ্রিড বক্স */}
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {items.map((it) => (
                <Link
                  key={it.url}
                  to={it.url}
                  className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50/90 dark:from-slate-900 dark:to-slate-950 p-3 text-center shadow-sm transition-all duration-150 active:scale-95 ${theme.cardBorder}`}
                >
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl transition-transform group-hover:scale-105 ${theme.iconBox}`}
                  >
                    <it.icon className="h-5 w-5 stroke-[2.2]" />
                  </span>
                  <span className="text-[11.5px] font-bold leading-tight text-slate-800 dark:text-slate-100 line-clamp-2">
                    {it.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}