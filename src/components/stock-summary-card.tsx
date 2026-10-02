import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";

export function StockSummaryCard() {
  const q = useQuery({
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-primary" /> বর্তমান স্টক
        </CardTitle>
        <Link to="/production-steps/unload" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          সব দেখুন <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(q.data ?? []).slice(0, 8).map((s) => {
              const qty = Number(s.quantity);
              const tone = qty < 0 ? "border-destructive/40 bg-destructive/5" : qty < 1000 ? "border-warning/40 bg-warning/5" : "";
              return (
                <div key={s.brick_type_id} className={`rounded-lg border p-2 ${tone}`}>
                  <div className="text-[11px] text-muted-foreground truncate">{s.brick_name}</div>
                  <div className={`text-base font-bold tabular-nums ${qty < 0 ? "text-destructive" : ""}`}>{bn(qty)}</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
