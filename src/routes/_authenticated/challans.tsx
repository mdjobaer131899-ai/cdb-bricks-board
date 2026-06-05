import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { fetchSales, type SaleRow } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/challans")({
  head: () => ({ meta: [{ title: "চালান এন্ট্রি — CDB Bricks" }] }),
  component: ChallansPage,
});

function ChallansPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<SaleRow | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["sales", "challans", me?.user.id, me?.role],
    enabled: !!me,
    queryFn: () => fetchSales(me!.role === "admin" ? { limit: 50 } : { createdBy: me!.user.id, limit: 50 }),
  });

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    const { error } = await supabase.from("sales_entries").delete().eq("id", pendingDelete.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`চালান ${pendingDelete.challan_no} মুছে ফেলা হয়েছে`);
    setPendingDelete(null);
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

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
      <RecentSalesTable
        entries={q.data ?? []}
        loading={q.isLoading}
        title="সাম্প্রতিক চালান"
        subtitle="শেষ ৫০টি"
        limit={50}
        currentUserId={me?.user.id}
        isAdmin={me?.role === "admin"}
        onDelete={setPendingDelete}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>চালান মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              চালান নং <span className="font-semibold">{pendingDelete?.challan_no}</span> স্থায়ীভাবে মুছে যাবে। এটি পুনরুদ্ধার করা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              মুছে ফেলুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
