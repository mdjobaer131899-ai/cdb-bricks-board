import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { bn, bnDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/seasons")({
  component: SeasonsPage,
  errorComponent: ({ error }) => <div className="p-4 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-4">পাওয়া যায়নি</div>,
});

type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  target_production: number | null;
  note: string | null;
  is_active: boolean;
};

function SeasonsPage() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);

  const { data: seasons = [] } = useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("seasons").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return data as Season[];
    },
  });

  const { data: production = [] } = useQuery({
    queryKey: ["seasons-production"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_entries").select("production_date, quantity");
      if (error) throw error;
      return data;
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["seasons-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("sale_date, quantity, total_amount, status, sale_type");
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["seasons-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("expense_date, amount");
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    const m: Record<string, { prod: number; soldQty: number; revenue: number; expense: number }> = {};
    for (const s of seasons) {
      m[s.id] = { prod: 0, soldQty: 0, revenue: 0, expense: 0 };
      const start = s.start_date, end = s.end_date;
      for (const p of production as any[]) {
        if (p.production_date >= start && p.production_date <= end) m[s.id].prod += Number(p.quantity || 0);
      }
      for (const e of sales as any[]) {
        if (e.status === "approved" && e.sale_type !== "advance" && e.sale_date >= start && e.sale_date <= end) {
          m[s.id].soldQty += Number(e.quantity || 0);
          m[s.id].revenue += Number(e.total_amount || 0);
        }
      }
      for (const x of expenses as any[]) {
        if (x.expense_date >= start && x.expense_date <= end) m[s.id].expense += Number(x.amount || 0);
      }
    }
    return m;
  }, [seasons, production, sales, expenses]);

  const saveSeason = useMutation({
    mutationFn: async (payload: Partial<Season>) => {
      if (editing) {
        const { error } = await supabase.from("seasons").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("seasons").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      setOpen(false);
      setEditing(null);
      toast.success("সংরক্ষণ হয়েছে");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(s: Season) {
    setEditing(s);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    saveSeason.mutate({
      name: String(fd.get("name") || ""),
      start_date: String(fd.get("start_date") || ""),
      end_date: String(fd.get("end_date") || ""),
      target_production: fd.get("target_production") ? Number(fd.get("target_production")) : null,
      note: String(fd.get("note") || "") || null,
      is_active: fd.get("is_active") === "on",
    });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">মৌসুম ট্র্যাকিং</h1>
        {isAdmin && (
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4" /> নতুন মৌসুম
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {seasons.map((s) => {
          const st = stats[s.id] || { prod: 0, soldQty: 0, revenue: 0, expense: 0 };
          const profit = st.revenue - st.expense;
          return (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {s.name}
                    {s.is_active && <Badge variant="default">সক্রিয়</Badge>}
                  </CardTitle>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {bnDate(s.start_date)} – {bnDate(s.end_date)}
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <Stat label="মোট উৎপাদন" value={`${bn(st.prod)} পিস`} />
                <Stat label="লক্ষ্যমাত্রা" value={s.target_production ? `${bn(s.target_production)} পিস` : "—"} />
                <Stat label="মোট বিক্রি" value={`${bn(st.soldQty)} পিস`} />
                <Stat label="মোট আয়" value={`৳${bn(st.revenue)}`} />
                <Stat label="মোট ব্যয়" value={`৳${bn(st.expense)}`} />
                <Stat label="নিট লাভ" value={`৳${bn(profit)}`} highlight={profit >= 0 ? "pos" : "neg"} />
                {s.note && <p className="col-span-2 text-xs text-muted-foreground">{s.note}</p>}
              </CardContent>
            </Card>
          );
        })}
        {seasons.length === 0 && (
          <p className="text-sm text-muted-foreground">কোনো মৌসুম পাওয়া যায়নি।</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "মৌসুম সম্পাদনা" : "নতুন মৌসুম"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>নাম</Label>
              <Input name="name" required defaultValue={editing?.name ?? ""} placeholder="মৌসুম ২০২৫-২৬" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>শুরু</Label>
                <Input type="date" name="start_date" required defaultValue={editing?.start_date ?? ""} />
              </div>
              <div>
                <Label>শেষ</Label>
                <Input type="date" name="end_date" required defaultValue={editing?.end_date ?? ""} />
              </div>
            </div>
            <div>
              <Label>লক্ষ্য উৎপাদন (পিস)</Label>
              <Input
                type="number"
                name="target_production"
                defaultValue={editing?.target_production ?? ""}
              />
            </div>
            <div>
              <Label>নোট</Label>
              <Textarea name="note" defaultValue={editing?.note ?? ""} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="is_active" name="is_active" defaultChecked={editing?.is_active ?? true} />
              <Label htmlFor="is_active">সক্রিয়</Label>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveSeason.isPending}>সংরক্ষণ</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "pos" | "neg" }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-semibold ${highlight === "pos" ? "text-green-600" : highlight === "neg" ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}
