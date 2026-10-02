import { Link } from "@tanstack/react-router";
import { FileText, HandCoins, Receipt, UserPlus, Zap, Banknote, Boxes, ArrowDownToLine, Flame, ArrowUpFromLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const actions = [
  { to: "/advance-sales" as const, label: "অগ্রিম বিক্রয়", icon: FileText, tone: "from-primary/15 to-primary/5 text-primary" },
  { to: "/entries/new" as const, label: "নগদ বিক্রি", icon: Banknote, tone: "from-accent/15 to-accent/5 text-accent-foreground" },
  { to: "/collections" as const, label: "নতুন কালেকশন", icon: HandCoins, tone: "from-success/15 to-success/5 text-success" },
  { to: "/cash-book" as const, label: "আয়-ব্যায়", icon: Receipt, tone: "from-destructive/15 to-destructive/5 text-destructive" },
  { to: "/customers" as const, label: "নতুন গ্রাহক", icon: UserPlus, tone: "from-info/15 to-info/5 text-info" },
  { to: "/production-steps/kacha" as const, label: "কাঁচা ইট", icon: Boxes, tone: "from-warning/15 to-warning/5 text-warning" },
  { to: "/production-steps/load" as const, label: "ইট ঢোকানো", icon: ArrowDownToLine, tone: "from-warning/15 to-warning/5 text-warning" },
  { to: "/production-steps/burn" as const, label: "ইট পোড়ানো", icon: Flame, tone: "from-warning/15 to-warning/5 text-warning" },
  { to: "/production-steps/unload" as const, label: "বের করা", icon: ArrowUpFromLine, tone: "from-warning/15 to-warning/5 text-warning" },
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
        <div className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-2 [scrollbar-width:thin]">
          {actions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className={`group flex shrink-0 flex-col items-center gap-2 transition-all hover:-translate-y-0.5`}
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full border bg-gradient-to-br ${a.tone} shadow-sm ring-1 ring-border/40 group-hover:shadow-md`}
              >
                <a.icon className="h-6 w-6" />
              </div>
              <span className="w-20 truncate text-center text-[11px] font-semibold text-foreground">{a.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
