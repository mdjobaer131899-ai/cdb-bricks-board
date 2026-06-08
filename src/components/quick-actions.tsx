import { Link } from "@tanstack/react-router";
import { FilePlus2, FileText, HandCoins, Receipt, UserPlus, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const actions = [
  { to: "/contracts/new" as const, label: "নতুন বুকিং", icon: FileText, tone: "from-primary/15 to-primary/5 text-primary" },
  { to: "/entries/new" as const, label: "নতুন চালান", icon: FilePlus2, tone: "from-warning/15 to-warning/5 text-warning" },
  { to: "/collections" as const, label: "নতুন কালেকশন", icon: HandCoins, tone: "from-success/15 to-success/5 text-success" },
  { to: "/" as const, label: "নতুন ব্যয়", icon: Receipt, tone: "from-destructive/15 to-destructive/5 text-destructive", hash: "expense" as const },
  { to: "/customers" as const, label: "নতুন গ্রাহক", icon: UserPlus, tone: "from-info/15 to-info/5 text-info" },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-warning" /> দ্রুত অ্যাকশন
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {actions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className={`group relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border bg-gradient-to-br ${a.tone} p-4 transition-all hover:shadow-md hover:-translate-y-0.5`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/80 ring-1 ring-border/60">
                <a.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold text-foreground">{a.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
