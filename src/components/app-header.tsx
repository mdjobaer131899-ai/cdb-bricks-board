import { Moon, Sun, LogOut, ShieldCheck, UserCog, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/lib/use-current-user";
import { useTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlobalSearch } from "@/components/global-search";

export function AppHeader() {
  const { data, loading } = useCurrentUser();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("লগ আউট সফল");
    navigate({ to: "/auth", replace: true });
  }

  const isAdmin = data?.role === "admin";
  const name = data?.fullName || "";
  const initial = (name.trim().charAt(0) || "U").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="hidden md:block">
        <SidebarTrigger />
      </div>
      <div className="ml-1 hidden sm:block">
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <>
            <div className="text-sm font-semibold leading-tight md:text-base">
              স্বাগতম, {name.split(" ")[0] || "ব্যবহারকারী"}
            </div>
            <p className="text-[11px] text-muted-foreground">আজ: {new Date().toLocaleDateString("bn-BD")}</p>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Badge
            variant="outline"
            className={isAdmin ? "border-primary/40 bg-primary/10 text-primary" : "border-info/40 bg-info/10 text-info"}
          >
            {isAdmin ? <ShieldCheck className="mr-1 h-3 w-3" /> : <UserCog className="mr-1 h-3 w-3" />}
            {isAdmin ? "অ্যাডমিন" : "ম্যানেজার"}
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="theme toggle">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info text-xs font-bold text-primary-foreground">
                {initial}
              </div>
              <span className="hidden text-sm font-medium md:inline">{name || "—"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{data?.user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> লগ আউট
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
