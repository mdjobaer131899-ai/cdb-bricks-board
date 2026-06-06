import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchSales } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "অনুমোদন — CDB Bricks" }] }),
  component: ApprovalsPage,
});

type Pending = "approved" | "rejected";

function ApprovalsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ id: string; action: Pending } | null>(null);

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

  function setAmount(id: string, v: string) {
    setAmounts((p) => ({ ...p, [id]: v }));
  }

  async function performAction(id: string, action: Pending) {
    if (!me) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    setBusy(true);
    let error: { message: string } | null = null;
    if (action === "approved") {
      const raw = amounts[id] ?? String(row.total_amount ?? "");
      const amount = Number(raw);
      if (!amount || amount <= 0) {
        setBusy(false);
        setConfirm(null);
        toast.error(`চালান ${row.challan_no}: টাকার পরিমান দিন`);
        return;
      }
      const qty = Number(row.quantity) || 1;
      const res = await supabase.from("sales_entries").update({
        status: "approved",
        approved_by: me.user.id,
        approved_at: new Date().toISOString(),
        unit_price: amount / qty,
        total_amount: amount,
      }).eq("id", id);
      error = res.error;

    } else {
      const res = await supabase.from("sales_entries").update({
        status: "rejected",
        approved_by: me.user.id,
        approved_at: new Date().toISOString(),
      }).eq("id", id);
      error = res.error;
    }
    setBusy(false);
    setConfirm(null);
    if (error) { toast.error(error.message); return; }
    toast.success(action === "approved" ? `চালান ${row.challan_no} অনুমোদিত` : `চালান ${row.challan_no} প্রত্যাখ্যাত`);
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">অনুমোদন হাব</h2>
        <p className="text-sm text-muted-foreground">প্রতিটি এন্ট্রির টাকার পরিমান বসিয়ে অনুমোদন করুন</p>
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
                  <TableHead className="text-right w-36">টাকার পরিমান (৳)</TableHead>
                  <TableHead>তৈরি করেছেন</TableHead>
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
                  ) : rows.map((r) => {
                    const raw = amounts[r.id] ?? (r.total_amount ? String(r.total_amount) : "");
                    const amount = Number(raw) || 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.challan_no}</TableCell>
                        <TableCell className="text-xs">{bnDate(r.sale_date)}</TableCell>
                        <TableCell className="font-medium">
                          <Link
                            to="/entries/$id/edit"
                            params={{ id: r.id }}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {r.customer?.name ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.brick_type?.name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{bn(r.quantity)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-right tabular-nums"
                            value={raw}
                            onChange={(e) => setAmount(r.id, e.target.value)}
                            placeholder="০"
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.manager_name}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-8 text-success border-success/40 hover:bg-success/10"
                              disabled={busy || amount <= 0}
                              onClick={() => setConfirm({ id: r.id, action: "approved" })}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10"
                              disabled={busy}
                              onClick={() => setConfirm({ id: r.id, action: "rejected" })}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "approved" ? "অনুমোদন নিশ্চিত করুন" : "প্রত্যাখ্যান নিশ্চিত করুন"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "approved"
                ? "এই এন্ট্রিটি অনুমোদিত হবে এবং একক মূল্য সংরক্ষিত হবে।"
                : "এই এন্ট্রিটি প্রত্যাখ্যাত হবে।"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirm) performAction(confirm.id, confirm.action); }}
              disabled={busy}
              className={confirm?.action === "rejected" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm?.action === "approved" ? "অনুমোদন করুন" : "প্রত্যাখ্যান করুন"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
