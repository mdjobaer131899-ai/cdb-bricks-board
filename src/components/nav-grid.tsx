import { Link } from "@tanstack/react-router";
import { NAV_GROUPS } from "@/components/app-sidebar";
import { usePageAccess } from "@/lib/page-permissions";

/** Mobile/tablet: big tap-friendly buttons for every page, grouped. */
export function NavGrid() {
  const { can, isAdmin } = usePageAccess();
  return (
    <div className="space-y-3 lg:hidden">
      {NAV_GROUPS.map((g) => {
        const items = g.items.filter((i) => i.url !== "/" && (i.adminOnly ? isAdmin : can(i.url)));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.label}</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((it) => (
                <Link key={it.url} to={it.url} className="flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-3 text-center text-[11px] font-medium leading-tight shadow-sm active:scale-95">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"><it.icon className="h-5 w-5" /></span>
                  {it.title}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
