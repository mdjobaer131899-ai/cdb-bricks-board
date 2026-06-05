import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, ClipboardCheck, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "হোম", url: "/", icon: LayoutDashboard },
  { title: "চালান", url: "/challans", icon: FileText },
  { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck },
  { title: "গ্রাহক", url: "/customers", icon: Users },
  { title: "রিপোর্ট", url: "/reports", icon: BarChart3 },
];

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
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
