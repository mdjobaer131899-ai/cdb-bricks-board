import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { fetchSales, type SaleRow } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { isoDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/challans/")({
  head: () => ({
    meta: [
      { title: "চালান — CDB Bricks" },
      { name: "description", content: "তারিখ অনুযায়ী বিক্রয় চালানের তালিকা।" },
    ],
  }),
  component: ChallansPage,
});

function ChallansPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<SaleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(isoDate(new Date()));

  const q = useQuery({
    queryKey: ["sales", "challans-by-date", me?.user.id, me?.role, date],
    enabled: !!me,
    queryFn: () => fetchSales(
      me!.role === "admin"
        ? { from: date, to: date, limit: 200 }
        : { from: date, to: date, createdBy: me!.user.id, limit: 200 }
    ),
  });

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    const { error } = await supabase.from("sales_entries").delete().eq("id", pendingDelete.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`চালান ${pendingDelete.challan_no} মুছে ফেলা হয়েছে`);
    setPendingDelete(null);
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">চালান</h1>
        <p className="text-sm text-muted-foreground">তারিখ অনুযায়ী চালান দেখুন</p>
      </div>

      <Card>
        <CardContent className="flex items-end gap-3 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs">তারিখ</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            মোট: {q.data?.length ?? 0} টি
          </div>
        </CardContent>
      </Card>

      <RecentSalesTable
        entries={q.data ?? []}
        loading={q.isLoading}
        title="চালান তালিকা"
        subtitle={`তারিখ: ${date}`}
        limit={200}
        currentUserId={me?.user.id}
        isAdmin={me?.role === "admin"}
        onDelete={setPendingDelete}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>চালান মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              চালান নং <span className="font-semibold">{pendingDelete?.challan_no}</span> স্থায়ীভাবে মুছে যাবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
