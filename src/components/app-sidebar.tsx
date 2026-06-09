import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, FilePlus2, Users, ClipboardCheck, BarChart3, Settings, Factory, UserCog, ScrollText, Wallet, Package, Boxes, BookOpen, Users2, Truck, Lock } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCurrentUser } from "@/lib/use-current-user";

const ALL_ITEMS = [
  { title: "ড্যাশবোর্ড", url: "/", icon: LayoutDashboard, roles: ["admin", "manager"] as const },
  { title: "নতুন এন্ট্রি", url: "/entries/new", icon: FilePlus2, roles: ["admin", "manager"] as const },
  { title: "চালান এন্ট্রি", url: "/challans", icon: FileText, roles: ["admin", "manager"] as const },
  { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck, roles: ["admin"] as const },
  { title: "চুক্তি", url: "/contracts", icon: ScrollText, roles: ["admin", "manager"] as const },
  { title: "কালেকশন", url: "/collections", icon: Wallet, roles: ["admin", "manager"] as const },
  { title: "গ্রাহক", url: "/customers", icon: Users, roles: ["admin", "manager"] as const },
  { title: "প্রোডাকশন", url: "/production", icon: Package, roles: ["admin", "manager"] as const },
  { title: "স্টক / ইনভেন্টরি", url: "/inventory", icon: Boxes, roles: ["admin", "manager"] as const },
  { title: "কাঁচামাল", url: "/inventory/raw-materials", icon: Package, roles: ["admin", "manager"] as const },
  { title: "শ্রমিক", url: "/workers", icon: Users2, roles: ["admin", "manager"] as const },
  { title: "গাড়ি", url: "/vehicles", icon: Truck, roles: ["admin", "manager"] as const },
  { title: "অ্যাকাউন্টস", url: "/accounts", icon: BookOpen, roles: ["admin"] as const },
  { title: "মাসিক ক্লোজিং", url: "/accounts/closing", icon: Lock, roles: ["admin"] as const },
  { title: "রিপোর্ট", url: "/reports", icon: BarChart3, roles: ["admin", "manager"] as const },
  { title: "উৎপাদন খরচ", url: "/reports/production-cost", icon: Factory, roles: ["admin", "manager"] as const },
  { title: "ইউজার", url: "/users", icon: UserCog, roles: ["admin"] as const },
  { title: "সেটিংস", url: "/settings", icon: Settings, roles: ["admin", "manager"] as const },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useCurrentUser();
  const role = data?.role ?? "manager";
  const items = ALL_ITEMS.filter((i) => (i.roles as readonly string[]).includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-elegant">
            <Factory className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold text-sidebar-foreground">CDB Bricks</span>
            <span className="text-[10px] text-sidebar-foreground/60">সেলস ম্যানেজমেন্ট</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>মূল মেনু</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = path === it.url;
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={it.title}>
                      <Link to={it.url}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-[10px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          © {new Date().getFullYear()} CDB Bricks Ltd.
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
