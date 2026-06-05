import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-store";
import { AdminDashboard } from "@/components/admin-dashboard";
import { ManagerDashboard } from "@/components/manager-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ড্যাশবোর্ড — CDB Bricks" },
      { name: "description", content: "CDB Bricks বিক্রয় ব্যবস্থাপনা ড্যাশবোর্ড।" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready } = useAuth();
  if (!ready) {
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
  return user.role === "admin" ? <AdminDashboard /> : <ManagerDashboard />;
}
