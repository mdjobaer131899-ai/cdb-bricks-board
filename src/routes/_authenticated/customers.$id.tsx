import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({ meta: [{ title: "গ্রাহকের লেনদেন — CDB Bricks" }] }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const customerQ = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, address")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const txQ = useQuery({
    queryKey: ["customer-transactions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("id, challan_no, sale_date, quantity, total_amount, status, brick_type:brick_types(name), custom_brick_name")
        .eq("customer_id", id)
        .order("sale_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = txQ.data ?? [];
  const totals = useMemo(() => {
    let approved = 0, pending = 0, count = 0;
    for (const r of rows) {
      count += 1;
      if (r.status === "approved") approved += Number(r.total_amount) || 0;
      if (r.status === "pending") pending += Number(r.total_amount) || 0;
    }
    return { approved, pending, count };
  }, [rows]);

  if (me && !isAdmin) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">এই পৃষ্ঠা শুধুমাত্র অ্যাডমিনদের জন্য।</CardContent></Card>;
  }

  if (customerQ.isLoading || txQ.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const customer = customerQ.data;
  if (!customer) return <div className="p-6 text-sm text-muted-foreground">গ্রাহক পাওয়া যায়নি।</div>;

  function handlePrint() {
    window.print();
  }

  async function handleShare() {
    if (!customer) return;
    const lines = [
      `গ্রাহক: ${customer.name}`,
      customer.phone ? `মোবাইল: ${customer.phone}` : null,
      customer.address ? `ঠিকানা: ${customer.address}` : null,
      "",
      "লেনদেন:",
      ...rows.map((r) => {
        const brick = r.brick_type?.name === "অন্যান্য" ? (r.custom_brick_name || "অন্যান্য") : (r.brick_type?.name ?? "—");
        return `${bnDate(r.sale_date)} • ${r.challan_no} • ${brick} • পরিমাণ ${bn(r.quantity)} • ৳${bn(Number(r.total_amount))} (${r.status === "approved" ? "অনুমোদিত" : r.status === "pending" ? "অপেক্ষমাণ" : "প্রত্যাখ্যাত"})`;
      }),
      "",
      `মোট অনুমোদিত: ৳${bn(totals.approved)}`,
      `মোট অপেক্ষমাণ: ৳${bn(totals.pending)}`,
    ].filter(Boolean).join("\n");

    const shareData = { title: `${customer.name} — লেনদেন`, text: lines };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(lines);
        toast.success("লেনদেনের তথ্য কপি করা হয়েছে");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("শেয়ার করা যায়নি");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/customers" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> ফিরে যান
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" /> শেয়ার
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> প্রিন্ট
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{customer.name}</CardTitle>
          <div className="text-sm text-muted-foreground space-y-0.5">
            {customer.phone && <div>মোবাইল: {customer.phone}</div>}
            {customer.address && <div>ঠিকানা: {customer.address}</div>}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">মোট লেনদেন</div>
            <div className="text-lg font-semibold tabular-nums">{bn(totals.count)} টি</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">মোট অনুমোদিত</div>
            <div className="text-lg font-semibold tabular-nums text-success">৳ {bn(totals.approved)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">অপেক্ষমাণ</div>
            <div className="text-lg font-semibold tabular-nums">৳ {bn(totals.pending)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">লেনদেনের তালিকা (তারিখ অনুসারে)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>চালান #</TableHead>
                  <TableHead>ইটের ধরন</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead className="text-right">টাকার পরিমান (৳)</TableHead>
                  <TableHead>অবস্থা</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">কোনো লেনদেন নেই</TableCell></TableRow>
                ) : rows.map((r) => {
                  const brick = r.brick_type?.name === "অন্যান্য" ? (r.custom_brick_name || "অন্যান্য") : (r.brick_type?.name ?? "—");
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{bnDate(r.sale_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.challan_no}</TableCell>
                      <TableCell className="text-muted-foreground">{brick}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(r.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(Number(r.total_amount))}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "approved" ? "default" : r.status === "pending" ? "outline" : "destructive"}>
                          {r.status === "approved" ? "অনুমোদিত" : r.status === "pending" ? "অপেক্ষমাণ" : "প্রত্যাখ্যাত"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
