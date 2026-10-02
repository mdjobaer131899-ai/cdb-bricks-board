import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";

/** অনুমতিযোগ্য সব পাতা — key = URL */
export const PAGES: { key: string; label: string }[] = [
  { key: "/entries/new", label: "নতুন চালান" },
  { key: "/challans", label: "চালান তালিকা" },
  { key: "/approvals", label: "অনুমোদন" },
  { key: "/customers", label: "গ্রাহক" },
  { key: "/collections", label: "কালেকশন" },
  { key: "/advance-sales", label: "অগ্রিম ইট বিক্রয়" },
  { key: "/production-steps/kacha", label: "কাঁচা ইট (মিল)" },
  { key: "/production-steps/load", label: "ভাটায় ঢোকানো" },
  { key: "/production-steps/unload", label: "বের করা" },
  { key: "/sardars", label: "সরদার খাতা" },
  { key: "/daily-workers", label: "ডেলি শ্রমিক" },
  { key: "/salaries", label: "মেস্তুরি ও ম্যানেজার বেতন" },
  { key: "/cash-book", label: "ক্যাশ বই (দৈনিক ড্রয়ার)" },
  { key: "/purchases", label: "মালামাল ক্রয় ও বাকি" },
  { key: "/suppliers", label: "সাপ্লায়ার তালিকা" },
  { key: "/owners", label: "মালিকের বিনিয়োগ" },
  { key: "/loans", label: "ঋণ দেওয়া-নেওয়া" },
  { key: "/opening-balances", label: "পূর্বের বকেয়া ও জের" },
  { key: "/income-expense", label: "লাভ-ক্ষতি ও ক্যাশ সামারি" },
  { key: "/reports", label: "রিপোর্ট" },
  { key: "/seasons", label: "মৌসুম" },
];

/** এডমিন সব পাতা পান; ম্যানেজার শুধু অনুমোদিত পাতা */
export function usePageAccess() {
  const { data: me } = useCurrentUser();
  const q = useQuery({
    queryKey: ["page-perms", me?.user.id],
    enabled: !!me && me.role === "manager",
    queryFn: async () => {
      const { data, error } = await supabase.from("page_permissions").select("page_key").eq("user_id", me!.user.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.page_key));
    },
  });
  const isAdmin = me?.role === "admin";
  const can = (path: string) => {
    if (isAdmin) return true;
    if (path === "/") return true;
    const set = q.data;
    if (!set) return false;
    return [...set].some((k) => path === k || path.startsWith(k + "/"));
  };
  return { can, loading: q.isLoading && me?.role === "manager", isAdmin };
}
