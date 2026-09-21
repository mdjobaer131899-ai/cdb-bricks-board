import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
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
