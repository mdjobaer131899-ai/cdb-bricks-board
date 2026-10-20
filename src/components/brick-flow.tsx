import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { bn } from "@/lib/format";
import { getKilnSnapshot } from "@/services/gemini";

/** ইটের হিসাব (পিস) for the selected season: made → loaded → unloaded → sold, and the stock now. */
export function BrickFlow() {
  const snapQ = useQuery({ queryKey: ["kiln-snapshot"], queryFn: () => getKilnSnapshot(true), refetchInterval: 60_000 });
  const s = snapQ.data;
  if (!s) return <Skeleton className="h-64 rounded-2xl" />;

  const kq = (type: string) => s.kacha.filter((k) => k.entry_type === type).reduce((a, k) => a + Number(k.quantity || 0), 0);
  const sold = s.sales.filter((r) => r.status === "approved").reduce((a, r) => a + Number(r.quantity || 0), 0);
  const load = kq("load");
  const unload = kq("unload");
  const damage = kq("damage");
  const inKiln = Math.max(0, load - unload);
  const stock = s.stock.reduce((a, x) => a + Math.max(0, x.qty), 0);
  const steps = [
    { label: "কাঁচা ইট তৈরি", value: kq("production"), to: "/production-steps/kacha" },
    { label: "ভাটায় লোড", value: load, to: "/production-steps/load" },
    { label: "পোড়া ইট আনলোড", value: unload, to: "/production-steps/unload" },
    { label: "বিক্রি (চালান)", value: sold, to: "/challans" },
  ];
  const max = Math.max(1, ...steps.map((x) => x.value));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="section-label">ইটের হিসাব (পিস) · এই মৌসুম</h2>
        <Link to="/production-steps/kacha" className="inline-flex items-center gap-0.5 text-sm font-bold text-primary">উৎপাদন <ChevronRight className="h-4 w-4" /></Link>
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        {steps.map((x, i) => (
          <Link key={x.label} to={x.to as never} className="block">
            <div className="mb-1 flex items-center gap-2.5">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${i < 2 ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" : "bg-accent text-accent-foreground"}`}>{bn(i + 1)}</span>
              <span className="flex-1 text-[15px] font-semibold">{x.label}</span>
              <span className="num text-[15px] font-bold">{bn(x.value)}</span>
            </div>
            <div className="ml-[38px] h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-2 rounded-full ${i < 2 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${(x.value / max) * 100}%` }} />
            </div>
          </Link>
        ))}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <span className="text-[15px] font-bold text-emerald-900 dark:text-emerald-200">এখন পাকা ইট স্টকে</span>
          <span className="font-display num text-2xl font-extrabold text-success">{bn(stock)}</span>
        </div>
        {(damage > 0 || inKiln > 0) && (
          <p className="text-xs text-muted-foreground">
            {damage > 0 && <>নষ্ট/ভাঙা: {bn(damage)} পিস</>}
            {damage > 0 && inKiln > 0 && " · "}
            {inKiln > 0 && <>ভাটায় পুড়ছে: {bn(inKiln)} পিস</>}
          </p>
        )}
      </div>
    </section>
  );
}
