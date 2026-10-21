import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { KeyboardAware } from "@/components/keyboard-aware";
import { supabase } from "@/integrations/supabase/client";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: "CDB Bricks — Sales Management" },
      { name: "description", content: "CDB Bricks Sales Management System — চালান, বিক্রয় ও গ্রাহক ব্যবস্থাপনা।" },
      { property: "og:title", content: "CDB Bricks — Sales Management" },
      { name: "twitter:title", content: "CDB Bricks — Sales Management" },
      { property: "og:description", content: "CDB Bricks Sales Management System — চালান, বিক্রয় ও গ্রাহক ব্যবস্থাপনা।" },
      { name: "twitter:description", content: "CDB Bricks Sales Management System — চালান, বিক্রয় ও গ্রাহক ব্যবস্থাপনা।" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/80d87ca8-ec6e-4f64-a9db-c80ca15bde03/id-preview-78885079--57bdcb50-1fe5-4e30-8035-0bce45d3b6ee.lovable.app-1780640857850.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/80d87ca8-ec6e-4f64-a9db-c80ca15bde03/id-preview-78885079--57bdcb50-1fe5-4e30-8035-0bce45d3b6ee.lovable.app-1780640857850.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      // installable app (Add to home screen / Install)
      { name: "theme-color", content: "#a63a1c" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "CDB Bricks" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48.png" },
      { rel: "icon", type: "image/svg+xml", href: "/cdb-logo.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700;800&family=Anek+Bangla:wght@500;600;700;800&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">৪০৪ — পেজ পাওয়া যায়নি</h1>
        <p className="mt-2 text-sm text-muted-foreground">অনুরোধ করা পৃষ্ঠাটি বিদ্যমান নেই।</p>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AuthSync() {
  const router = useRouter();
  const qc = useQueryClient();
  const href = useRouterState({ select: (state) => state.location.href });
  const [userId, setUserId] = useState<string | null>(null);
  const restoredUserId = useRef<string | null>(null);
  const knownUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user.id ?? null;
      setUserId(nextUserId);

      if (event === "SIGNED_OUT" && nextUserId === null) {
        restoredUserId.current = null;
      }

      // ব্রাউজারে ফিরে আসলে Supabase আবার "SIGNED_IN" পাঠায় — একই ইউজার হলে
      // কিছুই নতুন করে লোড করা হয় না, তাই পাতা যেমন ছিল তেমনই থাকে।
      const firstTime = knownUserId.current === undefined;
      const changed = !firstTime && knownUserId.current !== nextUserId;
      knownUserId.current = nextUserId;
      if (firstTime || !changed) {
        if (event !== "USER_UPDATED") return;
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);

  useEffect(() => {
    if (!userId || href === "/auth") return;

    const storageKey = `cdb:last-route:${userId}`;
    const navigationEntry = performance.getEntriesByType("navigation")[0];
    const isBackForwardNavigation =
      navigationEntry instanceof PerformanceNavigationTiming &&
      navigationEntry.type === "back_forward";

    if (restoredUserId.current !== userId) {
      restoredUserId.current = userId;

      if (href === "/") {
        let savedHref: string | null = null;
        try {
          savedHref = localStorage.getItem(storageKey);
        } catch (error) {
          console.error("[route-resume] Unable to read the saved route:", error);
        }
        if (savedHref && savedHref.startsWith("/") && !savedHref.startsWith("//")) {
          const savedUrl = new URL(savedHref, window.location.origin);
          if (
            !isBackForwardNavigation &&
            savedUrl.origin === window.location.origin &&
            savedUrl.pathname !== "/" &&
            savedUrl.pathname !== "/auth" &&
            !savedUrl.pathname.startsWith("/api/")
          ) {
            router.navigate({
              href: savedUrl.pathname + savedUrl.search + savedUrl.hash,
              replace: true,
            });
            return;
          }
        }
      }
    }

    try {
      localStorage.setItem(storageKey, href);
    } catch (error) {
      console.error("[route-resume] Unable to save the current route:", error);
    }
  }, [href, router, userId]);

  return null;
}

/** registers public/sw.js on every visit, so the phone can install the app */
function InstallableApp() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* not critical */ });
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <InstallableApp />
      <AuthSync />
      <KeyboardAware />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
