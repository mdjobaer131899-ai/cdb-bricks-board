import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, FilePlus2, Users, ClipboardCheck, BarChart3, Settings, UserCog, Wallet, Boxes, Users2, Building2, CalendarRange, HandCoins, History, ArrowDownToLine, ArrowUpFromLine, CalendarCheck, BadgeDollarSign, Receipt, ShoppingCart, Crown, Landmark, Scale, PackageCheck } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCurrentUser } from "@/lib/use-current-user";
import { usePageAccess } from "@/lib/page-permissions";
import { BrandLogo } from "@/components/brand-logo";

export type NavItem = { title: string; url: string; icon: any; adminOnly?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "বিক্রয়",
    items: [
      { title: "ড্যাশবোর্ড", url: "/", icon: LayoutDashboard },
      { title: "নতুন চালান", url: "/entries/new", icon: FilePlus2 },
      { title: "চালান তালিকা", url: "/challans", icon: FileText },
      { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck },
      { title: "গ্রাহক", url: "/customers", icon: Users },
      { title: "কালেকশন", url: "/collections", icon: Wallet },
      { title: "অগ্রিম ইট বিক্রয়", url: "/advance-sales", icon: PackageCheck },
    ],
  },
  {
    label: "উৎপাদন ও শ্রমিক",
    items: [
      { title: "কাঁচা ইট (মিল)", url: "/production-steps/kacha", icon: Boxes },
      { title: "ভাটায় ঢোকানো", url: "/production-steps/load", icon: ArrowDownToLine },
      { title: "বের করা", url: "/production-steps/unload", icon: ArrowUpFromLine },
      { title: "সরদার", url: "/sardars", icon: Users2 },
      { title: "সরদার হিসাব", url: "/sardar-ledger", icon: HandCoins },
      { title: "ডেলি শ্রমিক", url: "/daily-workers", icon: CalendarCheck },
      { title: "মেস্তুরি ও ম্যানেজার বেতন", url: "/salaries", icon: BadgeDollarSign },
    ],
  },
  {
    label: "হিসাব",
    items: [
      { title: "দৈনিক আয়-ব্যয়", url: "/cash-book", icon: Receipt },
      { title: "মালামাল ক্রয় ও বাকি", url: "/purchases", icon: ShoppingCart },
      { title: "সরবরাহকারী", url: "/suppliers", icon: Building2 },
      { title: "মালিকের বিনিয়োগ", url: "/owners", icon: Crown },
      { title: "ঋণ দেওয়া-নেওয়া", url: "/loans", icon: Landmark },
      { title: "পূর্বের বকেয়া", url: "/opening-balances", icon: History },
      { title: "মোট আয়-ব্যয়", url: "/income-expense", icon: Scale },
    ],
  },
  {
    label: "রিপোর্ট ও সেটিংস",
    items: [
      { title: "রিপোর্ট", url: "/reports", icon: BarChart3 },
      { title: "মৌসুম", url: "/seasons", icon: CalendarRange },
      { title: "ইউজার ও অনুমতি", url: "/users", icon: UserCog, adminOnly: true },
      { title: "সেটিংস", url: "/settings", icon: Settings, adminOnly: true },
    ],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useCurrentUser();
  const { can, isAdmin } = usePageAccess();
  const role = data?.role;

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
        {!role ? (
          <div className="p-3 text-xs text-sidebar-foreground/60 text-center group-data-[collapsible=icon]:hidden">ভূমিকা অপেক্ষমাণ</div>
        ) : (
          NAV_GROUPS.map((g) => {
            const items = g.items.filter((i) => (i.adminOnly ? isAdmin : can(i.url)));
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={g.label}>
                <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((it) => (
                      <SidebarMenuItem key={it.url}>
                        <SidebarMenuButton asChild isActive={path === it.url} tooltip={it.title}>
                          <Link to={it.url}>
                            <it.icon className="h-4 w-4" />
                            <span>{it.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-[10px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">© {new Date().getFullYear()} CDB Bricks Ltd.</div>
      </SidebarFooter>
    </Sidebar>
  );
}
