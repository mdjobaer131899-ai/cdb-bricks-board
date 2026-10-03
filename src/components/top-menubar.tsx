import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { NAV_GROUPS } from "@/components/app-sidebar";
import { usePageAccess } from "@/lib/page-permissions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Computer: menu bar across the top with a dropdown per group. */
export function TopMenubar() {
  const { can, isAdmin } = usePageAccess();
  return (
    <nav className="hidden items-center gap-1 border-b bg-card px-4 py-1.5 lg:flex">
      {NAV_GROUPS.map((g) => {
        const items = g.items.filter((i) => (i.adminOnly ? isAdmin : can(i.url)));
        if (!items.length) return null;
        return (
          <DropdownMenu key={g.label}>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted">
              {g.label} <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              {items.map((it) => (
                <DropdownMenuItem key={it.url} asChild>
                  <Link to={it.url} className="flex items-center gap-2"><it.icon className="h-4 w-4" />{it.title}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
