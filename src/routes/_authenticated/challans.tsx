import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchSales, fetchAllCustomers, fetchActiveBrickTypes, type SaleType } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, isoDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/challans")({
  head: () => ({ meta: [{ title: "চালান এন্ট্রি — CDB Bricks" }] }),
  component: ChallansPage,
});

function ChallansPage() {
  const { data: me } = useCurrentUser();
  const q = useQuery({
    queryKey: ["sales", "challans", me?.user.id, me?.role],
    enabled: !!me,
    queryFn: () => fetchSales(me!.role === "admin" ? { limit: 50 } : { createdBy: me!.user.id, limit: 50 }),
  });

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
      <RecentSalesTable entries={q.data ?? []} loading={q.isLoading} title="সাম্প্রতিক চালান" subtitle="শেষ ৫০টি" limit={50} />
    </div>
  );
}

// Legacy inline form kept for reference but no longer mounted.
function _NewEntryForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const customersQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });
  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });

  const [challanNo, setChallanNo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [brickTypeId, setBrickTypeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("regular");
  const [saleDate, setSaleDate] = useState(isoDate(new Date()));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!challanNo) {
      const d = new Date();
      const rand = Math.floor(Math.random() * 900 + 100);
      setChallanNo(`CDB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${rand}`);
    }
  }, [challanNo]);

  // Auto-fill unit price from brick type default
  useEffect(() => {
    if (brickTypeId && !unitPrice) {
      const bt = bricksQ.data?.find((b) => b.id === brickTypeId);
      if (bt) setUnitPrice(String(bt.default_unit_price));
    }
  }, [brickTypeId, bricksQ.data, unitPrice]);

  const total = useMemo(() => {
    const q = Number(quantity) || 0;
    const p = Number(unitPrice) || 0;
    return q * p;
  }, [quantity, unitPrice]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (!customerId || !brickTypeId || !quantity || !unitPrice) {
      toast.error("সকল প্রয়োজনীয় তথ্য পূরণ করুন");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("sales_entries").insert({
      challan_no: challanNo.trim(),
      customer_id: customerId,
      brick_type_id: brickTypeId,
      quantity: Number(quantity),
      unit_price: Number(unitPrice),
      total_amount: total,
      sale_type: saleType,
      sale_date: saleDate,
      notes: notes || null,
      created_by: me.user.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("এন্ট্রি সফলভাবে যুক্ত হয়েছে");
    qc.invalidateQueries({ queryKey: ["sales"] });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>চালান নং</Label>
          <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} required />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>গ্রাহক</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
            <SelectContent>
              {(customersQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
              {(customersQ.data ?? []).length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">কোনো গ্রাহক নেই — গ্রাহক পৃষ্ঠা থেকে যোগ করুন</div>}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>ইটের ধরন</Label>
          <Select value={brickTypeId} onValueChange={setBrickTypeId}>
            <SelectTrigger><SelectValue placeholder="ইটের ধরন" /></SelectTrigger>
            <SelectContent>
              {(bricksQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name} — ৳ {bn(b.default_unit_price)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>পরিমাণ (পিস)</Label>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>একক মূল্য (৳)</Label>
          <Input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>ধরন</Label>
          <Select value={saleType} onValueChange={(v) => setSaleType(v as SaleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">নিয়মিত</SelectItem>
              <SelectItem value="advance">অগ্রিম</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>তারিখ</Label>
          <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>মন্তব্য (ঐচ্ছিক)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <Card><CardHeader className="py-3"><CardTitle className="text-sm">মোট: <span className="text-primary">৳ {bn(total)}</span></CardTitle></CardHeader><CardContent className="hidden" /></Card>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} সংরক্ষণ করুন
      </Button>
    </form>
  );
}
