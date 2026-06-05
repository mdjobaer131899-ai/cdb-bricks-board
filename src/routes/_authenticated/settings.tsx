import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "সেটিংস — CDB Bricks" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useCurrentUser();
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
          <div className="flex justify-between"><span className="text-muted-foreground">ভূমিকা</span><span className="font-medium">{data?.role === "admin" ? "অ্যাডমিন" : "ম্যানেজার"}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
