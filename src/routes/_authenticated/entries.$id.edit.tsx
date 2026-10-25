import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, CheckCircle2, Trash2, Calculator, FileText, Lock, Wallet } from "lucide-react";
import { ProcessStepBar } from "@/components/process-step-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { isoDate, bn } from "@/lib/format";
import { fetchBookings, isOpen } from "@/lib/bookings";
import { fetchCustomerOpeningDues, OPENING_NONE, PIECES_PER_TRUCK, openingDueLabel, piecesLabel } from "@/lib/opening-adjust";
import { toast } from "sonner";

const CASH_VALUE = "__cash__";
const CONTRACT_TYPE_LABEL: Record<string, string> = {
  yearly_fixed: "বার্ষিক ফিক্সড",
  short_term: "শর্ট-টার্ম",
  cash: "ক্যাশ",
};

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
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [contractId, setContractId] = useState<string>("");
  const [openingId, setOpeningId] = useState<string>("");

  // the customer's fixed-price bookings that hold this brick type (lib/bookings.ts)
  const customerId = entryQ.data?.customer_id;
  const bookingsQ = useQuery({
    queryKey: ["bookings", customerId],
    enabled: !!customerId && isAdmin,
    queryFn: () => fetchBookings({ customerId: customerId! }),
  });
  const bookingOptions = (bookingsQ.data ?? [])
    .filter((b) => b.id === entryQ.data?.contract_id || isOpen(b))
    .flatMap((b) => {
      const it = b.items.find((i) => i.brick_type_id === brickTypeId);
      return it ? [{ id: b.id, no: b.no, rate: it.rate, remaining: it.remaining }] : [];
    });
  const selectedBooking = bookingOptions.find((c) => c.id === contractId);

  // গত বছরের গ্রাহক বকেয়া — এই চালান দিয়ে সমন্বয় করা যাবে
  const openingQ = useQuery({
    queryKey: ["customer-opening-dues", customerId],
    enabled: !!customerId && isAdmin,
    queryFn: () => fetchCustomerOpeningDues(customerId!),
  });
  const openDues = (openingQ.data ?? []).filter(
    (d) => d.remaining_amount > 0.009 || d.id === openingId,
  );
  const selectedOpening = openDues.find((d) => d.id === openingId);
  const hasOpening = !!openingId && openingId !== OPENING_NONE;
  // bricks against last season's advance go at that season's price (lock_opening_rate in the DB)
  const openRate = hasOpening ? selectedOpening?.unit_rate ?? null : null;
  // bricks still owed on that advance, counting this challan's own pieces back in when it is
  // already linked to it (the summary view counts pending challans too)
  const openingRoom = selectedOpening?.remaining_qty != null
    ? selectedOpening.remaining_qty + (entryQ.data && (entryQ.data as any).opening_balance_id === selectedOpening.id ? Number(entryQ.data.quantity) || 0 : 0)
    : null;

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
    setUnitPrice(String(e.unit_price ?? 0));
    setNotes(e.notes ?? "");
    setContractId(e.contract_id ?? CASH_VALUE);
    setOpeningId((e as any).opening_balance_id ?? "");
    setLoaded(true);
  }, [entryQ.data, loaded]);

  // a challan against a booking always takes the booking's price for its brick type
  useEffect(() => {
    if (!isAdmin || !selectedBooking) return;
    setUnitPrice(String(selectedBooking.rate));
  }, [contractId, selectedBooking?.rate, isAdmin]);

  // and a challan against last season's advance takes that advance's price
  useEffect(() => {
    if (!isAdmin || openRate == null) return;
    setUnitPrice(String(openRate));
  }, [openingId, openRate, isAdmin]);

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
    const finalUnit = isAdmin ? (Number(unitPrice) || 0) : Number(entry.unit_price);
    const finalAmount = isAdmin ? finalUnit * qty : Number(entry.total_amount);

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
        ...(isAdmin ? { contract_id: contractId && contractId !== CASH_VALUE ? contractId : null } : {}),
        ...(isAdmin ? { opening_balance_id: hasOpening ? openingId : null } : {}),
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
    const qty = Number(quantity) || 1;
    const unit = Number(unitPrice) || 0;
    const amt = unit * qty;
    if (unit <= 0) {
      toast.error("একক মূল্য দিন");
      setConfirmApprove(false);
      return;
    }
    // one challan = one truck; the booking must still have a truck for it
    // (this challan, if already waiting on the booking, is counted in what is left)
    if (selectedBooking) {
      const own = entry.contract_id === selectedBooking.id && entry.status === "pending" ? 1 : 0;
      if (selectedBooking.remaining + own < 1) {
        toast.error(`বুকিং ${selectedBooking.no}-এর সব গাড়ি দেওয়া শেষ। এটা আজকের দামে দিন।`);
        setConfirmApprove(false);
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase
      .from("sales_entries")
      .update({
        status: "approved",
        approved_by: me.user.id,
        approved_at: new Date().toISOString(),
        unit_price: unit,
        total_amount: amt,
        contract_id: contractId && contractId !== CASH_VALUE ? contractId : null,
        opening_balance_id: hasOpening ? openingId : null,
      })
      .eq("id", entry.id);
    setBusy(false);
    setConfirmApprove(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`চালান ${entry.challan_no} অনুমোদিত`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["sales-entry", id] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    qc.invalidateQueries({ queryKey: ["opening-balances"] });
    qc.invalidateQueries({ queryKey: ["customer-opening-dues"] });
    qc.invalidateQueries({ queryKey: ["ledger"] });
    navigate({ to: "/approvals" });
  }


  async function handleDelete() {
    if (!entry) return;
    setBusy(true);
    const { error } = await sdb.from("sales_entries").delete().eq("id", entry.id);
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

  const steps: { label: string; status: "done" | "current" | "upcoming" }[] = [
    { label: "তৈরি", status: "done" },
    {
      label: "মূল্য নির্ধারণ",
      status: entry.status === "pending" ? (Number(unitPrice) > 0 ? "current" : "current") : "done",
    },
    {
      label: "অনুমোদন",
      status: entry.status === "approved" ? "done" : "upcoming",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">এন্ট্রি এডিট</h2>
        <p className="text-sm text-muted-foreground">
          {lockedForAdminApproval
            ? "অনুমোদনের জন্য শুধু টাকার পরিমান বসান। অনুমোদনের পরে সব ফিল্ড পরিবর্তন করা যাবে।"
            : "এডমিন অনুমোদনের আগ পর্যন্ত পরিবর্তন করা যাবে"}
        </p>
      </div>

      <Card className="border-border/60 bg-gradient-to-br from-card to-card/60">
        <CardContent className="p-4">
          <ProcessStepBar steps={steps} />
        </CardContent>
      </Card>


      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">চালান তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>চালান নং</Label>
              <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} required disabled={fieldsDisabled} />
            </div>
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required disabled={fieldsDisabled} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">গ্রাহক</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label>গ্রাহকের নাম</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required disabled={fieldsDisabled} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">ডেলিভারি ও ইটের তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>ড্রাইভারের নাম</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} disabled={fieldsDisabled} />
            </div>
            <div className="space-y-1.5">
              <Label>গাড়ির নম্বর <span className="text-muted-foreground">(ঐচ্ছিক)</span></Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} disabled={fieldsDisabled} />
            </div>
            <div className="space-y-1.5">
              <Label>ইটের ধরন</Label>
              {fieldsDisabled ? (
                <Input
                  value={
                    selectedBrick?.name === OTHERS_NAME
                      ? (customBrickName || OTHERS_NAME)
                      : (selectedBrick?.name ?? entry.custom_brick_name ?? "—")
                  }
                  disabled
                />
              ) : (
                <Select value={brickTypeId} onValueChange={setBrickTypeId}>
                  <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                  <SelectContent>
                    {orderedBricks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{quantityLabel}</Label>
              <Input type="number" min={1} step={isAdla ? "0.01" : "1"} value={quantity} onChange={(e) => setQuantity(e.target.value)} required disabled={fieldsDisabled} />
            </div>
            {isOthers && !fieldsDisabled && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>ইটের ধরনের নাম লিখুন</Label>
                <Input value={customBrickName} onChange={(e) => setCustomBrickName(e.target.value)} required />
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                ঠিক দামে বুকিং
              </CardTitle>
              {selectedBooking && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Lock className="h-3 w-3" /> রেট লক
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>এই ইট কি কোনো বুকিং থেকে?</Label>
              <Select value={contractId || CASH_VALUE} onValueChange={setContractId}>
                <SelectTrigger>
                  <SelectValue placeholder="বুকিং বা সাধারণ বিক্রি" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH_VALUE}>
                    <span className="inline-flex items-center gap-2">
                      <Wallet className="h-4 w-4" /> বুকিং নয় — আজকের দামে
                    </span>
                  </SelectItem>
                  {bookingOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.no} · প্রতি পিস ৳{bn(c.rate)} · বাকি {bn(c.remaining)} গাড়ি
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bookingsQ.isLoading && (
                <p className="text-xs text-muted-foreground">বুকিং লোড হচ্ছে…</p>
              )}
              {!bookingsQ.isLoading && bookingOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  এই গ্রাহকের এই ইটের কোনো বুকিং নেই — আজকের দামে বিক্রি হবে।
                </p>
              )}
              {selectedBooking && (
                <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  দাম বুকিংয়ের: <span className="font-semibold text-foreground">৳{bn(selectedBooking.rate)}</span> প্রতি পিস (বদলানো যায় না)
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && openDues.length > 0 && (
          <Card className="border-info/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">গত বছরের বকেয়া থেকে সমন্বয়</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>এই চালান কি গত বছরের অগ্রিমের বিপরীতে?</Label>
              <Select value={openingId || OPENING_NONE} onValueChange={(v) => setOpeningId(v === OPENING_NONE ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OPENING_NONE}>— না, এ বছরের নতুন বিক্রয় —</SelectItem>
                  {openDues.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {openingDueLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOpening ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {openRate != null && (
                    <p>
                      দাম গত বছরের চুক্তিমতো: প্রতি পিস <b className="text-foreground">৳{bn(openRate)}</b> (গাড়ি ৳{bn(openRate * PIECES_PER_TRUCK)}) — বদলানো যাবে না।
                    </p>
                  )}
                  <p>
                    এই চালানের টাকা শুধু {bn(selectedOpening.fiscal_year)} সালের বাকি থেকে কাটবে, এ বছরের অগ্রিম বা বাকিতে যাবে না।
                  </p>
                  {openingRoom != null && (Number(quantity) || 0) > openingRoom && (
                    <p className="font-semibold text-destructive">
                      গত বছরের বাকি আছে মাত্র {piecesLabel(openingRoom)} — পরিমাণ এর বেশি।
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  গত বছরের অগ্রিমের বিপরীতে ইট দিলে এখানে নির্বাচন করুন।
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">টাকার পরিমান</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>একক মূল্য (৳ / {isAdla ? "ফুট" : "পিস"})</Label>
                <div className="relative">
                  <Calculator className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitPrice}
                    disabled={!!selectedBooking || openRate != null}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="pl-9 font-semibold text-primary"
                    placeholder="০"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>মোট টাকার পরিমান (৳)</Label>
                <Input
                  disabled
                  value={((Number(unitPrice) || 0) * (Number(quantity) || 0)).toFixed(2)}
                  className="font-semibold"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">মন্তব্য</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={fieldsDisabled} />
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
          {!lockedForAdminApproval && (
            <Button type="submit" disabled={busy} variant="secondary">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              পরিবর্তন সংরক্ষণ
            </Button>
          )}
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
              চালান <span className="font-semibold">{entry.challan_no}</span> অনুমোদিত হবে এবং টাকার পরিমান সংরক্ষিত হবে।
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
