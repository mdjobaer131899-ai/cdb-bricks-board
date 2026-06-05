import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { fetchSales } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/challans")({
  head: () => ({ meta: [{ title: "চালান এন্ট্রি — CDB Bricks" }] }),
  component: ChallansPage,
});

function ChallansPage() {
  const { data: me } = useCurrentUser();
  const q = useQuery({
    queryKey: ["sales", "challans", me?.user.id, me?.role],
    enabled: !!me,
    queryFn: () => fetchSales(me!.role === "admin" ? { limit: 50 } : { createdBy: me!.user.id, limit: 50 }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">চালান এন্ট্রি</h2>
          <p className="text-sm text-muted-foreground">নতুন বিক্রয় এন্ট্রি যোগ করুন ও আপনার সাম্প্রতিক চালান দেখুন</p>
        </div>
        <Button asChild>
          <Link to="/entries/new"><Plus className="mr-2 h-4 w-4" /> নতুন এন্ট্রি</Link>
        </Button>
      </div>
      <RecentSalesTable entries={q.data ?? []} loading={q.isLoading} title="সাম্প্রতিক চালান" subtitle="শেষ ৫০টি" limit={50} />
    </div>
  );
}
