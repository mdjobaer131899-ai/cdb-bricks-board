import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { isoDate, bn } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entries/$id/edit")({
  head: () => ({ meta: [{ title: "এন্ট্রি এডিট — CDB Bricks" }] }),
  component: EditEntryPage,
});

const BRICK_ORDER = [
  "১ নং ইট",
  "২ নং ইট",
  "পিকেট",
  "১ নং আদলা",
  "২ নং আদলা",
  "মিক্সার আদলা",
  "অন্যান্য",
];
const ADLA_NAMES = new Set(["১ নং আদলা", "২ নং আদলা", "মিক্সার আদলা"]);
const OTHERS_NAME = "অন্যান্য";

function EditEntryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me, loading: meLoading } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const entryQ = useQuery({
    queryKey: ["sales-entry", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("*, customer:customers(id, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });

  const orderedBricks = useMemo(() => {
    const list = bricksQ.data ?? [];
    return [...list].sort((a, b) => {
      const ia = BRICK_ORDER.indexOf(a.name);
      const ib = BRICK_ORDER.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [bricksQ.data]);

  const [challanNo, setChallanNo] = useState("");
  const [saleDate, setSaleDate] = useState(isoDate(new Date()));
  const [customerName, setCustomerName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [brickTypeId, setBrickTypeId] = useState("");
  const [customBrickName, setCustomBrickName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const e = entryQ.data;
    if (!e || loaded) return;
    setChallanNo(e.challan_no);
    setSaleDate(e.sale_date);
    setCustomerName(e.customer?.name ?? "");
    setDriverName(e.driver_name ?? "");
    setVehicleNumber(e.vehicle_number ?? "");
    setBrickTypeId(e.brick_type_id);
    setCustomBrickName(e.custom_brick_name ?? "");
    setQuantity(String(e.quantity));
    setAmount(String(e.total_amount ?? 0));
    setNotes(e.notes ?? "");
    setLoaded(true);
  }, [entryQ.data, loaded]);

  const entry = entryQ.data;
  const selectedBrick = orderedBricks.find((b) => b.id === brickTypeId);
  const isAdla = selectedBrick ? ADLA_NAMES.has(selectedBrick.name) : false;
  const isOthers = selectedBrick?.name === OTHERS_NAME;
  const quantityLabel = isAdla ? "মোট পরিমাণ (ফুট) / Total Quantity (Feet)" : "মোট ইট (পিস)";

  const canEdit =
    !!entry &&
    (isAdmin || (entry.status === "pending" && entry.created_by === me?.user.id));

  // Admin viewing a pending entry: only "Amount" is editable; other fields locked.
  // After approval, admin can edit everything again.
  const isPending = entry?.status === "pending";
  const lockedForAdminApproval = isAdmin && isPending;
  const fieldsDisabled = !canEdit || lockedForAdminApproval;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!entry || !me) return;
    if (!canEdit) {
      toast.error("এই এন্ট্রি এডিট করা যাবে না");
      return;
    }
    // Pending entry for admin: blocked from save — must approve first.
    if (lockedForAdminApproval) {
      toast.error("পরিবর্তনের জন্য আগে অনুমোদন করুন");
      return;
    }
    if (!challanNo.trim() || !brickTypeId || !quantity) {
      toast.error("সকল প্রয়োজনীয় তথ্য পূরণ করুন");
      return;
    }
    if (!customerName.trim()) {
      toast.error("গ্রাহকের নাম লিখুন");
      return;
    }
    if (isOthers && !customBrickName.trim()) {
      toast.error("ইটের ধরনের নাম লিখুন");
      return;
    }
    setBusy(true);

    if (entry.customer_id) {
      await supabase
        .from("customers")
        .update({ name: customerName.trim() })
        .eq("id", entry.customer_id);
    }

    const qty = Number(quantity) || 1;
    const finalAmount = isAdmin ? (Number(amount) || 0) : Number(entry.total_amount);
    const finalUnit = isAdmin ? finalAmount / qty : Number(entry.unit_price);

    const { error } = await supabase
      .from("sales_entries")
      .update({
        challan_no: challanNo.trim(),
        sale_date: saleDate,
        brick_type_id: brickTypeId,
        custom_brick_name: isOthers ? customBrickName.trim() : null,
        quantity: qty,
        unit_price: finalUnit,
        total_amount: finalAmount,
        driver_name: driverName || null,
        vehicle_number: vehicleNumber || null,
        notes: notes || null,
      })
      .eq("id", entry.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("এন্ট্রি আপডেট হয়েছে");
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["sales-entry", id] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    navigate({ to: "/challans" });
  }


  async function handleApprove() {
    if (!entry || !me || !isAdmin) return;
    const unit = Number(unitPrice) || 0;
    if (unit <= 0) {
      toast.error("একক মূল্য দিন");
      setConfirmApprove(false);
      return;
    }
    setBusy(true);
    // Save edited fields first (customer + entry), then approve.
    if (entry.customer_id) {
      await supabase
        .from("customers")
        .update({ name: customerName.trim() })
        .eq("id", entry.customer_id);
    }
    const qty = Number(quantity) || 0;
    const { error: upErr } = await supabase
      .from("sales_entries")
      .update({
        challan_no: challanNo.trim(),
        sale_date: saleDate,
        brick_type_id: brickTypeId,
        custom_brick_name: isOthers ? customBrickName.trim() : null,
        quantity: qty,
        driver_name: driverName || null,
        vehicle_number: vehicleNumber || null,
        notes: notes || null,
      })
      .eq("id", entry.id);
    if (upErr) { setBusy(false); setConfirmApprove(false); toast.error(upErr.message); return; }

    const { error } = await supabase
      .from("sales_entries")
      .update({
        status: "approved",
        approved_by: me.user.id,
        approved_at: new Date().toISOString(),
        unit_price: unit,
        total_amount: unit * qty,
      })
      .eq("id", entry.id);
    setBusy(false);
    setConfirmApprove(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`চালান ${entry.challan_no} অনুমোদিত`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["sales-entry", id] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    navigate({ to: "/approvals" });
  }

  async function handleDelete() {
    if (!entry) return;
    setBusy(true);
    const { error } = await supabase.from("sales_entries").delete().eq("id", entry.id);
    setBusy(false);
    setConfirmDelete(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`চালান ${entry.challan_no} মুছে ফেলা হয়েছে`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    navigate({ to: isAdmin && entry.status === "pending" ? "/approvals" : "/challans" });
  }



  if (meLoading || entryQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) {
    return <div className="p-6 text-sm text-muted-foreground">এন্ট্রি পাওয়া যায়নি।</div>;
  }

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6 text-center">
        <h2 className="text-lg font-semibold">এই এন্ট্রি এডিট করা যাবে না</h2>
        <p className="text-sm text-muted-foreground">
          এই এন্ট্রি পরিবর্তন করার অনুমতি নেই।
        </p>
        <Button variant="outline" onClick={() => navigate({ to: "/challans" })}>ফিরে যান</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">এন্ট্রি এডিট</h2>
        <p className="text-sm text-muted-foreground">এডমিন অনুমোদনের আগ পর্যন্ত পরিবর্তন করা যাবে</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">চালান তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>চালান নং</Label>
              <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">গ্রাহক</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label>গ্রাহকের নাম</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">ডেলিভারি ও ইটের তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>ড্রাইভারের নাম</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>গাড়ির নম্বর <span className="text-muted-foreground">(ঐচ্ছিক)</span></Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ইটের ধরন</Label>
              <Select value={brickTypeId} onValueChange={setBrickTypeId}>
                <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {orderedBricks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{quantityLabel}</Label>
              <Input type="number" min={1} step={isAdla ? "0.01" : "1"} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            {isOthers && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>ইটের ধরনের নাম লিখুন</Label>
                <Input value={customBrickName} onChange={(e) => setCustomBrickName(e.target.value)} required />
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">মূল্য</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>একক মূল্য (৳)</Label>
                <Input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>মোট পরিমাণ (৳)</Label>
                <Input value={bn(totalAmount)} disabled className="font-semibold text-primary" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">মন্তব্য</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:flex-wrap">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/challans" })}>বাতিল</Button>
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> ডিলেট
            </Button>
          )}
          <Button type="submit" disabled={busy} variant="secondary">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            পরিবর্তন সংরক্ষণ
          </Button>
          {isAdmin && entry.status === "pending" && (
            <Button
              type="button"
              disabled={busy || !(Number(unitPrice) > 0)}
              onClick={() => setConfirmApprove(true)}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> কনফার্ম ও অনুমোদন
            </Button>
          )}
        </div>
      </form>

      <AlertDialog open={confirmApprove} onOpenChange={(o) => !o && setConfirmApprove(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>অনুমোদন নিশ্চিত করুন</AlertDialogTitle>
            <AlertDialogDescription>
              চালান <span className="font-semibold">{entry.challan_no}</span> অনুমোদিত হবে এবং একক মূল্য সংরক্ষিত হবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleApprove(); }}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} অনুমোদন করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>চালান মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              চালান নং <span className="font-semibold">{entry.challan_no}</span> স্থায়ীভাবে মুছে যাবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} মুছে ফেলুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
