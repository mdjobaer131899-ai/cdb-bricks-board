import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, Home, Plus, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { bn } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { OPEN_AI_CHAT_EVENT } from "@/components/ai-assistant-fab";
import { OPEN_QUICK_ENTRY_EVENT } from "@/components/quick-entry";

/**
 * মোবাইলের নিচের মেনু: হোম · চালান · + নতুন এন্ট্রি (মাঝে, বড়) · AI · সেটিংস
 * "+" যেকোনো পাতা থেকে নতুন এন্ট্রির তালিকা খোলে (quick-entry.tsx)।
 * রিপোর্ট হোমের "সব মেনু"-তে আছে। চালানের কোণায় অনুমোদন বাকি চালানের সংখ্যা ভাসে।
 */
export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useCurrentUser();
  const role = data?.role;
  const isAdmin = role === "admin";

  const pendingQ = useQuery({
    queryKey: ["pending-challans-count"],
    enabled: !!role,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!role) return null;
  const pending = pendingQ.data ?? 0;

  // অ্যাডমিন চালান অনুমোদন দেন, ম্যানেজার চালানের তালিকা দেখেন
  const challanUrl = isAdmin ? "/approvals" : "/challans";
  const left = [
    { title: "হোম", url: "/", icon: Home, badge: 0 },
    { title: "চালান", url: challanUrl, icon: FileCheck2, badge: pending },
  ];
  const right = [
    { title: "সেটিংস", url: "/preferences", icon: Settings, badge: 0 },
  ];

  const isActive = (url: string) => (url === "/" ? path === "/" : path === url || path.startsWith(url + "/"));

  const renderLink = (it: (typeof left)[number]) => {
    const active = isActive(it.url) || (it.title === "চালান" && (path.startsWith("/challans") || path.startsWith("/approvals")));
    return (
      <Link
        key={it.title}
        to={it.url as never}
        className={cn(
          "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] transition-colors",
          active ? "font-bold text-primary" : "font-semibold text-muted-foreground",
        )}
      >
        <span className="relative">
          <it.icon className="h-6 w-6" strokeWidth={active ? 2.3 : 2} aria-hidden="true" />
          {it.badge > 0 && (
            <span
              className="absolute -right-3 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-bold leading-none text-white"
              aria-label={`${bn(it.badge)}টি চালান অনুমোদন বাকি`}
            >
              {it.badge > 99 ? "৯৯+" : bn(it.badge)}
            </span>
          )}
        </span>
        <span>{it.title}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="প্রধান মেনু"
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 items-end px-1 pb-1.5 pt-1">
        {left.map(renderLink)}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_QUICK_ENTRY_EVENT))}
          aria-label="নতুন এন্ট্রি"
          className="flex flex-col items-center gap-1"
        >
          <span className="-mt-7 grid h-[60px] w-[60px] place-items-center rounded-[20px] border-4 border-background bg-primary text-primary-foreground shadow-lg transition active:scale-95">
            <Plus className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="text-[12px] font-bold text-foreground">নতুন</span>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AI_CHAT_EVENT))}
          aria-label="AI সহকারী খুলুন"
          className="relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-muted-foreground transition-colors"
        >
          <Sparkles className="h-6 w-6 text-orange-500" strokeWidth={2} aria-hidden="true" />
          <span>AI</span>
        </button>
        {right.map(renderLink)}
      </div>
    </nav>
  );
}
