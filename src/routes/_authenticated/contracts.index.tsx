import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileText, CalendarClock, Wallet, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contracts/")({
  head: () => ({
    meta: [
      { title: "চুক্তি ব্যবস্থাপনা — CDB Bricks" },
      { name: "description", content: "বার্ষিক ফিক্সড রেট, স্বল্পমেয়াদী এবং নগদ চুক্তির সম্পূর্ণ ব্যবস্থাপনা।" },
      { property: "og:title", content: "চুক্তি ব্যবস্থাপনা — CDB Bricks" },
      { property: "og:description", content: "বহু-চুক্তি বুকিং ও লেজার সিস্টেম।" },
    ],
    links: [{ rel: "canonical", href: "/contracts" }],
  }),
  component: ContractsPage,
});

type ContractRow = {
  id: string;
  contract_no: string;
  contract_type: "yearly_fixed" | "short_term" | "cash";
  start_date: string;
  expiry_date: string | null;
  fixed_rate: number | null;
  booked_quantity: number;
  booked_value: number;
  advance_paid: number;
  status: "active" | "completed" | "expired" | "suspended";
  priority: number;
  customer: { id: string; name: string } | null;
  delivered_qty: number;
};

const TYPE_LABEL: Record<ContractRow["contract_type"], string> = {
  yearly_fixed: "বার্ষিক ফিক্সড",
  short_term: "স্বল্পমেয়াদী",
  cash: "নগদ",
};

const TYPE_ICON: Record<ContractRow["contract_type"], React.ComponentType<{ className?: string }>> = {
  yearly_fixed: CalendarClock,
  short_term: Wallet,
  cash: Banknote,
};

const STATUS_VARIANT: Record<ContractRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  completed: "secondary",
  expired: "destructive",
  suspended: "outline",
};

const STATUS_LABEL: Record<ContractRow["status"], string> = {
  active: "সক্রিয়",
  completed: "সম্পন্ন",
  expired: "মেয়াদোত্তীর্ণ",
  suspended: "স্থগিত",
};

async function fetchContracts(): Promise<ContractRow[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, contract_no, contract_type, start_date, expiry_date, fixed_rate, booked_quantity, booked_value, advance_paid, status, priority, customer:customers(id, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Omit<ContractRow, "delivered_qty">[];

  // Aggregate delivered quantity per contract
  const ids = rows.map((r) => r.id);
  let delivered = new Map<string, number>();
  if (ids.length) {
    const { data: sales } = await supabase
      .from("sales_entries")
      .select("contract_id, quantity")
      .in("contract_id", ids);
    for (const s of sales ?? []) {
      if (!s.contract_id) continue;
      delivered.set(s.contract_id, (delivered.get(s.contract_id) ?? 0) + Number(s.quantity));
    }
  }
  return rows.map((r) => ({ ...r, delivered_qty: delivered.get(r.id) ?? 0 }));
}

function ContractsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | ContractRow["contract_type"]>("all");
  const q = useQuery({ queryKey: ["contracts-all"], queryFn: fetchContracts });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    return filter === "all" ? all : all.filter((r) => r.contract_type === filter);
  }, [q.data, filter]);

  const totals = useMemo(() => {
    const all = q.data ?? [];
    return {
      active: all.filter((r) => r.status === "active").length,
      yearly: all.filter((r) => r.contract_type === "yearly_fixed").length,
      shortTerm: all.filter((r) => r.contract_type === "short_term").length,
      cash: all.filter((r) => r.contract_type === "cash").length,
    };
  }, [q.data]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">চুক্তি ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">বহু-চুক্তি বুকিং সিস্টেম</p>
        </div>
        <Button onClick={() => navigate({ to: "/contracts/new" })}>
          <Plus className="mr-2 h-4 w-4" /> নতুন চুক্তি
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryStat label="সক্রিয় চুক্তি" value={totals.active} />
        <SummaryStat label="বার্ষিক ফিক্সড" value={totals.yearly} />
        <SummaryStat label="স্বল্পমেয়াদী" value={totals.shortTerm} />
        <SummaryStat label="নগদ অ্যাকাউন্ট" value={totals.cash} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">চুক্তি তালিকা</CardTitle>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">সব</TabsTrigger>
              <TabsTrigger value="yearly_fixed">বার্ষিক</TabsTrigger>
              <TabsTrigger value="short_term">স্বল্প</TabsTrigger>
              <TabsTrigger value="cash">নগদ</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>চুক্তি নং</TableHead>
                  <TableHead>গ্রাহক</TableHead>
                  <TableHead>ধরন</TableHead>
                  <TableHead className="hidden md:table-cell">রেট</TableHead>
                  <TableHead>বুকিং / ডেলিভারি</TableHead>
                  <TableHead className="hidden md:table-cell">মেয়াদ</TableHead>
                  <TableHead>স্ট্যাটাস</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      কোনো চুক্তি নেই
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const Icon = TYPE_ICON[r.contract_type];
                    const used = r.booked_quantity > 0 ? Math.min(100, (r.delivered_qty / r.booked_quantity) * 100) : 0;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => navigate({ to: "/contracts/$id", params: { id: r.id } })}
                      >
                        <TableCell className="font-mono text-xs font-medium">
                          <Link
                            to="/contracts/$id"
                            params={{ id: r.id }}
                            className="text-primary underline-offset-2 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.contract_no}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium">{r.customer?.name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {TYPE_LABEL[r.contract_type]}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {r.fixed_rate ? `৳ ${bn(r.fixed_rate)}` : "—"}
                        </TableCell>
                        <TableCell>
                          {r.booked_quantity > 0 ? (
                            <div className="space-y-1 min-w-[120px]">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>{bn(r.delivered_qty)} / {bn(r.booked_quantity)}</span>
                                <span>{bn(Math.round(used))}%</span>
                              </div>
                              <Progress value={used} className="h-1.5" />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {r.expiry_date ? bnDate(r.expiry_date) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                            {STATUS_LABEL[r.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tracking-tight">{bn(value)}</div>
      </CardContent>
    </Card>
  );
}
