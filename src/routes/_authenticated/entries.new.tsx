import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// removed: Checkbox (advance toggle no longer used)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchAllCustomers, fetchActiveBrickTypes } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { fetchCustomerOpeningDues, OPENING_NONE, PIECES_PER_TRUCK, openingDueLabel, piecesLabel } from "@/lib/opening-adjust";
import { bn, isoDate } from "@/lib/format";
import { fetchBookings, isOpen } from "@/lib/bookings";
import { PAY_MODES, type PayMode, discountLabel, fetchCustomerBalance, fetchCustomerDiscount } from "@/lib/customer-account";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entries/new")({
  head: () => ({ meta: [{ title: "নতুন বিক্রয় এন্ট্রি — CDB Bricks" }] }),
  component: NewEntryPage,
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
/** the challan form's "not from a booking" pick */
const NOT_BOOKING = "__none__";

async function generateNextChallanNo(date?: string): Promise<string> {
  try {
    const { data, error } = await (supabase.rpc as any)("next_challan_number", {
      _date: date || isoDate(new Date()),
    });
    if (!error && data) return data;
  } catch {
    /* fallback to date pattern */
  }
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `CDB-${ymd}-001`;
}

function NewEntryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me, loading: meLoading } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const customersQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });
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
  const [customerId, setCustomerId] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [contractId, setContractId] = useState<string>("");
  const [openingId, setOpeningId] = useState<string>("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [brickTypeId, setBrickTypeId] = useState("");
  const [customBrickName, setCustomBrickName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const isAdvance = false; // advance delivery option removed per requirement
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [addCustOpen, setAddCustOpen] = useState(false);
  // how a challan at the day's price is paid, and the cash taken with it
  const [payMode, setPayMode] = useState<PayMode | "">("");
  const [cashReceived, setCashReceived] = useState("");
  const [cashTouched, setCashTouched] = useState(false);

  // the customer's fixed-price bookings that still have bricks to give (lib/bookings.ts)
  const bookingsQ = useQuery({
    queryKey: ["bookings", customerId],
    enabled: !!customerId,
    queryFn: async () => (await fetchBookings({ customerId })).filter(isOpen),
  });

  // Reset contract when customer changes
  useEffect(() => { setContractId(""); setOpeningId(""); setPayMode(""); }, [customerId]);

  // the customer's current account (advance money left) and discount on bricks taken from it
  const balanceQ = useQuery({
    queryKey: ["customer-balance", customerId],
    enabled: !!customerId,
    queryFn: () => fetchCustomerBalance(customerId),
  });
  const discountQ = useQuery({
    queryKey: ["customer-discount", customerId],
    enabled: !!customerId,
    queryFn: () => fetchCustomerDiscount(customerId),
  });
  const advanceLeft = Math.max(0, -(balanceQ.data ?? 0));
  const discount = discountQ.data ?? 0;

  // গত বছরের বকেয়া (গ্রাহক অগ্রিম) — এই চালান দিয়ে সমন্বয় করা যাবে
  const openingQ = useQuery({
    queryKey: ["customer-opening-dues", customerId],
    enabled: !!customerId,
    queryFn: () => fetchCustomerOpeningDues(customerId),
  });
  const openDues = (openingQ.data ?? []).filter((d) => d.remaining_amount > 0.009);
  const selectedOpening = openDues.find((d) => d.id === openingId);
  // bricks against last season's advance always go at that season's price (the database
  // trigger lock_opening_rate enforces it too)
  const openRate = selectedOpening?.unit_rate ?? null;

  // bookings with trucks left for the chosen brick type. One challan = one truck; the
  // owner picks for each challan whether it comes from a booking ("" = not picked yet,
  // NOT_BOOKING = a normal sale at the day's price)
  const bookingChoices = (bookingsQ.data ?? []).flatMap((b) => b.items
    .filter((i) => i.brick_type_id === brickTypeId && i.remaining > 0)
    .map((i) => ({ id: b.id, no: b.no, rate: i.rate, remaining: i.remaining, perTruck: i.perTruck })));
  const choice = bookingChoices.find((c) => c.id === contractId);
  useEffect(() => { setContractId(""); }, [brickTypeId]);
  useEffect(() => { if (choice) setOpeningId(""); }, [choice]);

  useEffect(() => {
    generateNextChallanNo(saleDate).then(setChallanNo);
  }, [saleDate]);

  const selectedBrick = orderedBricks.find((b) => b.id === brickTypeId);
  const isAdla = selectedBrick ? ADLA_NAMES.has(selectedBrick.name) : false;
  const isOthers = selectedBrick?.name === OTHERS_NAME;
  const quantityLabel = isAdla ? "মোট পরিমাণ (ফুট) / Total Quantity (Feet)" : "মোট ইট (পিস)";

  // the day's price; bricks taken from this season's advance get the customer's discount
  useEffect(() => {
    if (isAdmin && selectedBrick && !isAdvance && !isOthers) {
      const day = Number(selectedBrick.default_unit_price) || 0;
      const less = payMode === "advance" ? discount : 0;
      setUnitPrice(day > 0 ? String(Math.max(0, Math.round((day - less) * 100) / 100)) : "");
    }
  }, [brickTypeId, isAdmin, isAdvance, isOthers, selectedBrick, payMode, discount]);

  // a booking truck: its actual pieces at the booking price; last season's advance at its price
  const totalAmount = useMemo(() => {
    if (isAdvance) return 0;
    return (Number(quantity) || 0) * (choice ? choice.rate : openRate ?? (Number(unitPrice) || 0));
  }, [quantity, unitPrice, isAdvance, choice, openRate]);
  const overOpening = !!selectedOpening && selectedOpening.remaining_qty != null && (Number(quantity) || 0) > selectedOpening.remaining_qty;

  // a day's-price challan (not a booking truck, not last season's advance) says how it is paid
  const needsPay = !!customerId && !choice && !selectedOpening;
  // the admin sees the price, so the cash taken starts at the challan's total
  useEffect(() => {
    if (isAdmin && payMode === "cash" && !cashTouched) setCashReceived(totalAmount > 0 ? String(totalAmount) : "");
  }, [isAdmin, payMode, cashTouched, totalAmount]);

  const selectedCustomer = customersQ.data?.find((c) => c.id === customerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (!challanNo.trim() || !brickTypeId) {
      toast.error("সকল প্রয়োজনীয় তথ্য পূরণ করুন");
      return;
    }
    if (!customerId) {
      toast.error("গ্রাহক নির্বাচন করুন");
      return;
    }
    if (!isOthers && !quantity) {
      toast.error("পরিমাণ লিখুন");
      return;
    }
    if (isOthers && !customBrickName.trim()) {
      toast.error("ইটের ধরনের নাম লিখুন");
      return;
    }
    if (bookingChoices.length > 0 && !contractId) {
      toast.error("এই গাড়ি বুকিং থেকে কিনা, বেছে নিন");
      return;
    }
    if (needsPay && !payMode) {
      toast.error("টাকা কীভাবে — নগদ, অগ্রিম থেকে না বাকিতে, বেছে নিন");
      return;
    }
    if (needsPay && payMode === "cash" && !(Number(cashReceived) > 0)) {
      toast.error("কত টাকা নগদ পেলেন, লিখুন");
      return;
    }
    if (isAdmin && !isAdvance && !isOthers && !unitPrice && !choice && !openRate) {
      toast.error("একক মূল্য দিন বা অগ্রিম চালান নির্বাচন করুন");
      return;
    }
    setBusy(true);

    const advanceFlag = isAdmin ? isAdvance : false;
    const finalUnitPrice = isAdmin && !advanceFlag ? Number(unitPrice) || 0 : 0;
    const finalQuantity = isOthers ? 0 : Number(quantity);

    const targetChallanNo = challanNo.trim() || (await generateNextChallanNo(saleDate));

    const row = (p: { challan: string; qty: number; unit: number; contract: string | null; note?: string }) => ({
      challan_no: p.challan,
      customer_id: customerId,
      contract_id: p.contract,
      opening_balance_id: p.contract ? null : openingId || null,
      brick_type_id: brickTypeId,
      custom_brick_name: isOthers ? customBrickName.trim() : null,
      quantity: p.qty,
      unit_price: isAdmin ? p.unit : 0,
      total_amount: isAdmin ? p.qty * p.unit : 0,
      sale_type: advanceFlag ? "advance" : "regular",
      status: "pending" as const,
      sale_date: saleDate,
      driver_name: isAdmin ? (driverName || null) : null,
      vehicle_number: isAdmin ? (vehicleNumber || null) : null,
      notes: p.note ?? (notes || null),
      created_by: me.user.id,
      // a booking truck or last season's advance has its own account and no pay mode
      pay_mode: !p.contract && !openingId && payMode ? payMode : null,
      cash_received: !p.contract && !openingId && payMode === "cash" ? Number(cashReceived) || 0 : 0,
    });

    const { error } = await sdb.from("sales_entries").insert(row(choice
      ? { challan: targetChallanNo, qty: finalQuantity, unit: choice.rate, contract: choice.id, note: [`বুকিং ${choice.no}`, notes].filter(Boolean).join(" · ") }
      : { challan: targetChallanNo, qty: finalQuantity, unit: openRate ?? finalUnitPrice, contract: null }) as any);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`এন্ট্রি সংরক্ষিত হয়েছে — চালান নং ${targetChallanNo}${choice ? ` (বুকিং ${choice.no} থেকে)` : ""}${!choice && !openingId && payMode === "cash" ? ` · নগদ ৳${bn(Number(cashReceived) || 0)} ক্যাশে যোগ হয়েছে` : ""}`);
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    qc.invalidateQueries({ queryKey: ["opening-balances"] });
    qc.invalidateQueries({ queryKey: ["customer-opening-dues"] });
    qc.invalidateQueries({ queryKey: ["ledger"] });
    qc.invalidateQueries({ queryKey: ["cash"] });
    qc.invalidateQueries({ queryKey: ["customer-balance"] });
    navigate({ to: "/challans" });
  }

  if (meLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">নতুন বিক্রয় এন্ট্রি</h2>
        <p className="text-sm text-muted-foreground">চালান তথ্য সঠিকভাবে পূরণ করে সংরক্ষণ করুন</p>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">গ্রাহক</CardTitle>
            <Dialog open={addCustOpen} onOpenChange={setAddCustOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  <Plus className="mr-1 h-4 w-4" /> নতুন গ্রাহক
                </Button>
              </DialogTrigger>
              <AddCustomerDialog
                onClose={() => setAddCustOpen(false)}
                onCreated={(c) => {
                  qc.invalidateQueries({ queryKey: ["customers-all"] });
                  setCustomerId(c.id);
                  setAddCustOpen(false);
                }}
              />
            </Dialog>
          </CardHeader>
          <CardContent>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedCustomer
                    ? `${selectedCustomer.name}${selectedCustomer.phone ? ` — ${selectedCustomer.phone}` : ""}`
                    : "গ্রাহকের নামের প্রথম অক্ষর লিখুন..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto" align="start">
                <Command>
                  <CommandInput placeholder="নাম বা ফোন দিয়ে খুঁজুন..." />
                  <CommandList>
                    <CommandEmpty>কোনো গ্রাহক পাওয়া যায়নি</CommandEmpty>
                    <CommandGroup>
                      {(customersQ.data ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.phone ?? ""} ${c.address ?? ""}`}
                          onSelect={() => {
                            setCustomerId(c.id);
                            setCustomerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span>{c.name}</span>
                            {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {customerId && openDues.length > 0 && !choice && (
              <div className="mt-3 space-y-1.5 rounded-lg border border-info/30 bg-info/5 p-3">
                <Label>গত বছরের বকেয়া থেকে সমন্বয় (ঐচ্ছিক)</Label>
                <Select value={openingId || OPENING_NONE} onValueChange={(v) => setOpeningId(v === OPENING_NONE ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="সমন্বয় করতে চাইলে নির্বাচন করুন" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPENING_NONE}>— সমন্বয় নয় (এই বছরের নতুন বিক্রয়) —</SelectItem>
                    {openDues.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {openingDueLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedOpening && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {openRate != null && (
                      <p>
                        দাম গত বছরের চুক্তিমতো: প্রতি পিস <b className="text-foreground">৳{bn(openRate)}</b> (গাড়ি ৳{bn(openRate * PIECES_PER_TRUCK)}) — বদলানো যাবে না।
                      </p>
                    )}
                    <p>
                      এই চালানের ৳{bn(totalAmount)} শুধু {bn(selectedOpening.fiscal_year)} সালের বাকি থেকে কাটবে, এ বছরের অগ্রিম বা বাকিতে যাবে না।
                    </p>
                    {overOpening && selectedOpening.remaining_qty != null && (
                      <p className="font-semibold text-destructive">
                        গত বছরের বাকি আছে মাত্র {piecesLabel(selectedOpening.remaining_qty)} — পরিমাণ এর বেশি দিয়েছেন।
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>



        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">ইটের তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isAdmin && (
              <>
                <div className="space-y-1.5">
                  <Label>ড্রাইভারের নাম</Label>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="যেমন: করিম মিয়া" />
                </div>
                <div className="space-y-1.5">
                  <Label>গাড়ির নম্বর <span className="text-muted-foreground">(ঐচ্ছিক)</span></Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="যেমন: ঢাকা-মেট্রো-ট-১২৩৪" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>ইটের ধরন</Label>
              <Select value={brickTypeId} onValueChange={setBrickTypeId}>
                <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {orderedBricks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isOthers && (
              <div className="space-y-1.5">
                <Label>{quantityLabel}</Label>
                <Input type="number" min={1} step={isAdla ? "0.01" : "1"} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </div>
            )}
            {isOthers && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>ইটের ধরনের নাম লিখুন</Label>
                <Input
                  value={customBrickName}
                  onChange={(e) => setCustomBrickName(e.target.value)}
                  placeholder="যেমন: বিশেষ অর্ডার"
                  required
                />
              </div>
            )}
          </CardContent>
        </Card>

        {bookingChoices.length > 0 && (
          <Card className="border-info/40">
            <CardHeader className="pb-3"><CardTitle className="text-base">এই গাড়ি কি বুকিং থেকে?</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {bookingChoices.map((c) => (
                <button key={c.id} type="button" onClick={() => setContractId(c.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left ${contractId === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}>
                  <span><b>হ্যাঁ, {c.no} থেকে</b><span className="block text-xs text-muted-foreground">বাকি {bn(c.remaining)} গাড়ি</span></span>
                  <b className="num shrink-0">প্রতি পিস ৳{bn(c.rate)}</b>
                </button>
              ))}
              <button type="button" onClick={() => setContractId(NOT_BOOKING)}
                className={`w-full rounded-xl border p-3 text-left text-sm ${contractId === NOT_BOOKING ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}>
                <b>না, আজকের দামে</b>
                <span className="block text-xs text-muted-foreground">নিচে বেছে নিন টাকা কীভাবে: নগদ, অগ্রিম থেকে না বাকিতে</span>
              </button>
            </CardContent>
          </Card>
        )}

        {needsPay && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">টাকা কীভাবে?</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PAY_MODES.filter((m) => m.value !== "advance" || advanceLeft > 0.5 || payMode === "advance").map((m) => (
                <button key={m.value} type="button" onClick={() => setPayMode(m.value)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${payMode === m.value ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}>
                  <b>{m.label}</b>
                  <span className="block text-xs text-muted-foreground">
                    {m.value === "advance" ? `অগ্রিম জমা আছে ৳${bn(Math.round(advanceLeft))}${discount > 0 ? ` · ছাড় ${discountLabel(discount)}` : ""}` : m.hint}
                  </span>
                </button>
              ))}
              {payMode === "cash" && (
                <div className="space-y-1.5 pt-1">
                  <Label>নগদ পেলাম (৳)</Label>
                  <Input type="number" inputMode="decimal" min={0} value={cashReceived}
                    onChange={(e) => { setCashTouched(true); setCashReceived(e.target.value); }} />
                  {isAdmin && Number(cashReceived) > 0 && Math.abs(Number(cashReceived) - totalAmount) > 0.5 && (
                    <p className="text-xs text-warning">
                      চালান ৳{bn(totalAmount)}, নগদ ৳{bn(Number(cashReceived))} — পার্থক্য ৳{bn(Math.abs(Math.round(totalAmount - Number(cashReceived))))} গ্রাহকের {Number(cashReceived) < totalAmount ? "বাকিতে" : "অগ্রিমে"} যাবে।
                    </p>
                  )}
                  {!isAdmin && <p className="text-xs text-muted-foreground">সেভ করার পর এই টাকা বদলাতে অ্যাডমিন লাগবে।</p>}
                </div>
              )}
              {payMode === "advance" && isAdmin && totalAmount > advanceLeft + 0.5 && (
                <p className="text-xs text-warning">
                  অগ্রিম আছে ৳{bn(Math.round(advanceLeft))}; বাকি ৳{bn(Math.round(totalAmount - advanceLeft))} গ্রাহকের বাকিতে যাবে।
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin ? (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">মূল্য</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {choice ? (
                  <div className="space-y-1.5">
                    <Label>একক মূল্য (বুকিংয়ের দাম)</Label>
                    <Input value={`৳ ${bn(choice.rate)}`} disabled />
                  </div>
                ) : openRate != null ? (
                  <div className="space-y-1.5">
                    <Label>একক মূল্য (গত বছরের দাম)</Label>
                    <Input value={`৳ ${bn(openRate)}`} disabled />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>একক মূল্য (৳){payMode === "advance" && discount > 0 ? " — আজকের দাম থেকে ছাড় বাদে" : ""}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                    />
                    {payMode === "advance" && discount > 0 && selectedBrick && Number(selectedBrick.default_unit_price) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        আজকের দাম ৳{bn(selectedBrick.default_unit_price)} − ছাড় ৳{bn(discount)} = ৳{bn(Math.max(0, Math.round((Number(selectedBrick.default_unit_price) - discount) * 100) / 100))}
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>মোট পরিমাণ (৳)</Label>
                  <Input value={bn(totalAmount)} disabled className="font-semibold text-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>মন্তব্য (ঐচ্ছিক)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>

        ) : (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">অতিরিক্ত তথ্য</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>মন্তব্য (ঐচ্ছিক)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/challans" })}>বাতিল</Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            এন্ট্রি সংরক্ষণ করুন
          </Button>
        </div>
      </form>
    </div>
  );
}

function AddCustomerDialog({ onCreated, onClose }: { onCreated: (c: { id: string }) => void; onClose: () => void }) {
  const { data: me } = useCurrentUser();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("নাম দিন"); return; }
    if (!phone.trim()) { toast.error("মোবাইল নাম্বার দিন"); return; }
    if (!address.trim()) { toast.error("ঠিকানা দিন"); return; }
    setBusy(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({ name: name.trim(), phone: phone.trim(), address: address.trim(), created_by: me?.user.id ?? null })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("গ্রাহক যোগ হয়েছে");
    onCreated({ id: data!.id });
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>নতুন গ্রাহক যোগ করুন</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>নাম *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>মোবাইল *</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" required />
        </div>
        <div className="space-y-1.5">
          <Label>ঠিকানা *</Label>
          <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} required />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>বাতিল</Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} সংরক্ষণ
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
