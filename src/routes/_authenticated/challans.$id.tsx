import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { ArrowLeft, Printer, Share2, Loader2, Pencil, Download, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { InvoiceDocument, type InvoiceData } from "@/components/invoice-document";
import { shareNodeAsImage, downloadNodeAsImage, printNode } from "@/lib/share-invoice";
import { openWhatsApp } from "@/lib/whatsapp";
import { bn } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/challans/$id")({
  head: () => ({ meta: [{ title: "চালান ডিটেইলস — CDB Bricks" }] }),
  component: ChallanDetailPage,
});

function ChallanDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const invoiceRef = useRef<HTMLDivElement>(null);

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
    queryKey: ["challan-detail-manager", entryQ.data?.created_by],
    enabled: !!entryQ.data,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").eq("id", entryQ.data!.created_by).maybeSingle();
      return data?.full_name ?? "";
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

  const deliverLines = [
    entry.driver_name ? `ড্রাইভার: ${entry.driver_name}` : "",
    entry.vehicle_number ? `গাড়ি: ${entry.vehicle_number}` : "",
  ].filter(Boolean);

  const invoiceData: InvoiceData = {
    invoiceNo: entry.challan_no,
    date: entry.sale_date,
    customerRef: entry.customer?.phone ?? null,
    salesPerson: managerQ.data ?? "—",
    paymentTerms: entry.sale_type === "advance" ? "অগ্রিম বিক্রয়" : "নিয়মিত বিক্রয়",
    to: {
      name: entry.customer?.name ?? "—",
      lines: [
        entry.customer?.phone ?? "",
        entry.customer?.address ?? "",
      ].filter(Boolean),
    },
    deliverTo: deliverLines.length ? { name: entry.customer?.name ?? "—", lines: deliverLines } : null,
    items: [{
      code: entry.brick_type?.id?.slice(0, 6).toUpperCase() ?? null,
      description: brickName,
      subDescription: entry.notes || (entry.status === "approved" ? "Dispatched" : null),
      quantity: Number(entry.quantity),
      unit: unitLabel,
      price: Number(entry.unit_price),
      total: Number(entry.total_amount),
    }],
    subtotal: Number(entry.total_amount),
    total: Number(entry.total_amount),
  };

  async function handleShare() {
    if (!invoiceRef.current) return;
    await shareNodeAsImage(invoiceRef.current, {
      title: `চালান ${entry!.challan_no}`,
      text: `${entry!.customer?.name ?? ""} — চালান নং ${entry!.challan_no}`,
      filename: `invoice-${entry!.challan_no}.png`,
    });
  }

  async function handleDownload() {
    if (!invoiceRef.current) return;
    await downloadNodeAsImage(invoiceRef.current, `invoice-${entry!.challan_no}.png`);
  }

  function handlePrint() {
    if (!invoiceRef.current) return;
    printNode(invoiceRef.current, `চালান ${entry!.challan_no}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/challans" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> ফিরে যান
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" /> শেয়ার
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openWhatsApp(
                entry!.customer?.phone,
                `আপনার চালান ${entry!.challan_no} ${entry!.status === "approved" ? "অনুমোদিত হয়েছে" : "তৈরি হয়েছে"}। পরিমাণ: ${bn(entry!.quantity)} ${entry!.brick_type?.name ?? ""}, মূল্য: ৳ ${bn(entry!.total_amount)}। — CDB Bricks`
              )
            }
          >
            <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" /> ডাউনলোড
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

      <InvoiceDocument ref={invoiceRef} data={invoiceData} />
    </div>
  );
}
