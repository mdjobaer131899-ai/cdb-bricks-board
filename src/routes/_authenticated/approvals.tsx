import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchSales } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "অনুমোদন — CDB Bricks" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data: me } = useCurrentUser();

  const q = useQuery({
    queryKey: ["sales", "pending-all"],
    queryFn: async () => {
      const rows = await fetchSales({ limit: 500 });
      return rows.filter((r) => r.status === "pending");
    },
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  if (me && me.role !== "admin") {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">এই পৃষ্ঠা শুধুমাত্র অ্যাডমিনদের জন্য।</CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">অনুমোদন হাব</h2>
        <p className="text-sm text-muted-foreground">গ্রাহকের নামে ক্লিক করে এন্ট্রি খুলুন এবং টাকার পরিমান বসিয়ে অনুমোদন করুন</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">অপেক্ষমাণ এন্ট্রি</CardTitle>
            <Badge variant="outline">{bn(rows.length)} টি</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>চালান #</TableHead>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>গ্রাহক</TableHead>
                  <TableHead>ইটের ধরন</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead>তৈরি করেছেন</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">কোনো অপেক্ষমাণ এন্ট্রি নেই 🎉</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-mono text-xs">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block">
                          {r.challan_no}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block">
                          {bnDate(r.sale_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block text-primary underline-offset-2 hover:underline">
                          {r.customer?.name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block">
                          {r.brick_type?.name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block">
                          {bn(r.quantity)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block">
                          {r.manager_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to="/entries/$id/edit" params={{ id: r.id }} className="block text-muted-foreground">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
