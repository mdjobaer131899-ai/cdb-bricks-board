import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  status: "done" | "current" | "upcoming";
}

interface Props {
  steps: Step[];
  className?: string;
}

export function ProcessStepBar({ steps, className }: Props) {
  return (
    <ol className={cn("flex w-full items-center gap-2", className)}>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const dotCls =
          s.status === "done"
            ? "bg-success text-success-foreground border-success"
            : s.status === "current"
            ? "bg-primary text-primary-foreground border-primary ring-4 ring-primary/20"
            : "bg-muted text-muted-foreground border-border";
        const lineCls =
          s.status === "done" ? "bg-success" : "bg-border";
        return (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition", dotCls)}>
                {s.status === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn("text-[10px] font-medium", s.status === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
                {s.label}
              </span>
            </div>
            {!isLast && <div className={cn("mb-5 h-[2px] flex-1 rounded", lineCls)} />}
          </li>
        );
      })}
    </ol>
  );
}
