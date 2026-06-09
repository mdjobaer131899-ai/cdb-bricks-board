import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, FilePlus2, Users, ClipboardCheck, BarChart3, Settings, Factory, UserCog, ScrollText, Wallet, Boxes, BookOpen, Users2, Truck, Building2, CalendarRange, Package } from "lucide-react";
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
import { BrandLogo } from "@/components/brand-logo";

type Item = { title: string; url: string; icon: any; roles: readonly ("admin" | "manager")[] };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "বিক্রয়",
    items: [
      { title: "ড্যাশবোর্ড", url: "/", icon: LayoutDashboard, roles: ["admin", "manager"] },
      { title: "নতুন এন্ট্রি", url: "/entries/new", icon: FilePlus2, roles: ["admin", "manager"] },
      { title: "চালান তালিকা", url: "/challans", icon: FileText, roles: ["admin", "manager"] },
      { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck, roles: ["admin"] },
      { title: "চুক্তি", url: "/contracts", icon: ScrollText, roles: ["admin"] },
      { title: "কালেকশন", url: "/collections", icon: Wallet, roles: ["admin"] },
      { title: "গ্রাহক", url: "/customers", icon: Users, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "অপারেশন",
    items: [
      { title: "প্রোডাকশন", url: "/production", icon: Package, roles: ["admin"] },
      { title: "স্টক", url: "/inventory", icon: Boxes, roles: ["admin"] },
      { title: "কাঁচামাল", url: "/raw-materials", icon: Boxes, roles: ["admin"] },
      { title: "শ্রমিক", url: "/workers", icon: Users2, roles: ["admin"] },
      { title: "সরবরাহকারী", url: "/suppliers", icon: Building2, roles: ["admin"] },
      { title: "গাড়ি", url: "/vehicles", icon: Truck, roles: ["admin"] },
      { title: "মৌসুম", url: "/seasons", icon: CalendarRange, roles: ["admin"] },
    ],
  },
  {
    label: "হিসাব",
    items: [
      { title: "অ্যাকাউন্টস", url: "/accounts", icon: BookOpen, roles: ["admin"] },
    ],
  },
  {
    label: "রিপোর্ট ও সেটিংস",
    items: [
      { title: "রিপোর্ট", url: "/reports", icon: BarChart3, roles: ["admin", "manager"] },
      { title: "ইউজার", url: "/users", icon: UserCog, roles: ["admin"] },
      { title: "সেটিংস", url: "/settings", icon: Settings, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useCurrentUser();
  const role = data?.role ?? "manager";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <BrandLogo className="h-9 w-9 shrink-0" />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold text-sidebar-foreground">CDB Bricks</span>
            <span className="text-[10px] text-sidebar-foreground/60">কাপাসিয়া, গাজীপুর</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => (i.roles as readonly string[]).includes(role));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
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
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-[10px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          © {new Date().getFullYear()} CDB Bricks Ltd.
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
