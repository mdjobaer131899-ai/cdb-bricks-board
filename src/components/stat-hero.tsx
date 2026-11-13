import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * The one summary card at the top of a page (season total, total due, profit, weather now).
 * Light like the home page's hand-cash card: white card, a thin brick-red edge, an icon chip
 * with the label, one big figure, and small grey tiles under it.
 */

export type StatTone = "plain" | "in" | "out" | "money" | "advance";

const TONE: Record<StatTone, string> = {
  plain: "text-foreground",
  in: "text-success",
  out: "text-destructive",
  money: "text-primary",
  advance: "text-sky-700 dark:text-sky-300",
};

export function StatHero({ icon: Icon, label, tag, children }: {
  icon?: LucideIcon;
  label: ReactNode;
  /** a short note on the right, e.g. "এই সিজন" */
  tag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[20px] border bg-card p-4 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground">
          {Icon && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0">{label}</span>
        </span>
        {tag && <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground/80">{tag}</span>}
      </div>
      {children}
    </section>
  );
}

/** the big figure */
export function StatFigure({ children, tone = "plain", unit }: { children: ReactNode; tone?: StatTone; unit?: ReactNode }) {
  return (
    <div className={`mt-2 font-display num text-[38px] font-extrabold leading-none tracking-tight ${TONE[tone]}`}>
      {children}
      {unit && <span className="ml-1.5 text-base font-bold text-muted-foreground">{unit}</span>}
    </div>
  );
}

export function StatTiles({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) {
  return <div className={`mt-3.5 grid gap-2 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>;
}

export function StatTile({ label, value, tone = "plain", icon: Icon, to, center }: {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  /** the tile opens this page */
  to?: string;
  center?: boolean;
}) {
  const body = (
    <>
      <span className={`flex items-center gap-1 text-xs font-semibold text-muted-foreground ${center ? "justify-center" : ""}`}>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className={`num mt-0.5 block truncate text-base font-bold ${TONE[tone]}`}>{value}</span>
    </>
  );
  const cls = `block min-w-0 rounded-xl bg-muted/70 px-2.5 py-2 ${center ? "text-center" : ""}`;
  return to ? <Link to={to as never} className={`${cls} transition active:scale-[0.98]`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** a small line under the tiles */
export function StatNote({ children }: { children: ReactNode }) {
  return <p className="num mt-2 text-xs text-muted-foreground">{children}</p>;
}
