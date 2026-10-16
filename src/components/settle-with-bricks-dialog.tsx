import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { bn, todayBD } from "@/lib/format";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * Settle a supplier's due (e.g. vehicle hire) by giving bricks (admin only).
 * Calls the RPC settle_supplier_with_bricks, which in one transaction makes an
 * approved challan, a matching non-cash collection and a supplier payment.
 */

const NEW_CUSTOMER = "__new__";
const tk = (n: number) => `৳${bn(Math.round(n))}`;

export function SettleWithBricksDialog({
  supplier,
  onClose,
}: {
  supplier: { id: string; name: string; due: number } | null;
  onClose: () => void;
}) {
  const { data: me } = useCurrentUser();
  const open = !!supplier;
  const [form, setForm] = useState({ customer_id: NEW_CUSTOMER, brick_type_id: "", quantity: "", unit_price: "", date: todayBD(), note: "" });

  const custQ = useQuery({
    queryKey: ["customers-min"],
    enabled: open,
    queryFn: async () => (await supabase.from("customers").select("id,name").order("name").limit(5000)).data ?? [],
  });
  const brickTypesQ = useQuery({ queryKey: ["brick-types-active"], enabled: open, queryFn: fetchActiveBrickTypes });
  const stockQ = useQuery({
    queryKey: ["current-stock"],
    enabled: open,
    queryFn: async () => (await supabase.from("current_stock").select("brick_type_id, brick_name, quantity")).data ?? [],
  });

  // Fresh form for each supplier; pick the customer with the same name when there is one
  useEffect(() => {
    if (!supplier) return;
    const same = (custQ.data ?? []).find((c) => c.name.trim() === supplier.name.trim());
    setForm({ customer_id: same?.id ?? NEW_CUSTOMER, brick_type_id: "", quantity: "", unit_price: "", date: todayBD(), note: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id, custQ.data]);

  const due = supplier?.due ?? 0;
  const total = Number(form.quantity || 0) * Number(form.unit_price || 0);
  const stock = Number((stockQ.data ?? []).find((x) => x.brick_type_id === form.brick_type_id)?.quantity ?? 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!supplier || !me?.user.id) throw new Error("লগইন প্রয়োজন");
      if (!form.brick_type_id) throw new Error("কোন ইট দিলেন তা বেছে নিন");
      const qty = Math.round(Number(form.quantity || 0));
      const rate = Number(form.unit_price || 0);
      if (!(qty > 0)) throw new Error("কত পিস দিলেন লিখুন");
      if (!(rate > 0)) throw new Error("প্রতি পিসের দর লিখুন");
      if (qty > stock) throw new Error(`স্টকে এত ইট নেই (আছে ${bn(stock)} পিস)`);
      let customerId = form.customer_id;
      if (customerId === NEW_CUSTOMER) {
        const { data, error } = await supabase.from("customers").insert({ name: supplier.name.trim(), created_by: me.user.id }).select("id").single();
        if (error) throw error;
        customerId = data.id;
      }
      const { error } = await supabase.rpc("settle_supplier_with_bricks", {
        _supplier_id: supplier.id,
        _customer_id: customerId,
        _brick_type_id: form.brick_type_id,
        _quantity: qty,
        _unit_price: rate,
        _date: form.date,
        _note: form.note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ইট দিয়ে বাকি শোধ হয়েছে, চালানও তৈরি হয়েছে");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ইট দিয়ে বাকি শোধ — {supplier?.name}</DialogTitle>
        </DialogHeader>
        {supplier && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3.5 py-2.5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="text-sm font-semibold">এখন বাকি</span>
              <span className="num text-lg font-extrabold">{tk(due)}</span>
            </div>

            <div>
              <Label>কোন ইট দিলেন</Label>
              <Select
                value={form.brick_type_id}
                onValueChange={(v) => {
                  const bt = (brickTypesQ.data ?? []).find((b) => b.id === v);
                  setForm({ ...form, brick_type_id: v, unit_price: form.unit_price || (bt?.default_unit_price ? String(bt.default_unit_price) : "") });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="ইটের ধরন বাছুন" />
                </SelectTrigger>
                <SelectContent>
                  {(brickTypesQ.data ?? []).map((b) => {
                    const st = Number((stockQ.data ?? []).find((x) => x.brick_type_id === b.id)?.quantity ?? 0);
                    return (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} · স্টকে {bn(st)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="bs-qty">কত পিস</Label>
                <Input id="bs-qty" type="number" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="bs-rate">দর (প্রতি পিস, ৳)</Label>
                <Input id="bs-rate" type="number" inputMode="decimal" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
              </div>
            </div>
            {due > 0 && Number(form.unit_price || 0) > 0 && (
              <button
                type="button"
                onClick={() => setForm({ ...form, quantity: String(Math.floor(due / Number(form.unit_price))) })}
                className="text-sm font-bold text-primary underline-offset-2 hover:underline"
              >
                পুরো বাকির সমান: {bn(Math.floor(due / Number(form.unit_price)))} পিস
              </button>
            )}

            <div className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ইটের দাম</span>
                <b className="num">{tk(total)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">এরপর বাকি থাকবে</span>
                <b className={`num ${due - total < -0.5 ? "text-info" : ""}`}>
                  {due - total < -0.5 ? `উল্টো অগ্রিম ${tk(total - due)}` : tk(Math.max(0, due - total))}
                </b>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="bs-date">তারিখ</Label>
                <Input id="bs-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>চালান কার নামে</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_CUSTOMER}>+ নতুন গ্রাহক: {supplier.name}</SelectItem>
                    {(custQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="bs-note">নোট (ইচ্ছা হলে)</Label>
              <Input id="bs-note" placeholder="যেমন: গাড়ি নম্বর" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              সেভ করলে: ইট স্টক থেকে কমবে, ওই নামে একটা চালান হবে, ক্যাশ বইয়ে সমান টাকার আয় (ইট বিক্রি) আর খরচ (বাকি পরিশোধ) উঠবে। হাতের নগদ বদলাবে না।
            </p>
          </div>
        )}
        <DialogFooter>
          <Button className="h-11 w-full text-base" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ইট দিয়ে শোধ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
