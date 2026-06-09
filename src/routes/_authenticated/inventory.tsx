import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, TrendingDown, TrendingUp, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "স্টক — CDB Bricks" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const stockQ = useQuery({
    queryKey: ["current-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("current_stock")
        .select("brick_type_id, brick_name, quantity")
        .order("brick_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const movementsQ = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_ledger")
        .select("id, ref_date, change, ref_type, note, brick_type:brick_types(name)")
        .order("ref_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">
          <Boxes className="h-6 w-6 text-primary" /> স্টক / ইনভেন্টরি
        </h1>
        <p className="text-sm text-muted-foreground">প্রতিটি ইটের ধরনের বর্তমান মজুদ — উৎপাদন ও বিক্রির ভিত্তিতে রিয়েল-টাইম</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">বর্তমান স্টক</CardTitle></CardHeader>
        <CardContent>
          {stockQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(stockQ.data ?? []).map((s) => (
                <div key={s.brick_type_id} className={`rounded-xl border p-4 ${Number(s.quantity) < 0 ? "border-destructive/40 bg-destructive/5" : Number(s.quantity) < 1000 ? "border-warning/40 bg-warning/5" : "bg-card"}`}>
                  <div className="text-xs text-muted-foreground">{s.brick_name}</div>
                  <div className={`mt-1 text-2xl font-bold tabular-nums ${Number(s.quantity) < 0 ? "text-destructive" : ""}`}>
                    {bn(s.quantity)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">স্টক চলাচল</CardTitle></CardHeader>
        <CardContent className="p-0">
          {movementsQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (movementsQ.data ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো মুভমেন্ট নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>ইটের ধরন</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>বিবরণ</TableHead>
                    <TableHead className="text-right">পরিবর্তন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(movementsQ.data ?? []).map((m) => {
                    const isIn = Number(m.change) > 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">{bnDate(m.ref_date)}</TableCell>
                        <TableCell>{m.brick_type?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={m.ref_type === "production" ? "default" : m.ref_type === "sale" ? "secondary" : "outline"}>
                            {m.ref_type === "production" ? "উৎপাদন" : m.ref_type === "sale" ? "বিক্রি" : m.ref_type === "return" ? "ফেরত" : "সমন্বয়"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.note ?? "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${isIn ? "text-success" : "text-destructive"}`}>
                          <span className="inline-flex items-center gap-1">
                            {isIn ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {isIn ? "+" : ""}{bn(m.change)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
