import { CalendarRange } from "lucide-react";
import { useSeason } from "@/lib/season-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SeasonSwitcher({ className }: { className?: string }) {
  const { seasons, seasonId, setSeasonId } = useSeason();
  if (seasons.length === 0) return null;

  return (
    <div className={className}>
      <Select value={seasonId ?? undefined} onValueChange={setSeasonId}>
        <SelectTrigger className="h-7 w-[120px] gap-1 text-[11px]" aria-label="মৌসুম নির্বাচন">
          <CalendarRange className="h-3 w-3 text-primary" />
          <SelectValue placeholder="মৌসুম" />
        </SelectTrigger>
        <SelectContent align="end">
          {seasons.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-[11px]">
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
