import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Factory, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports/production-cost")({
  head: () => ({ meta: [{ title: "উৎপাদন খরচ রিপোর্ট — CDB Bricks" }] }),
  component: ProductionCostPage,
});

function ProductionCostPage() {
  const prodQ = useQuery({
    queryKey: ["production-cost"],
    queryFn: async () => (await supabase.from("production_entries").select("*").order("production_date", { ascending: false }).limit(365)).data ?? [],
  });

  const monthly = useMemo(() => {
    const map = new Map<string, { qty: number; cost: number }>();
    (prodQ.data ?? []).forEach((p: any) => {
      const ym = (p.production_date as string).slice(0, 7);
      const cur = map.get(ym) ?? { qty: 0, cost: 0 };
      cur.qty += Number(p.quantity || 0);
      cur.cost += Number(p.labor_cost || 0) + Number(p.other_cost || 0);
      map.set(ym, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [prodQ.data]);

  const totalQty = (prodQ.data ?? []).reduce((s: number, p: any) => s + Number(p.quantity || 0), 0);
  const totalCost = (prodQ.data ?? []).reduce((s: number, p: any) => s + Number(p.labor_cost || 0) + Number(p.other_cost || 0), 0);
  const avgPer1000 = totalQty > 0 ? (totalCost / totalQty) * 1000 : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2"><Factory className="h-6 w-6 text-primary" /> উৎপাদন খরচ রিপোর্ট</h1>
        <p className="text-sm text-muted-foreground">প্রতি ১০০০ ইট তৈরির গড় খরচ ও মাসিক বিশ্লেষণ</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">মোট উৎপাদন</div><div className="text-xl font-bold tabular-nums">{bn(totalQty)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">মোট খরচ</div><div className="text-xl font-bold tabular-nums">৳ {bn(totalCost)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">গড় (প্রতি ১০০০ ইট)</div><div className="text-xl font-bold tabular-nums text-primary">৳ {bn(Math.round(avgPer1000))}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">মাসিক উৎপাদন বনাম খরচ</CardTitle></CardHeader>
        <CardContent className="p-0">
          {prodQ.isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          <Table>
            <TableHeader><TableRow><TableHead>মাস</TableHead><TableHead className="text-right">উৎপাদন</TableHead><TableHead className="text-right">খরচ</TableHead><TableHead className="text-right">প্রতি ১০০০</TableHead></TableRow></TableHeader>
            <TableBody>
              {monthly.map(([ym, v]) => (
                <TableRow key={ym}>
                  <TableCell>{ym}</TableCell>
                  <TableCell className="text-right tabular-nums">{bn(v.qty)}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(v.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(v.qty > 0 ? Math.round((v.cost / v.qty) * 1000) : 0)}</TableCell>
                </TableRow>
              ))}
              {monthly.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">কোনো ডেটা নেই</TableCell></TableRow>}
            </TableBody>
          </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
