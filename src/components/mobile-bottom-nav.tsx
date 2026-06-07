import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, ClipboardCheck, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/use-current-user";

const ALL = [
  { title: "হোম", url: "/", icon: LayoutDashboard, roles: ["admin", "manager"] as const },
  { title: "চালান", url: "/challans", icon: FileText, roles: ["admin", "manager"] as const },
  { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck, roles: ["admin"] as const },
  { title: "গ্রাহক", url: "/customers", icon: Users, roles: ["admin", "manager"] as const },
  { title: "রিপোর্ট", url: "/reports", icon: BarChart3, roles: ["admin", "manager"] as const },
];

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useCurrentUser();
  const role = data?.role ?? "manager";
  const items = ALL.filter((i) => (i.roles as readonly string[]).includes(role));
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className={cn("grid", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((it) => {
          const active = path === it.url;
          return (
            <Link
              key={it.url}
              to={it.url}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full transition-all",
                  active ? "bg-primary opacity-100" : "opacity-0",
                )}
              />
              <it.icon
                className={cn(
                  "h-[18px] w-[18px] transition-transform",
                  active ? "scale-105" : "group-active:scale-95",
                )}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className={cn("tracking-tight", active ? "font-semibold" : "font-normal")}>
                {it.title}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
