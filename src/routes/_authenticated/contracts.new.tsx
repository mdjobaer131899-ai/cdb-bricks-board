import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isoDate, bn } from "@/lib/format";
import { fetchAllCustomers } from "@/lib/sales-queries";
import { createContract } from "@/lib/contracts.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracts/new")({
  head: () => ({
    meta: [{ title: "নতুন চুক্তি — CDB Bricks" }],
  }),
  component: NewContractPage,
});

function NewContractPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createContract);
  const customersQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });

  const [customerId, setCustomerId] = useState("");
  const [contractDate, setContractDate] = useState(isoDate(new Date()));
  const [contractType, setContractType] = useState<"yearly_fixed" | "cash">("yearly_fixed");
  const [advancePaid, setAdvancePaid] = useState("");
  const [brickQty, setBrickQty] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const isCash = contractType === "cash";
  const r = Number(rate) || 0;
  const advance = Number(advancePaid) || 0;
  // For cash contracts: total bricks = advance / rate (auto). For others: user enters brick qty.
  const qty = isCash ? (r > 0 ? Math.floor(advance / r) : 0) : (Number(brickQty) || 0);
  const truckQty = useMemo(() => (qty > 0 ? qty / 2000 : 0), [qty]);
  const totalValue = useMemo(() => qty * r, [qty, r]);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return toast.error("গ্রাহক নির্বাচন করুন");
    if (qty <= 0) return toast.error("ইটের পরিমাণ দিন");
    if (r <= 0) return toast.error("প্রতি ইট রেট দিন");
    if (contractType === "cash" && advance <= 0) return toast.error("নগদ চুক্তির জন্য অগ্রিম পরিমাণ দিন");

    setBusy(true);
    try {
      const result = await create({
        data: {
          customer_id: customerId,
          contract_date: contractDate,
          total_brick_quantity: qty,
          per_brick_rate: r,
          contract_type: contractType,
          advance_paid: contractType === "cash" ? advance : 0,
          notes: notes || null,
        },
      });
      toast.success(`চুক্তি তৈরি হয়েছে: ${result.contract_no}`);
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      qc.invalidateQueries({ queryKey: ["contracts-by-customer"] });
      navigate({ to: "/contracts/$id", params: { id: result.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ত্রুটি");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/contracts" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">নতুন চুক্তি</h1>
          <p className="text-sm text-muted-foreground">শুধু ৪টি তথ্য প্রয়োজন</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">চুক্তির তথ্য</CardTitle>
          <CardDescription>ট্রাক ও মোট মূল্য স্বয়ংক্রিয়ভাবে হিসাব হবে</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>চুক্তির ধরন *</Label>
              <Select value={contractType} onValueChange={(v) => setContractType(v as "yearly_fixed" | "cash")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yearly_fixed">নিয়মিত চুক্তি (বার্ষিক)</SelectItem>
                  <SelectItem value="cash">নগদ চুক্তি (অগ্রিম টাকা)</SelectItem>
                </SelectContent>
              </Select>
              {contractType === "cash" && (
                <p className="text-[11px] text-muted-foreground">গ্রাহক অগ্রিম টাকা দিয়েছেন, ধীরে ধীরে ইট নিবেন</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>গ্রাহক *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {(customersQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>চুক্তির তারিখ *</Label>
              <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} required />
            </div>

            {contractType === "cash" && (
              <div className="space-y-1.5">
                <Label>অগ্রিম পরিশোধ (৳) *</Label>
                <Input type="number" step="0.01" min="0" value={advancePaid} onChange={(e) => setAdvancePaid(e.target.value)} placeholder="যেমন: ৫০০০০০" />
                <p className="text-[11px] text-muted-foreground">গ্রাহক এখনই যে টাকা দিয়েছেন</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>মোট ইট (পিস) *</Label>
                <Input type="number" min="1" value={brickQty} onChange={(e) => setBrickQty(e.target.value)} placeholder="যেমন: ১০০০০০" required />
              </div>
              <div className="space-y-1.5">
                <Label>প্রতি ইট রেট (৳) *</Label>
                <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="যেমন: ১২" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">মোট ট্রাক (২০০০ পিস = ১ ট্রাক)</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{bn(truckQty.toFixed(2))}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">স্বয়ংক্রিয় — সম্পাদনযোগ্য নয়</div>
              </div>
              <div className="rounded-md border bg-primary/5 p-3">
                <div className="text-xs text-muted-foreground">মোট চুক্তি মূল্য</div>
                <div className="mt-1 text-xl font-bold text-primary tabular-nums">৳ {bn(totalValue)}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">পিস × রেট</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>মন্তব্য</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              চুক্তি তৈরি করুন
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
