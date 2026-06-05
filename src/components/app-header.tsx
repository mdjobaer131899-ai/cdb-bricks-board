import { Moon, Sun, LogOut, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-store";
import { useTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { user, logout, switchRole } = useAuth();
  const { theme, toggle } = useTheme();
  const isAdmin = user.role === "admin";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="hidden md:block">
        <SidebarTrigger />
      </div>
      <div className="ml-1 hidden sm:block">
        <h1 className="text-sm font-semibold leading-tight md:text-base">স্বাগতম, {user.name.split(" ")[0]}</h1>
        <p className="text-[11px] text-muted-foreground">আজকের তারিখ: {new Date().toLocaleDateString("bn-BD")}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            isAdmin
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-info/40 bg-info/10 text-info"
          }
        >
          {isAdmin ? <ShieldCheck className="mr-1 h-3 w-3" /> : <UserCog className="mr-1 h-3 w-3" />}
          {isAdmin ? "অ্যাডমিন" : "ম্যানেজার"}
        </Badge>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="theme toggle">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info text-xs font-bold text-primary-foreground">
                {user.name.charAt(0)}
              </div>
              <span className="hidden text-sm font-medium md:inline">{user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => switchRole("admin")}>অ্যাডমিন হিসেবে দেখুন</DropdownMenuItem>
            <DropdownMenuItem onClick={() => switchRole("manager")}>ম্যানেজার হিসেবে দেখুন</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> লগ আউট
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
