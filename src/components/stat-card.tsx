import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "info" | "destructive";
  badge?: number;
  hint?: string;
}

const tones: Record<NonNullable<Props["tone"]>, string> = {
  primary: "from-primary/15 to-primary/0 text-primary",
  success: "from-success/15 to-success/0 text-success",
  warning: "from-warning/20 to-warning/0 text-warning-foreground",
  info: "from-info/15 to-info/0 text-info",
  destructive: "from-destructive/15 to-destructive/0 text-destructive",
};

export function StatCard({ label, value, icon: Icon, tone = "primary", badge, hint }: Props) {
  return (
    <Card className="relative overflow-hidden border-border/60 transition-all hover:shadow-elegant hover:-translate-y-0.5">
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60", tones[tone])} />
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 shadow-sm", tones[tone].split(" ").pop())}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {badge !== undefined && badge > 0 && (
          <Badge variant="destructive" className="absolute right-3 top-3 animate-pulse">
            {badge.toLocaleString("bn-BD")} নতুন
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
