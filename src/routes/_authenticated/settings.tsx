import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";
import { PIECES_PER_TRUCK } from "@/lib/opening-adjust";
import { useCurrentUser } from "@/lib/use-current-user";
import { exportAllData } from "@/lib/csv-export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "সেটিংস — CDB Bricks" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState("");

  async function runExport(ym?: string) {
    setBusy(true);
    try {
      await exportAllData(ym);
      toast.success("ডেটা ডাউনলোড সম্পন্ন");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">সেটিংস</h2>
        <p className="text-sm text-muted-foreground">অ্যাকাউন্ট ও সিস্টেম তথ্য</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">অ্যাকাউন্ট</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">নাম</span><span className="font-medium">{data?.fullName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">ইমেইল</span><span className="font-medium">{data?.user.email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">ভূমিকা</span><span className="font-medium">{data?.role === "admin" ? "অ্যাডমিন" : data?.role === "manager" ? "ম্যানেজার" : "অনির্ধারিত (অনুমোদনের অপেক্ষায়)"}</span></div>
        </CardContent>
      </Card>

      {data?.role === "admin" && <BrickPrices />}

      <Card>
        <CardHeader><CardTitle className="text-base">ব্যাকআপ / এক্সপোর্ট</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">গ্রাহক, বিক্রয়, কালেকশন, খরচ, কাঁচামাল, শ্রমিক ও গাড়ির সব ডেটা CSV ফাইল হিসেবে নামবে।</p>
            <Button onClick={() => runExport()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              সম্পূর্ণ ডেটা CSV
            </Button>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2">নির্দিষ্ট মাসের ডেটা এক্সপোর্ট করতে চান?</p>
            <div className="flex flex-wrap items-end gap-2">
              <div><Label>মাস (YYYY-MM)</Label><Input value={month} placeholder="2026-06" onChange={(e) => setMonth(e.target.value)} className="w-40" /></div>
              <Button variant="outline" onClick={() => month ? runExport(month) : toast.error("মাস লিখুন")} disabled={busy}>
                <Download className="mr-2 h-4 w-4" /> মাসের ডেটা
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const ADLA = new Set(["১ নং আদলা", "২ নং আদলা", "মিক্সার আদলা"]);
const ORDER = ["১ নং ইট", "২ নং ইট", "পিকেট", "১ নং আদলা", "২ নং আদলা", "মিক্সার আদলা", "অন্যান্য"];

/**
 * The day's price of each brick type (brick_types.default_unit_price, per piece; আদলা per
 * foot). New challans start from it, and bricks taken from a customer's advance money start
 * from it less that customer's discount. Admins only (RLS: "Admins can manage brick types").
 */
function BrickPrices() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["brick-types-prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brick_types").select("id, name, default_unit_price").eq("is_active", true);
      if (error) throw error;
      const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
      return [...(data ?? [])].sort((a, b) => rank(a.name) - rank(b.name));
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setDraft(Object.fromEntries(q.data.map((b) => [b.id, Number(b.default_unit_price) > 0 ? String(b.default_unit_price) : ""])));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      for (const b of q.data ?? []) {
        const v = Number(draft[b.id] || 0);
        if (!(v >= 0)) throw new Error(`${b.name}-এর দাম ঠিক নেই`);
        if (v === Number(b.default_unit_price)) continue;
        const { error } = await supabase.from("brick_types").update({ default_unit_price: v }).eq("id", b.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("আজকের দাম সংরক্ষিত হয়েছে");
      qc.invalidateQueries({ queryKey: ["brick-types-active"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4 text-primary" /> ইটের আজকের দাম</CardTitle>
        <p className="text-sm text-muted-foreground">
          নতুন চালানে এই দাম আপনা থেকে বসবে। অগ্রিম টাকা থেকে ইট নিলে গ্রাহকের ছাড় বাদ যাবে। বুকিং আর গত বছরের অগ্রিমের দাম আলাদা, এখানে বদলায় না।
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(q.data ?? []).map((b) => {
              const adla = ADLA.has(b.name);
              const v = Number(draft[b.id] || 0);
              return (
                <div key={b.id} className="space-y-1">
                  <Label>{b.name} (৳ প্রতি {adla ? "ফুট" : "পিস"})</Label>
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft[b.id] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [b.id]: e.target.value }))} />
                  {!adla && v > 0 && (
                    <p className="text-xs text-muted-foreground">গাড়ি (২০০০ ইট) ৳{bn(Math.round(v * PIECES_PER_TRUCK))}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Button onClick={() => save.mutate()} disabled={save.isPending || q.isLoading}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} দাম সংরক্ষণ
        </Button>
      </CardContent>
    </Card>
  );
}
