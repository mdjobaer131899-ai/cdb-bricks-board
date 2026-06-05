import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CDB Bricks — Sales Management" },
      { name: "description", content: "CDB Bricks Sales Management System — চালান, বিক্রয় ও গ্রাহক ব্যবস্থাপনা।" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <div className="hidden md:block">
            <AppSidebar />
          </div>
          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <AppHeader />
            <main className="flex-1 p-3 pb-20 md:p-6 md:pb-6">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <MobileBottomNav />
        <Toaster />
      </SidebarProvider>
    </QueryClientProvider>
  );
}
