import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, TrendingUp, TrendingDown, Wallet, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "অ্যাকাউন্টস — CDB Bricks" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const tbQ = useQuery({
    queryKey: ["trial-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trial_balance").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const plQ = useQuery({
    queryKey: ["profit-loss"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_loss_summary").select("*").single();
      if (error) throw error;
      return data;
    },
  });

  const journalQ = useQuery({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, entry_no, entry_date, source, narration, journal_lines(debit, credit, account:accounts(code, name_bn, name))")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const income = Number(plQ.data?.total_income ?? 0);
  const expense = Number(plQ.data?.total_expense ?? 0);
  const profit = Number(plQ.data?.net_profit ?? 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">অ্যাকাউন্টস</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="মোট আয়" value={income} icon={TrendingUp} tone="success" />
        <SummaryCard label="মোট খরচ" value={expense} icon={TrendingDown} tone="danger" />
        <SummaryCard label="নেট প্রফিট" value={profit} icon={Wallet} tone={profit >= 0 ? "success" : "danger"} />
      </div>

      <Tabs defaultValue="tb" className="w-full">
        <TabsList>
          <TabsTrigger value="tb">ট্রায়াল ব্যালেন্স</TabsTrigger>
          <TabsTrigger value="journal">জার্নাল</TabsTrigger>
        </TabsList>

        <TabsContent value="tb">
          <Card>
            <CardHeader><CardTitle className="text-base">ট্রায়াল ব্যালেন্স</CardTitle></CardHeader>
            <CardContent>
              {tbQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>কোড</TableHead>
                        <TableHead>অ্যাকাউন্ট</TableHead>
                        <TableHead>টাইপ</TableHead>
                        <TableHead className="text-right">ডেবিট</TableHead>
                        <TableHead className="text-right">ক্রেডিট</TableHead>
                        <TableHead className="text-right">ব্যালেন্স</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tbQ.data ?? []).map((r: any) => (
                        <TableRow key={r.code}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>{r.name_bn || r.name}</TableCell>
                          <TableCell><Badge variant="outline">{r.account_type}</Badge></TableCell>
                          <TableCell className="text-right">{bn(Number(r.total_debit))}</TableCell>
                          <TableCell className="text-right">{bn(Number(r.total_credit))}</TableCell>
                          <TableCell className="text-right font-semibold">{bn(Number(r.balance))}</TableCell>
                        </TableRow>
                      ))}
                      {(tbQ.data ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">কোনো ডেটা নেই</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal">
          <Card>
            <CardHeader><CardTitle className="text-base">সর্বশেষ জার্নাল এন্ট্রি</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {journalQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> :
                (journalQ.data ?? []).map((je: any) => {
                  const lines = je.journal_lines ?? [];
                  const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
                  return (
                    <div key={je.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{je.source}</Badge>
                          <span className="font-mono text-xs text-muted-foreground">{je.entry_no}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{bnDate(je.entry_date)}</div>
                      </div>
                      {je.narration && <div className="text-sm mb-2">{je.narration}</div>}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>অ্যাকাউন্ট</TableHead>
                            <TableHead className="text-right">ডেবিট</TableHead>
                            <TableHead className="text-right">ক্রেডিট</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((l: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="font-mono text-xs text-muted-foreground mr-2">{l.account?.code}</span>
                                {l.account?.name_bn || l.account?.name}
                              </TableCell>
                              <TableCell className="text-right">{Number(l.debit) > 0 ? bn(Number(l.debit)) : "—"}</TableCell>
                              <TableCell className="text-right">{Number(l.credit) > 0 ? bn(Number(l.credit)) : "—"}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-semibold">মোট</TableCell>
                            <TableCell className="text-right font-semibold">{bn(totalD)}</TableCell>
                            <TableCell className="text-right font-semibold">{bn(totalD)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              {!journalQ.isLoading && (journalQ.data ?? []).length === 0 && (
                <p className="text-center text-muted-foreground text-sm">কোনো জার্নাল এন্ট্রি নেই</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-600" : "text-destructive";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-lg font-bold ${color}`}>৳ {bn(value)}</div>
        </div>
      </CardContent>
    </Card>
  );
}
