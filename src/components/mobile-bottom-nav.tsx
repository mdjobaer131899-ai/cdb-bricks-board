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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <div className={cn("grid", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((it) => {
          const active = path === it.url;
          return (
            <Link
              key={it.url}
              to={it.url}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[10px] transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <it.icon className={cn("h-5 w-5", active && "scale-110")} />
              <span>{it.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
