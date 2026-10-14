import { createFileRoute, redirect, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { usePageAccess } from "@/lib/page-permissions";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { TopMenubar } from "@/components/top-menubar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SeasonProvider } from "@/lib/season-context";
import { useCurrentUser } from "@/lib/use-current-user";
import { PendingRoleState } from "@/components/pending-role-state";
import { BrandLogo } from "@/components/brand-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { AiAssistantFab } from "@/components/ai-assistant-fab";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession ফোনে রাখা লগইন পড়ে, নেট লাগে না। আগে getUser ছিল — নেট দুর্বল
    // হলে (যেমন অ্যাপ মিনিমাইজ থেকে ফেরার মুহূর্তে) ভুল করে লগইন পাতায় পাঠিয়ে দিত।
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      throw redirect({ to: "/auth" });
    }
    return { user };
  },
  component: AuthedLayout,
  errorComponent: ({ error }) => {
    const msg = (error as Error)?.message ?? "";
    // Stale build: old HTML references a chunk hash that no longer exists after a redeploy.
    // Auto-reload once to pick up the new bundle.
    if (typeof window !== "undefined" && /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg)) {
      const KEY = "__chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">ত্রুটি: {(error as Error).message}</p>
        <button
          className="mt-3 rounded border px-3 py-1 text-foreground"
          onClick={() => window.location.reload()}
        >
          পুনরায় লোড করুন
        </button>
      </div>
    );
  },
});

function GuardedOutlet() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { can, loading, isAdmin } = usePageAccess();
  if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;
  const adminOnly = path.startsWith("/users") || path.startsWith("/settings");
  // সেটিংস হাব (/preferences) সবার জন্য খোলা: থিম, মৌসুম, লগ আউট সেখানে
  const openToAll = path === "/preferences";
  if (!openToAll && (adminOnly ? !isAdmin : !can(path))) {
    return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">এই পাতা দেখার অনুমতি নেই। এডমিনের সাথে যোগাযোগ করুন।</div>;
  }
  return <Outlet />;
}

function AuthedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const { data: me, loading, refetch } = useCurrentUser();

  useEffect(() => setReady(true), []);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // শুধু প্রথমবার খোলার সময় কঙ্কাল দেখায়; পরে কখনো পুরো পাতা মুছে যায় না
  if (!ready || (loading && !me)) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-background">
        <header className="flex h-14 items-center border-b px-4 md:px-6">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="space-y-4 max-w-5xl mx-auto">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // If user is authenticated but has no valid role assigned in database
  if (me && !me.role) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full flex-col bg-background">
          <AppHeader />
          <main className="flex-1 p-3 pb-6 md:p-6">
            <PendingRoleState onRetry={refetch} />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SeasonProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <div className="hidden md:block lg:hidden">
            <AppSidebar />
          </div>
          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            {/* মোবাইলে উপরের বার নেই: খোঁজা, থিম, লগ আউট সব নিচের "সেটিংস"-এ */}
            <div className="hidden md:block">
              <AppHeader />
            </div>
            <TopMenubar />
            <main className="flex-1 p-3 pb-20 md:p-6 md:pb-6">
              <GuardedOutlet />
            </main>
          </SidebarInset>
        </div>
        <MobileBottomNav />
        <AiAssistantFab />
      </SidebarProvider>
    </SeasonProvider>
  );
}

