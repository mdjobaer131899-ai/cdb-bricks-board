import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date;
  to: Date;
}

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export function DateRangeFilter({ value, onChange }: Props) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  const presets = [
    { label: "আজ", get: () => ({ from: new Date(), to: new Date() }) },
    { label: "৭ দিন", get: () => ({ from: new Date(Date.now() - 6 * 86400000), to: new Date() }) },
    { label: "৩০ দিন", get: () => ({ from: new Date(Date.now() - 29 * 86400000), to: new Date() }) },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">তারিখ ফিল্টার:</span>
      <Popover open={openFrom} onOpenChange={setOpenFrom}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-2 font-normal")}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(value.from, "dd MMM yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value.from}
            onSelect={(d) => d && (onChange({ ...value, from: d }), setOpenFrom(false))}
            className="pointer-events-auto p-3"
          />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground">→</span>
      <Popover open={openTo} onOpenChange={setOpenTo}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 font-normal">
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(value.to, "dd MMM yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value.to}
            onSelect={(d) => d && (onChange({ ...value, to: d }), setOpenTo(false))}
            className="pointer-events-auto p-3"
          />
        </PopoverContent>
      </Popover>
      <div className="ml-auto flex gap-1">
        {presets.map((p) => (
          <Button key={p.label} size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange(p.get())}>
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
