import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bn } from "@/lib/format";
import { GROUP_LABEL, MONEY_HEADS, TONE_CLASS, type MoneyGroup, type MoneyKey } from "@/lib/money-heads";

/** Pieces shared by the money-in and money-out forms, so both look the same. */

export const tk = (n: number) => `৳${bn(Math.round(n))}`;

export function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-bold">{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, step = "0.01" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-11" type="number" min="0" step={step} inputMode="decimal" value={value} placeholder={placeholder ?? "০"} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Chips({ value, onChange, options, small, icon: Icon }: {
  value: string; onChange: (v: string) => void; options: Array<[string, string]>; small?: boolean; icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={`flex items-center gap-1.5 rounded-xl px-3 font-semibold transition ${small ? "h-9 text-xs" : "h-10 text-sm"} ${value === k ? "bg-primary text-primary-foreground" : "border bg-background"}`}>
          {Icon && <Icon className="h-4 w-4" />}{l}
        </button>
      ))}
    </div>
  );
}

/**
 * The account in one line: আগে + বিল − দিলেন = পরে.
 * `owe` is what the kiln owes before (negative = an advance given); for money coming in,
 * pass `incoming` and `owe` is what the other side owes the kiln.
 */
export function BalanceStrip({ prev, bill = 0, paid, advanceWord = "অগ্রিম", incoming }: {
  prev: number | null; bill?: number; paid: number; advanceWord?: string; incoming?: boolean;
}) {
  const after = (prev ?? 0) + bill - paid;
  const cells: Array<[string, string, string]> = [];
  if (prev !== null) cells.push(["আগে বাকি", prev < -0.001 ? `${advanceWord} ${tk(-prev)}` : tk(prev), ""]);
  if (bill > 0) cells.push(["+ বিল", tk(bill), ""]);
  cells.push([incoming ? "− পেলাম" : "− দিলেন", tk(paid), "text-success"]);
  cells.push([after < -0.001 ? `= ${advanceWord}` : "= বাকি থাকবে", tk(Math.abs(after)), after > 0.001 ? "text-warning" : after < -0.001 ? "text-info" : "text-success"]);
  return (
    <div className={`grid gap-1.5 rounded-2xl bg-muted p-2 text-center ${cells.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
      {cells.map(([l, v, c]) => (
        <div key={l}>
          <div className="text-[11px] font-semibold text-muted-foreground">{l}</div>
          <div className={`num text-[13px] font-bold sm:text-sm ${c}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/** Head tiles, grouped the same way everywhere (টাকা এসেছে / শ্রমিক ও বেতন / …) */
export function HeadTiles({ keys, onPick, extra }: {
  keys: MoneyKey[];
  onPick: (k: MoneyKey) => void;
  /** tiles that are links, shown after the heads of their group */
  extra?: Partial<Record<MoneyGroup, React.ReactNode>>;
}) {
  const groups: MoneyGroup[] = ["in", "labour", "material", "machine", "other", "move"];
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const heads = MONEY_HEADS.filter((h) => h.group === g && keys.includes(h.key));
        if (!heads.length && !extra?.[g]) return null;
        return (
          <div key={g}>
            <div className={`text-xs font-bold tracking-wide ${g === "in" ? "text-emerald-700 dark:text-emerald-300" : g === "move" ? "text-muted-foreground" : "text-red-700 dark:text-red-300"}`}>
              {GROUP_LABEL[g]}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {heads.map((h) => (
                <button key={h.key} type="button" onClick={() => onPick(h.key)}
                  className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-2.5 text-center transition active:scale-95">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${TONE_CLASS[h.tone]}`}><h.icon className="h-5 w-5" /></span>
                  <span className="text-[13px] font-bold leading-tight">{h.label}</span>
                </button>
              ))}
              {extra?.[g]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
