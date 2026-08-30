import { Link } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid, Flame, ArrowDownToLine, ArrowUpFromLine, Boxes } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_GROUPS } from "@/components/app-sidebar";
import { useCurrentUser } from "@/lib/use-current-user";

const PRODUCTION_SUB = [
  { title: "কাঁচা ইটের হিসাব", url: "/production-steps/kacha", icon: Boxes },
  { title: "কাঁচা ইট ঢোকানো (লোড)", url: "/production-steps/load", icon: ArrowDownToLine },
  { title: "ইট পোড়ানোর হিসাব", url: "/production-steps/burn", icon: Flame },
  { title: "বের করার হিসাব (পাকা ইট)", url: "/production-steps/unload", icon: ArrowUpFromLine },
] as const;


export function DashboardMenuBar() {
  const { data } = useCurrentUser();
  const role = data?.role ?? "manager";

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-warning/5 p-1.5 shadow-sm">
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <LayoutGrid className="mx-1 h-4 w-4 shrink-0 text-primary" />
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((i) => (i.roles as readonly string[]).includes(role));
          if (items.length === 0) return null;
          return (
            <DropdownMenu key={g.label}>
              <DropdownMenuTrigger asChild>
                <button className="flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-primary/10 hover:text-primary">
                  {g.label}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{g.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {items.map((it) => (
                  <DropdownMenuItem key={it.url} asChild>
                    <Link to={it.url} className="flex cursor-pointer items-center gap-2">
                      <it.icon className="h-4 w-4 text-primary" />
                      <span>{it.title}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                {g.label === "অপারেশন" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">প্রোডাকশন ধাপ</DropdownMenuLabel>
                    {PRODUCTION_SUB.map((p) => (
                      <DropdownMenuItem key={p.title} asChild>
                        <Link to={p.url} className="flex cursor-pointer items-center gap-2">
                          <p.icon className="h-4 w-4 text-warning" />
                          <span>{p.title}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </div>
  );
}
