import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CalendarClock, Wallet, Banknote, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isoDate } from "@/lib/format";
import { fetchAllCustomers } from "@/lib/sales-queries";
import { createContract } from "@/lib/contracts.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracts/new")({
  head: () => ({
    meta: [
      { title: "নতুন চুক্তি — CDB Bricks" },
      { name: "description", content: "বার্ষিক ফিক্সড রেট, স্বল্পমেয়াদী, অথবা নগদ চুক্তি তৈরি করুন।" },
    ],
  }),
  component: NewContractPage,
});

type ContractType = "yearly_fixed" | "short_term" | "cash";

function NewContractPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ContractType>("yearly_fixed");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/contracts" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">নতুন চুক্তি</h1>
          <p className="text-sm text-muted-foreground">চুক্তির ধরন নির্বাচন করুন</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ContractType)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="yearly_fixed" className="gap-2">
            <CalendarClock className="h-4 w-4" /> বার্ষিক ফিক্সড
          </TabsTrigger>
          <TabsTrigger value="short_term" className="gap-2">
            <Wallet className="h-4 w-4" /> স্বল্পমেয়াদী
          </TabsTrigger>
          <TabsTrigger value="cash" className="gap-2">
            <Banknote className="h-4 w-4" /> নগদ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="yearly_fixed">
          <ContractForm type="yearly_fixed" />
        </TabsContent>
        <TabsContent value="short_term">
          <ContractForm type="short_term" />
        </TabsContent>
        <TabsContent value="cash">
          <ContractForm type="cash" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContractForm({ type }: { type: ContractType }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createContract);
  const customersQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });

  const today = isoDate(new Date());
  const defaultExpiry = (() => {
    const d = new Date();
    if (type === "yearly_fixed") d.setFullYear(d.getFullYear() + 1);
    else if (type === "short_term") d.setDate(d.getDate() + 7);
    else return "";
    return isoDate(d);
  })();

  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [expiryDate, setExpiryDate] = useState(defaultExpiry);
  const [rate, setRate] = useState("");
  const [bookedQty, setBookedQty] = useState("");
  const [advance, setAdvance] = useState("");
  const [priority, setPriority] = useState(type === "yearly_fixed" ? "1" : type === "short_term" ? "2" : "3");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const isCash = type === "cash";
  const TYPE_NAME = { yearly_fixed: "বার্ষিক ফিক্সড রেট", short_term: "স্বল্পমেয়াদী", cash: "নগদ" }[type];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { toast.error("গ্রাহক নির্বাচন করুন"); return; }
    if (!isCash && !rate) { toast.error("রেট দিন"); return; }
    if (!isCash && !bookedQty) { toast.error("বুকিং পরিমাণ দিন"); return; }

    setBusy(true);
    try {
      const rateNum = Number(rate) || 0;
      const qty = Number(bookedQty) || 0;
      const result = await create({
        data: {
          customer_id: customerId,
          contract_type: type,
          start_date: startDate,
          expiry_date: isCash ? null : (expiryDate || null),
          fixed_rate: isCash ? null : rateNum,
          booked_quantity: qty,
          booked_value: qty * rateNum,
          advance_paid: Number(advance) || 0,
          priority: Number(priority) || 100,
          notes: notes || null,
        },
      });
      toast.success(`চুক্তি তৈরি হয়েছে: ${result.contract_no}`);
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      navigate({ to: "/contracts/$id", params: { id: result.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ত্রুটি");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{TYPE_NAME} চুক্তি</CardTitle>
        <CardDescription>
          {type === "yearly_fixed" && "রেট লক হবে — বাজার দর পরিবর্তন হলেও এই চুক্তির রেট বহাল থাকবে।"}
          {type === "short_term" && "বর্তমান বাজার দরে স্বল্পমেয়াদী বুকিং (২–৭ দিন)।"}
          {type === "cash" && "তাৎক্ষণিক নগদ ক্রয়ের অ্যাকাউন্ট — কোনো চুক্তি থেকে কাটে না।"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>শুরুর তারিখ *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            {!isCash && (
              <div className="space-y-1.5">
                <Label>মেয়াদ শেষ</Label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            )}
          </div>

          {!isCash && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>প্রতি ট্রাক রেট (৳) *</Label>
                <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>বুকিং (ট্রাক) *</Label>
                <Input type="number" step="0.01" value={bookedQty} onChange={(e) => setBookedQty(e.target.value)} required />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>অ্যাডভান্স (৳)</Label>
              <Input type="number" step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>প্রায়োরিটি (১ = সর্বোচ্চ)</Label>
              <Input type="number" min="1" max="999" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>মন্তব্য</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {!isCash && rate && bookedQty && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
              মোট বুকিং মূল্য: <span className="font-bold">৳ {(Number(rate) * Number(bookedQty)).toLocaleString("bn-BD")}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            চুক্তি তৈরি করুন
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
