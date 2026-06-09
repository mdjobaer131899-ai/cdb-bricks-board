import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileText, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contracts/")({
  head: () => ({
    meta: [
      { title: "চুক্তি ব্যবস্থাপনা — CDB Bricks" },
      { name: "description", content: "গ্রাহকভিত্তিক চুক্তি ব্যবস্থাপনা।" },
    ],
  }),
  component: ContractsPage,
});

interface Row {
  id: string;
  contract_no: string;
  contract_type: string;
  status: string;
  start_date: string;
  booked_quantity: number;
  delivered_quantity: number;
  booked_value: number;
  customer: { id: string; name: string } | null;
}

async function fetchContracts(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, contract_no, contract_type, status, start_date, booked_quantity, delivered_quantity, booked_value, customer:customers(id, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

function ContractsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["contracts-by-customer"], queryFn: fetchContracts });

  const groups = useMemo(() => {
    const map = new Map<string, { customerId: string; customerName: string; contracts: Row[] }>();
    for (const c of q.data ?? []) {
      const key = c.customer?.id ?? "_unknown";
      if (!map.has(key)) {
        map.set(key, { customerId: key, customerName: c.customer?.name ?? "—", contracts: [] });
      }
      map.get(key)!.contracts.push(c);
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [q.data]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">চুক্তি ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">গ্রাহকভিত্তিক ফোল্ডার — গ্রাহকের নামে ক্লিক করুন</p>
        </div>
        <Button onClick={() => navigate({ to: "/contracts/new" })}>
          <Plus className="mr-2 h-4 w-4" /> নতুন চুক্তি
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-10 w-10 opacity-40" />
          কোনো চুক্তি নেই
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Accordion type="multiple" className="w-full">
              {groups.map((g) => {
                const totalBooked = g.contracts.reduce((s, c) => s + Number(c.booked_value || 0), 0);
                const totalQty = g.contracts.reduce((s, c) => s + Number(c.booked_quantity || 0), 0);
                const totalDelivered = g.contracts.reduce((s, c) => s + Number(c.delivered_quantity || 0), 0);
                return (
                  <AccordionItem key={g.customerId} value={g.customerId} className="border-b last:border-b-0">
                    <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 hover:no-underline">
                      <div className="flex flex-1 items-center justify-between gap-3 pr-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="text-left min-w-0">
                            <div className="font-semibold truncate">{g.customerName}</div>
                            <div className="text-[11px] text-muted-foreground">{bn(g.contracts.length)} টি চুক্তি • মোট ৳ {bn(totalBooked)}</div>
                          </div>
                        </div>
                        <div className="hidden text-right text-xs text-muted-foreground sm:block">
                          <div>সরবরাহ: {bn(totalDelivered)} / {bn(totalQty)} পিস</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-muted/20 px-2 pb-2">
                      <div className="space-y-1.5">
                        {g.contracts.map((c) => {
                          const remaining = Math.max(0, Number(c.booked_quantity) - Number(c.delivered_quantity));
                          return (
                            <Link
                              key={c.id}
                              to="/contracts/$id"
                              params={{ id: c.id }}
                              className="flex items-center justify-between rounded-md border bg-background px-3 py-2 hover:bg-accent"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold">{c.contract_no}</span>
                                  <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-[9px]">
                                    {c.status === "active" ? "সক্রিয়" : c.status}
                                  </Badge>
                                </div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  {bnDate(c.start_date)} • {bn(c.booked_quantity)} পিস • বাকি {bn(remaining)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right text-sm font-bold">৳ {bn(c.booked_value)}</div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
