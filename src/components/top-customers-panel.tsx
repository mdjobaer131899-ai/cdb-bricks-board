import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trophy, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn } from "@/lib/format";

interface CustomerAgg { id: string; name: string; amount: number; }

async function fetchTopCustomers(): Promise<CustomerAgg[]> {
  const { data } = await supabase
    .from("sales_entries")
    .select("total_amount, customer:customers(id, name)")
    .eq("status", "approved");
  const m = new Map<string, CustomerAgg>();
  for (const r of (data ?? []) as Array<{ total_amount: number; customer: { id: string; name: string } | null }>) {
    if (!r.customer) continue;
    const cur = m.get(r.customer.id) ?? { id: r.customer.id, name: r.customer.name, amount: 0 };
    cur.amount += Number(r.total_amount || 0);
    m.set(r.customer.id, cur);
  }
  return Array.from(m.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
}

async function fetchTopDues(): Promise<CustomerAgg[]> {
  const [salesRes, colRes] = await Promise.all([
    sdb.from("sales_entries").select("total_amount, customer:customers(id, name)").eq("status", "approved"),
    sdb.from("collections").select("amount, customer_id").is("contract_id", null),
  ]);
  const sales = new Map<string, CustomerAgg>();
  for (const r of (salesRes.data ?? []) as Array<{ total_amount: number; customer: { id: string; name: string } | null }>) {
    if (!r.customer) continue;
    const cur = sales.get(r.customer.id) ?? { id: r.customer.id, name: r.customer.name, amount: 0 };
    cur.amount += Number(r.total_amount || 0);
    sales.set(r.customer.id, cur);
  }
  const paid = new Map<string, number>();
  for (const r of (colRes.data ?? []) as Array<{ amount: number; customer_id: string | null }>) {
    if (!r.customer_id) continue;
    paid.set(r.customer_id, (paid.get(r.customer_id) ?? 0) + Number(r.amount || 0));
  }
  const out: CustomerAgg[] = [];
  for (const [id, agg] of sales) {
    const due = agg.amount - (paid.get(id) ?? 0);
    if (due > 0) out.push({ id, name: agg.name, amount: due });
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 5);
}

export function TopCustomersPanel() {
  const topQ = useQuery({ queryKey: ["top-customers"], queryFn: fetchTopCustomers });
  const dueQ = useQuery({ queryKey: ["top-dues"], queryFn: fetchTopDues });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-warning" /> টপ গ্রাহক
          </CardTitle>
          <CardDescription>মোট অনুমোদিত বিক্রয় অনুযায়ী</CardDescription>
        </CardHeader>
        <CardContent>
          {topQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : (topQ.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">ডেটা নেই</p>
          ) : (
            <ol className="space-y-1.5">
              {topQ.data!.map((c, i) => (
                <li key={c.id}>
                  <Link to="/customers/$id" params={{ id: c.id }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground"}`}>{bn(i + 1)}</span>
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                    <Badge variant="secondary" className="tabular-nums">৳ {bn(Math.round(c.amount))}</Badge>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" /> টপ বকেয়াদার
          </CardTitle>
          <CardDescription>অনুমোদিত বিক্রয় − নগদ কালেকশন</CardDescription>
        </CardHeader>
        <CardContent>
          {dueQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : (dueQ.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">কোন বকেয়া নেই 🎉</p>
          ) : (
            <ol className="space-y-1.5">
              {dueQ.data!.map((c, i) => (
                <li key={c.id}>
                  <Link to="/customers/$id" params={{ id: c.id }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/15 text-xs font-bold text-destructive">{bn(i + 1)}</span>
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                    <Badge variant="destructive" className="tabular-nums">৳ {bn(Math.round(c.amount))}</Badge>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
