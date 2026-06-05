import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; action: Pending } | null>(null);

  const q = useQuery({
    queryKey: ["sales", "pending-all"],
    queryFn: async () => {
      const rows = await fetchSales({ limit: 500 });
      return rows.filter((r) => r.status === "pending");
    },
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && !allChecked;

  if (me && me.role !== "admin") {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">এই পৃষ্ঠা শুধুমাত্র অ্যাডমিনদের জন্য।</CardContent></Card>;
  }

  function toggleAll(v: boolean) {
    setSelected(v ? new Set(rows.map((r) => r.id)) : new Set());
  }
  function toggleOne(id: string, v: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function performAction(ids: string[], action: Pending) {
    if (!me || ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("sales_entries").update({
      status: action,
      approved_by: me.user.id,
      approved_at: new Date().toISOString(),
    }).in("id", ids);
    setBusy(false);
    setConfirm(null);
    if (error) { toast.error(error.message); return; }
    toast.success(
      action === "approved"
        ? `${bn(ids.length)} টি এন্ট্রি অনুমোদিত হয়েছে`
        : `${bn(ids.length)} টি এন্ট্রি প্রত্যাখ্যাত হয়েছে`,
    );
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">অনুমোদন হাব</h2>
        <p className="text-sm text-muted-foreground">অপেক্ষমাণ এন্ট্রি অনুমোদন বা প্রত্যাখ্যান করুন</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">অপেক্ষমাণ এন্ট্রি</CardTitle>
            <Badge variant="outline">{bn(rows.length)} টি</Badge>
            {selected.size > 0 && <Badge>{bn(selected.size)} নির্বাচিত</Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" disabled={selected.size === 0 || busy}
              onClick={() => setConfirm({ ids: Array.from(selected), action: "approved" })}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve Selected
            </Button>
            <Button size="sm" variant="destructive" disabled={selected.size === 0 || busy}
              onClick={() => setConfirm({ ids: Array.from(selected), action: "rejected" })}>
              <XCircle className="mr-2 h-4 w-4" /> Reject Selected
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      aria-label="সব নির্বাচন"
                    />
                  </TableHead>
                  <TableHead>চালান #</TableHead>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>গ্রাহক</TableHead>
                  <TableHead>ইটের ধরন</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead className="text-right">টাকা</TableHead>
                  <TableHead>তৈরি করেছেন</TableHead>
                  <TableHead className="text-right">অ্যাকশন</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">কোনো অপেক্ষমাণ এন্ট্রি নেই 🎉</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={(v) => toggleOne(r.id, !!v)}
                          aria-label="নির্বাচন"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.challan_no}</TableCell>
                      <TableCell className="text-xs">{bnDate(r.sale_date)}</TableCell>
                      <TableCell className="font-medium">{r.customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(r.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(r.total_amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.manager_name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-success border-success/40 hover:bg-success/10"
                            disabled={busy}
                            onClick={() => setConfirm({ ids: [r.id], action: "approved" })}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10"
                            disabled={busy}
                            onClick={() => setConfirm({ ids: [r.id], action: "rejected" })}>
                            <XCircle className="h-3.5 w-3.5" />
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

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "approved" ? "অনুমোদন নিশ্চিত করুন" : "প্রত্যাখ্যান নিশ্চিত করুন"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? `${bn(confirm.ids.length)} টি এন্ট্রি ${confirm.action === "approved" ? "অনুমোদিত" : "প্রত্যাখ্যাত"} হবে। এই কাজটি স্থায়ী।` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirm) performAction(confirm.ids, confirm.action); }}
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
