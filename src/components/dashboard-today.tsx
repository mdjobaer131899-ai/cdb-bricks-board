import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Truck, FileText, Clock, Layers, LogIn, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sdb } from "@/lib/season-db";
import { fetchCashSummary } from "@/lib/cash-queries";
import { bn, isoDate } from "@/lib/format";

function Box({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, loading, children }: { title: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="grid grid-cols-3 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : <div className="grid grid-cols-3 gap-2">{children}</div>}
      </CardContent>
    </Card>
  );
}

export function DashboardToday({ showCash = true }: { showCash?: boolean }) {
  const today = isoDate(new Date());

  const cashQ = useQuery({
    queryKey: ["dash-cash", today],
    enabled: showCash,
    queryFn: async () => {
      const [all, day] = await Promise.all([fetchCashSummary(), fetchCashSummary({ from: today, to: today })]);
      return { hand: all.net, inc: day.income, exp: day.expense };
    },
  });

  const salesQ = useQuery({
    queryKey: ["dash-sales", today],
    queryFn: async () => {
      const { data } = await sdb.from("sales_entries").select("quantity, status").eq("sale_date", today);
      const rows = data ?? [];
      return {
        bricks: rows.filter((r: any) => r.status !== "rejected").reduce((a: number, r: any) => a + Number(r.quantity || 0), 0),
        challans: rows.length,
        pending: rows.filter((r: any) => r.status === "pending").length,
      };
    },
  });

  const prodQ = useQuery({
    queryKey: ["dash-prod", today],
    queryFn: async () => {
      const { data } = await sdb.from("kacha_brick_entries").select("entry_type, quantity").eq("entry_date", today);
      const s = (t: string) => (data ?? []).filter((r: any) => r.entry_type === t).reduce((a: number, r: any) => a + Number(r.quantity || 0), 0);
      return { kacha: s("production"), load: s("load"), unload: s("unload") };
    },
  });

  const c = cashQ.data, s = salesQ.data, p = prodQ.data;
  return (
    <div className="space-y-3">
      {showCash && (
        <Section title="ক্যাশ ও আজকের আয়-ব্যয়" loading={cashQ.isLoading}>
          <Box label="হাতে নগদ" value={`৳ ${bn(c?.hand ?? 0)}`} icon={Wallet} tone="border-primary/30 bg-primary/5" />
          <Box label="আজকের আয়" value={`৳ ${bn(c?.inc ?? 0)}`} icon={ArrowDownCircle} tone="border-success/30 bg-success/5" />
          <Box label="আজকের ব্যয়" value={`৳ ${bn(c?.exp ?? 0)}`} icon={ArrowUpCircle} tone="border-destructive/30 bg-destructive/5" />
        </Section>
      )}
      <Section title="আজকের বিক্রি ও চালান" loading={salesQ.isLoading}>
        <Box label="ইট গেছে (পিস)" value={bn(s?.bricks ?? 0)} icon={Truck} tone="" />
        <Box label="চালান" value={bn(s?.challans ?? 0)} icon={FileText} tone="" />
        <Box label="অনুমোদন বাকি" value={bn(s?.pending ?? 0)} icon={Clock} tone="border-warning/30 bg-warning/5" />
      </Section>
      <Section title="আজকের উৎপাদন" loading={prodQ.isLoading}>
        <Box label="কাঁচা ইট তৈরি" value={bn(p?.kacha ?? 0)} icon={Layers} tone="" />
        <Box label="কিলিনে ঢোকানো" value={bn(p?.load ?? 0)} icon={LogIn} tone="" />
        <Box label="বের করা" value={bn(p?.unload ?? 0)} icon={LogOut} tone="" />
      </Section>
    </div>
  );
}
