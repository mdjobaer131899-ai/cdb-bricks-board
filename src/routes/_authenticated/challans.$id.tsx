import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Printer, Share2, Loader2, Pencil,
  CheckCircle2, Clock, XCircle, FileText, Calendar,
  User, Truck, Package, Receipt, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/challans/$id")({
  head: () => ({ meta: [{ title: "চালান ডিটেইলস — CDB Bricks" }] }),
  component: ChallanDetailPage,
});

function ChallanDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const entryQ = useQuery({
    queryKey: ["challan-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select(`
          id, challan_no, sale_date, quantity, unit_price, total_amount,
          status, sale_type, driver_name, vehicle_number, notes,
          custom_brick_name, approved_at, created_at, created_by, approved_by,
          customer:customers(id, name, phone, address),
          brick_type:brick_types(id, name)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const managerQ = useQuery({
    queryKey: ["challan-detail-manager", entryQ.data?.created_by, entryQ.data?.approved_by],
    enabled: !!entryQ.data,
    queryFn: async () => {
      const ids = [entryQ.data!.created_by, entryQ.data!.approved_by].filter(Boolean) as string[];
      if (!ids.length) return new Map<string, string>();
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return new Map((data ?? []).map((p) => [p.id, p.full_name || ""]));
    },
  });

  if (entryQ.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const entry = entryQ.data;
  if (!entry) return <div className="p-6 text-sm text-muted-foreground">চালান পাওয়া যায়নি।</div>;

  const brickName = entry.brick_type?.name === "অন্যান্য"
    ? (entry.custom_brick_name || "অন্যান্য")
    : (entry.brick_type?.name ?? "—");
  const isAdla = ["১ নং আদলা", "২ নং আদলা", "মিক্সার আদলা"].includes(entry.brick_type?.name ?? "");
  const unitLabel = isAdla ? "ফুট" : "পিস";
  const managerName = managerQ.data?.get(entry.created_by) ?? "—";
  const approverName = entry.approved_by ? (managerQ.data?.get(entry.approved_by) ?? "—") : null;

  const statusMeta =
    entry.status === "approved"
      ? { label: "অনুমোদিত", icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30" }
      : entry.status === "rejected"
      ? { label: "প্রত্যাখ্যাত", icon: XCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" }
      : { label: "অপেক্ষমাণ", icon: Clock, cls: "bg-warning/20 text-warning-foreground border-warning/30" };
  const StatusIcon = statusMeta.icon;

  function handlePrint() { window.print(); }

  async function handleShare() {
    if (!entry) return;
    const lines = [
      `চালান নং: ${entry.challan_no}`,
      `তারিখ: ${bnDate(entry.sale_date)}`,
      `গ্রাহক: ${entry.customer?.name ?? "—"}`,
      entry.customer?.phone ? `মোবাইল: ${entry.customer.phone}` : null,
      entry.customer?.address ? `ঠিকানা: ${entry.customer.address}` : null,
      "",
      `পণ্য: ${brickName}`,
      `পরিমাণ: ${bn(entry.quantity)} ${unitLabel}`,
      `একক মূল্য: ৳ ${bn(Number(entry.unit_price))}`,
      `মোট: ৳ ${bn(Number(entry.total_amount))}`,
      "",
      entry.driver_name ? `ড্রাইভার: ${entry.driver_name}` : null,
      entry.vehicle_number ? `গাড়ি: ${entry.vehicle_number}` : null,
      `ম্যানেজার: ${managerName}`,
      `অবস্থা: ${statusMeta.label}`,
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: `চালান ${entry.challan_no}`, text: lines });
      } else {
        await navigator.clipboard.writeText(lines);
        toast.success("চালানের তথ্য কপি করা হয়েছে");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("শেয়ার করা যায়নি");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none print:space-y-3">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/challans" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> ফিরে যান
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" /> শেয়ার
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> প্রিন্ট
          </Button>
          {isAdmin && (
            <Button asChild size="sm" variant="secondary">
              <Link to="/entries/$id/edit" params={{ id: entry.id }}>
                <Pencil className="mr-2 h-4 w-4" /> এডিট
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Invoice card */}
      <Card className="overflow-hidden border-2 print:border print:shadow-none">
        {/* Decorative header */}
        <div className="relative bg-gradient-to-br from-primary via-primary to-primary/80 px-6 py-7 text-primary-foreground">
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] [background-size:18px_18px]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
                <Receipt className="h-3.5 w-3.5" /> ইনভয়েস
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">CDB Bricks</h1>
              <p className="text-sm opacity-80">বিক্রয় চালান বিবরণী</p>
            </div>
            <div className="rounded-xl bg-primary-foreground/15 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80">
                <Hash className="h-3 w-3" /> চালান নং
              </div>
              <div className="font-mono text-xl font-bold">{entry.challan_no}</div>
              <div className="mt-1 flex items-center gap-1 text-xs opacity-80">
                <Calendar className="h-3 w-3" /> {bnDate(entry.sale_date)}
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap items-center gap-2">
            <Badge className={`border ${statusMeta.cls} hover:${statusMeta.cls}`}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" /> {statusMeta.label}
            </Badge>
            <Badge variant="outline" className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20">
              {entry.sale_type === "advance" ? "অগ্রিম বিক্রয়" : "নিয়মিত বিক্রয়"}
            </Badge>
          </div>
        </div>

        <CardContent className="space-y-6 p-6">
          {/* Customer + Delivery */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoBlock icon={User} label="গ্রাহক">
              <div className="font-semibold text-foreground">{entry.customer?.name ?? "—"}</div>
              {entry.customer?.phone && <div className="text-xs text-muted-foreground">{entry.customer.phone}</div>}
              {entry.customer?.address && <div className="text-xs text-muted-foreground">{entry.customer.address}</div>}
            </InfoBlock>
            <InfoBlock icon={Truck} label="ডেলিভারি">
              <div className="text-foreground">{entry.driver_name || "—"}</div>
              {entry.vehicle_number && <div className="text-xs text-muted-foreground">গাড়ি: {entry.vehicle_number}</div>}
            </InfoBlock>
          </div>

          <Separator />

          {/* Product line */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> পণ্যের বিবরণ
            </div>
            <div className="overflow-hidden rounded-xl border bg-muted/30">
              <div className="grid grid-cols-12 gap-2 border-b bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                <div className="col-span-6">পণ্য</div>
                <div className="col-span-2 text-right">পরিমাণ</div>
                <div className="col-span-2 text-right">একক (৳)</div>
                <div className="col-span-2 text-right">মোট (৳)</div>
              </div>
              <div className="grid grid-cols-12 items-center gap-2 px-4 py-4">
                <div className="col-span-6 font-medium">{brickName}</div>
                <div className="col-span-2 text-right tabular-nums">{bn(entry.quantity)} <span className="text-xs text-muted-foreground">{unitLabel}</span></div>
                <div className="col-span-2 text-right tabular-nums">৳ {bn(Number(entry.unit_price))}</div>
                <div className="col-span-2 text-right font-semibold tabular-nums">৳ {bn(Number(entry.total_amount))}</div>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">সর্বমোট পরিশোধযোগ্য</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-primary">৳ {bn(Number(entry.total_amount))}</div>
              </div>
              <Receipt className="h-12 w-12 text-primary/30" />
            </div>
          </div>

          {entry.notes && (
            <div className="rounded-lg border-l-4 border-primary/40 bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> মন্তব্য
              </div>
              <div className="text-sm">{entry.notes}</div>
            </div>
          )}

          <Separator />

          {/* Footer meta */}
          <div className="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
            <div>এন্ট্রি দিয়েছেন: <span className="font-medium text-foreground">{managerName}</span></div>
            {approverName && <div>অনুমোদন করেছেন: <span className="font-medium text-foreground">{approverName}</span></div>}
            {entry.approved_at && <div>অনুমোদনের সময়: <span className="font-medium text-foreground">{bnDate(entry.approved_at)}</span></div>}
            <div>তৈরি: <span className="font-medium text-foreground">{bnDate(entry.created_at)}</span></div>
          </div>

          <div className="pt-2 text-center text-xs text-muted-foreground print:pt-4">
            ধন্যবাদ — CDB Bricks
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoBlock({
  icon: Icon, label, children,
}: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="space-y-0.5 text-sm">{children}</div>
    </div>
  );
}
