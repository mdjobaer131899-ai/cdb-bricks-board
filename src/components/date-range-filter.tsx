import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isoDate } from "@/lib/format";

export type DateRange = { from: Date; to: Date };

interface DateRangeFilterProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  className?: string;
}

export function DateRangeFilter({ value, onChange, className = "" }: DateRangeFilterProps) {
  const today = new Date();
  const fromDate = value?.from ?? today;
  const toDate = value?.to ?? today;

  const fromStr = isoDate(fromDate);
  const toStr = isoDate(toDate);

  const setPreset = (type: "today" | "week" | "month" | "season") => {
    const now = new Date();
    if (type === "today") {
      onChange?.({ from: now, to: now });
    } else if (type === "week") {
      const s = new Date(now);
      s.setDate(now.getDate() - 6);
      onChange?.({ from: s, to: now });
    } else if (type === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      onChange?.({ from: s, to: e });
    } else if (type === "season") {
      const s = new Date(now.getFullYear() - 1, 9, 1);
      onChange?.({ from: s, to: now });
    }
  };

  return (
    <div className={`w-full rounded-xl border bg-background p-2.5 space-y-2 ${className}`}>
      <div className="grid grid-cols-4 gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 px-1 text-xs font-bold" onClick={() => setPreset("today")}>
          আজ
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-1 text-xs font-bold" onClick={() => setPreset("week")}>
          ৭ দিন
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-1 text-xs font-bold" onClick={() => setPreset("month")}>
          এই মাস
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-1 text-xs font-bold" onClick={() => setPreset("season")}>
          পুরো সিজন
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <Input
          type="date"
          className="h-8 w-full px-1.5 text-xs font-semibold"
          value={fromStr}
          onChange={(e) => {
            if (e.target.value) onChange?.({ from: new Date(e.target.value), to: toDate });
          }}
        />
        <span className="text-xs font-bold text-muted-foreground">থেকে</span>
        <Input
          type="date"
          className="h-8 w-full px-1.5 text-xs font-semibold"
          value={toStr}
          onChange={(e) => {
            if (e.target.value) onChange?.({ from: fromDate, to: new Date(e.target.value) });
          }}
        />
      </div>
    </div>
  );
}

export default DateRangeFilter;