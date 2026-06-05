import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, Users, ClipboardCheck, BarChart3, Settings, Factory } from "lucide-react";
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

const items = [
  { title: "ড্যাশবোর্ড", url: "/", icon: LayoutDashboard },
  { title: "চালান এন্ট্রি", url: "/challans", icon: FileText },
  { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck },
  { title: "গ্রাহক", url: "/customers", icon: Users },
  { title: "রিপোর্ট", url: "/reports", icon: BarChart3 },
  { title: "সেটিংস", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
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
