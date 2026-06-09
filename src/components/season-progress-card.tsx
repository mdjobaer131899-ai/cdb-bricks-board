import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { bn, isoDate } from "@/lib/format";
import { CalendarDays } from "lucide-react";

export function SeasonProgressCard() {
  const q = useQuery({
    queryKey: ["active-season-progress"],
    queryFn: async () => {
      const { data: s } = await supabase
        .from("seasons")
        .select("id, name, start_date, end_date, target_production")
        .eq("is_active", true)
        .maybeSingle();
      if (!s) return null;
      const to = isoDate(new Date());
      const { data: prod } = await supabase
        .from("production_entries")
        .select("quantity")
        .gte("production_date", s.start_date)
        .lte("production_date", to);
      const actual = (prod ?? []).reduce((a, r: any) => a + Number(r.quantity || 0), 0);
      const target = Number(s.target_production || 0);
      const days = Math.max(0, Math.floor((new Date(to).getTime() - new Date(s.start_date).getTime()) / 86400000)) + 1;
      return { season: s, actual, target, days };
    },
  });

  if (!q.data) return null;
  const { season, actual, target, days } = q.data;
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            {season.name}
            <Badge variant="default" className="ml-1">চলমান</Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">{bn(days)} দিন চলমান</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={pct} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">উৎপাদন অগ্রগতি</span>
          <span className="font-semibold tabular-nums">{bn(actual)} / {bn(target)} ইট ({bn(Math.round(pct))}%)</span>
        </div>
      </CardContent>
    </Card>
  );
}
