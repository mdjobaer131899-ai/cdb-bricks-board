import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "info" | "destructive";
  badge?: number;
  hint?: string;
  /** 0-100 progress percent for the mini progress bar */
  progress?: number;
  /** Optional series for sparkline */
  series?: number[];
}

const tones: Record<NonNullable<Props["tone"]>, { text: string; bar: string; grad: string }> = {
  primary: { text: "text-primary", bar: "bg-primary", grad: "from-primary/20 to-transparent" },
  success: { text: "text-success", bar: "bg-success", grad: "from-success/20 to-transparent" },
  warning: { text: "text-warning", bar: "bg-warning", grad: "from-warning/20 to-transparent" },
  info: { text: "text-info", bar: "bg-info", grad: "from-info/20 to-transparent" },
  destructive: { text: "text-destructive", bar: "bg-destructive", grad: "from-destructive/20 to-transparent" },
};

export function StatCard({ label, value, icon: Icon, tone = "primary", badge, hint, progress, series }: Props) {
  const t = tones[tone];
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/80 backdrop-blur transition-all hover:shadow-elegant">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", t.grad)} />
      <div className={cn("absolute left-0 top-0 h-full w-[3px]", t.bar)} />
      <CardContent className="relative p-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70 ring-1 ring-border/60", t.text)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="truncate text-lg font-bold leading-tight tracking-tight text-foreground">{value}</p>
            {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
          </div>
        </div>


        {series && series.length > 0 && (
          <div className={cn("mt-3 h-7 w-full", t.text)}>
            <Sparkline data={series} className="h-full w-full" />
          </div>
        )}

        {progress !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div className={cn("h-full rounded-full transition-all", t.bar)} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{pct.toFixed(0)}%</p>
          </div>
        )}

        {badge !== undefined && badge > 0 && (
          <Badge variant="destructive" className="absolute right-3 top-3 animate-pulse">
            {badge.toLocaleString("bn-BD")} নতুন
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
