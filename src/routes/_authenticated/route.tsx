import { createFileRoute, redirect, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
  errorComponent: ({ error }) => {
    const msg = error?.message ?? "";
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
        <p className="text-destructive">ত্রুটি: {error.message}</p>
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

function AuthedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  if (!ready) return null;
  return (
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
    </SidebarProvider>
  );
}
