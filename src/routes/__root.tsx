import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@300;400;500;600;700;800&family=Hind+Siliguri:wght@300;400;500;600;700&display=swap" },
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
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
