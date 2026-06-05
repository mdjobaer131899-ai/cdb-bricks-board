import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fetchSales } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "অনুমোদন — CDB Bricks" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["sales", "pending-all"],
    queryFn: async () => {
      const rows = await fetchSales({ limit: 200 });
      return rows.filter((r) => r.status === "pending");
    },
  });

  if (me && me.role !== "admin") {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">এই পৃষ্ঠা শুধুমাত্র অ্যাডমিনদের জন্য।</CardContent></Card>;
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (!me) return;
    setBusyId(id);
    const { error } = await supabase.from("sales_entries").update({
      status,
      approved_by: me.user.id,
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "অনুমোদিত হয়েছে" : "প্রত্যাখ্যাত হয়েছে");
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

  const rows = q.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">অনুমোদন হাব</h2>
        <p className="text-sm text-muted-foreground">অপেক্ষমাণ এন্ট্রি অনুমোদন বা প্রত্যাখ্যান করুন</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">অপেক্ষমাণ এন্ট্রি</CardTitle>
          <Badge variant="outline">{bn(rows.length)} টি</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>চালান</TableHead>
                  <TableHead>গ্রাহক</TableHead>
                  <TableHead>ইট</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead className="text-right">টাকা</TableHead>
                  <TableHead>ম্যানেজার</TableHead>
                  <TableHead>তারিখ</TableHead>
                  <TableHead className="text-right">অ্যাকশন</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">কোনো অপেক্ষমাণ এন্ট্রি নেই 🎉</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.challan_no}</TableCell>
                      <TableCell className="font-medium">{r.customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(r.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(r.total_amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.manager_name}</TableCell>
                      <TableCell className="text-xs">{bnDate(r.sale_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => decide(r.id, "approved")} disabled={busyId === r.id}>
                            {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 text-success" />}
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => decide(r.id, "rejected")} disabled={busyId === r.id}>
                            <XCircle className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
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
