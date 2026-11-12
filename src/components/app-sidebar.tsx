import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, FilePlus2, Users, ClipboardCheck, BarChart3, Settings, UserCog, Wallet, Boxes, Users2, Building2, CalendarRange, HandCoins, History, ArrowDownToLine, ArrowUpFromLine, CalendarCheck, BadgeDollarSign, Receipt, ShoppingCart, Crown, Landmark, Scale, PackageCheck , CloudSun, FolderOpen } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useCurrentUser } from "@/lib/use-current-user";
import { usePageAccess } from "@/lib/page-permissions";
import { BrandLogo } from "@/components/brand-logo";

export type NavItem = { title: string; url: string; icon: any; adminOnly?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * One menu, each page once. Merged pages live inside another: খরচের খাতা = ক্যাশ বই's
 * "খাত ও নাম অনুযায়ী" view, কালেকশন = ক্যাশ বই on ইট বিক্রির টাকা, ঋণ = a tab of মালিক ও ঋণ,
 * রিপোর্ট = a tab of লাভ-ক্ষতি, সিস্টেম ও ব্যাকআপ = part of সেটিংস. Home sits above the groups.
 */
export const HOME_ITEM: NavItem = { title: "হোম", url: "/", icon: LayoutDashboard };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "বিক্রি",
    items: [
      { title: "নতুন চালান", url: "/entries/new", icon: FilePlus2 },
      { title: "চালান তালিকা", url: "/challans", icon: FileText },
      { title: "অনুমোদন", url: "/approvals", icon: ClipboardCheck, adminOnly: true },
      { title: "গ্রাহক", url: "/customers", icon: Users },
      { title: "অগ্রিম বিক্রি", url: "/advance-sales", icon: PackageCheck },
    ],
  },
  {
    label: "উৎপাদন ও লোকজন",
    items: [
      { title: "কাঁচা ইট (মিল)", url: "/production-steps/kacha", icon: Boxes },
      { title: "ভাটায় ঢোকানো", url: "/production-steps/load", icon: ArrowDownToLine },
      { title: "বের করা", url: "/production-steps/unload", icon: ArrowUpFromLine },
      { title: "সরদার খাতা", url: "/sardars", icon: Users2 },
      { title: "ডেলি শ্রমিক", url: "/daily-workers", icon: CalendarCheck },
      { title: "মেস্তুরি ও ম্যানেজার বেতন", url: "/salaries", icon: BadgeDollarSign },
      { title: "আবহাওয়া ও সতর্কতা", url: "/weather", icon: CloudSun, adminOnly: true },
    ],
  },
  {
    label: "হিসাব",
    items: [
      { title: "ক্যাশ বই", url: "/cash-book", icon: Receipt },
      { title: "পাওনা-দেনা", url: "/dues", icon: HandCoins },
      { title: "লাভ-ক্ষতি ও রিপোর্ট", url: "/income-expense", icon: Scale },
      { title: "মালামাল ক্রয়", url: "/purchases", icon: ShoppingCart },
      { title: "মালিক ও ঋণ", url: "/owners", icon: Crown },
      { title: "পূর্বের বকেয়া ও জের", url: "/opening-balances", icon: History },
    ],
  },
  {
    label: "সেটিংস",
    items: [
      { title: "মৌসুম", url: "/seasons", icon: CalendarRange },
      { title: "ইউজার ও অনুমতি", url: "/users", icon: UserCog, adminOnly: true },
      { title: "সেটিংস", url: "/preferences", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useCurrentUser();
  const { can, isAdmin } = usePageAccess();
  const role = data?.role;
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const closeMenu = () => {
    if (isMobile) setOpenMobile(false);
    else if (typeof window !== "undefined" && window.innerWidth < 1280) setOpen(false);
  };

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
          [{ label: "", items: [HOME_ITEM] } as NavGroup, ...NAV_GROUPS].map((g) => {
            const items = g.items.filter((i) => (i.adminOnly ? isAdmin : i.url === "/preferences" || can(i.url)));
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={g.label || "home"}>
                {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((it) => (
                      <SidebarMenuItem key={it.url}>
                        <SidebarMenuButton asChild isActive={path === it.url} tooltip={it.title}>
                          <Link to={it.url} onClick={closeMenu}>
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
