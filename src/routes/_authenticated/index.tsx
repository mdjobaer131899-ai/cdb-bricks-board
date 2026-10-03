import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/use-current-user";
import { NavGrid } from "@/components/nav-grid";
import { AdminDashboard } from "@/components/admin-dashboard";
import { ManagerDashboard } from "@/components/manager-dashboard";
import { PendingRoleState } from "@/components/pending-role-state";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ড্যাশবোর্ড — CDB Bricks" },
      { name: "description", content: "CDB Bricks-এর বিক্রয় ও চালান ব্যবস্থাপনা ড্যাশবোর্ড। এখান থেকে দৈনিক বিক্রয়, স্টক ও অপেক্ষমাণ অনুমোদনের সারসংক্ষেপ দেখুন।" },
      { property: "og:title", content: "ড্যাশবোর্ড — CDB Bricks" },
      { property: "og:description", content: "CDB Bricks-এর বিক্রয় ও চালান ব্যবস্থাপনা ড্যাশবোর্ড। এখান থেকে দৈনিক বিক্রয়, স্টক ও অপেক্ষমাণ অনুমোদনের সারসংক্ষেপ দেখুন।" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

function Index() {
  const { data, loading, refetch } = useCurrentUser();
  if (loading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }
  if (data.role === "admin") return <div className="space-y-4"><NavGrid /><AdminDashboard /></div>;
  if (data.role === "manager") return <div className="space-y-4"><NavGrid /><ManagerDashboard /></div>;
  return <PendingRoleState onRetry={refetch} />;
}

