import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllCustomers, fetchActiveBrickTypes } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, isoDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entries/new")({
  head: () => ({ meta: [{ title: "নতুন বিক্রয় এন্ট্রি — CDB Bricks" }] }),
  component: NewEntryPage,
});

// Canonical display order for brick types
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

async function generateNextChallanNo(): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `CDB-${ymd}-`;
  const { data } = await supabase
    .from("sales_entries")
    .select("challan_no")
    .like("challan_no", `${prefix}%`)
    .order("challan_no", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data[0]?.challan_no) {
    const tail = data[0].challan_no.split("-").pop() ?? "0";
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, "0")}`;
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
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [brickTypeId, setBrickTypeId] = useState("");
  const [customBrickName, setCustomBrickName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isAdvance, setIsAdvance] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [addCustOpen, setAddCustOpen] = useState(false);

  useEffect(() => {
    generateNextChallanNo().then(setChallanNo);
  }, []);

  const selectedBrick = orderedBricks.find((b) => b.id === brickTypeId);
  const isAdla = selectedBrick ? ADLA_NAMES.has(selectedBrick.name) : false;
  const isOthers = selectedBrick?.name === OTHERS_NAME;
  const quantityLabel = isAdla ? "মোট পরিমাণ (ফুট) / Total Quantity (Feet)" : "মোট ইট (পিস)";

  useEffect(() => {
    if (isAdmin && selectedBrick && !isAdvance && !isOthers) {
      setUnitPrice(String(selectedBrick.default_unit_price));
    }
  }, [brickTypeId, isAdmin, isAdvance, isOthers, selectedBrick]);

  const totalAmount = useMemo(() => {
    if (isAdvance) return 0;
    return (Number(quantity) || 0) * (Number(unitPrice) || 0);
  }, [quantity, unitPrice, isAdvance]);

  const selectedCustomer = customersQ.data?.find((c) => c.id === customerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (!challanNo.trim() || !customerId || !brickTypeId || !quantity) {
      toast.error("সকল প্রয়োজনীয় তথ্য পূরণ করুন");
      return;
    }
    if (isOthers && !customBrickName.trim()) {
      toast.error("ইটের ধরনের নাম লিখুন");
      return;
    }
    if (isAdmin && !isAdvance && !unitPrice) {
      toast.error("একক মূল্য দিন বা অগ্রিম চালান নির্বাচন করুন");
      return;
    }
    setBusy(true);
    // Managers never set price — admins fill it during approval.
    const finalUnitPrice = isAdmin && !isAdvance ? Number(unitPrice) : 0;
    const finalTotal = isAdmin && !isAdvance ? totalAmount : 0;

    const { error } = await supabase.from("sales_entries").insert({
      challan_no: challanNo.trim(),
      customer_id: customerId,
      brick_type_id: brickTypeId,
      custom_brick_name: isOthers ? customBrickName.trim() : null,
      quantity: Number(quantity),
      unit_price: finalUnitPrice,
      total_amount: finalTotal,
      sale_type: isAdvance ? "advance" : "regular",
      status: "pending",
      sale_date: saleDate,
      driver_name: driverName || null,
      vehicle_number: vehicleNumber || null,
      notes: notes || null,
      created_by: me.user.id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`এন্ট্রি সংরক্ষিত হয়েছে — চালান নং ${challanNo}`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
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
        {/* Challan Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">চালান তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>চালান নং {isAdmin ? "" : "(স্বয়ংক্রিয়)"}</Label>
              <Input
                value={challanNo}
                onChange={(e) => setChallanNo(e.target.value)}
                readOnly={!isAdmin}
                className={cn(!isAdmin && "bg-muted/50")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
            </div>
          </CardContent>
        </Card>

        {/* Customer */}
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
                    : "গ্রাহক খুঁজুন বা নির্বাচন করুন..."}
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
          </CardContent>
        </Card>

        {/* Delivery & Brick details */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">ডেলিভারি ও ইটের তথ্য</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>ড্রাইভারের নাম</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="যেমন: করিম মিয়া" />
            </div>
            <div className="space-y-1.5">
              <Label>গাড়ির নম্বর <span className="text-muted-foreground">(ঐচ্ছিক)</span></Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="যেমন: ঢাকা-মেট্রো-ট-১২৩৪" />
            </div>
            <div className="space-y-1.5">
              <Label>ইটের ধরন</Label>
              <Select value={brickTypeId} onValueChange={setBrickTypeId}>
                <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {orderedBricks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {isAdmin && b.name !== OTHERS_NAME && b.default_unit_price > 0
                        ? ` — ৳${bn(b.default_unit_price)}`
                        : ""}
                    </SelectItem>
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

        {/* Amount + advance — visible to Admins only. Managers do not see prices. */}
        {isAdmin ? (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">মূল্য</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={isAdvance}
                  onCheckedChange={(v) => {
                    const next = Boolean(v);
                    setIsAdvance(next);
                    if (next) setUnitPrice("0");
                  }}
                />
                <div>
                  <div className="text-sm font-medium">অগ্রিম চালান / Advance Delivery</div>
                  <div className="text-xs text-muted-foreground">পরিমাণ ০ হিসেবে সংরক্ষিত হবে</div>
                </div>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>একক মূল্য (৳)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    disabled={isAdvance}
                  />
                </div>
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
              <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={isAdvance}
                  onCheckedChange={(v) => setIsAdvance(Boolean(v))}
                />
                <div>
                  <div className="text-sm font-medium">অগ্রিম চালান / Advance Delivery</div>
                  <div className="text-xs text-muted-foreground">এডমিন অনুমোদনের সময় মূল্য নির্ধারণ করবেন</div>
                </div>
              </label>
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
    setBusy(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({ name: name.trim(), phone: phone || null, address: address || null, created_by: me?.user.id ?? null })
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
          <Label>নাম</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>মোবাইল</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </div>
        <div className="space-y-1.5">
          <Label>ঠিকানা</Label>
          <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
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
