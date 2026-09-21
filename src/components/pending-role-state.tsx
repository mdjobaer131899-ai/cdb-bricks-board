import { useState } from "react";
import { ShieldAlert, RefreshCw, LogOut, User, Mail, Hash, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/lib/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

interface Props {
  onRetry?: () => Promise<void> | void;
}

export function PendingRoleState({ onRetry }: Props) {
  const { data, refetch } = useCurrentUser();
  const [checking, setChecking] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function handleCheckRole() {
    try {
      setChecking(true);
      if (onRetry) {
        await onRetry();
      } else {
        await refetch();
      }
      toast.info("ভূমিকা স্ট্যাটাস রিফ্রেশ করা হয়েছে");
    } catch (err: any) {
      toast.error(err?.message || "ভূমিকা যাচাই করতে সমস্যা হয়েছে");
    } finally {
      setChecking(false);
    }
  }

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("লগ আউট সফল");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-lg border-amber-500/30 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="text-xl md:text-2xl font-bold tracking-tight">
              ভূমিকা নির্ধারিত হয়নি
            </CardTitle>
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="mr-1 h-3 w-3" />
              অপেক্ষমাণ
            </Badge>
          </div>
          <CardDescription className="mt-2 text-sm text-muted-foreground">
            আপনার অ্যাকাউন্টে এখনো কোনো অনুমতি বা ভূমিকা (অ্যাডমিন বা ম্যানেজার) বরাদ্দ করা হয়নি।
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/40 p-4 space-y-2.5 text-xs md:text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span className="font-medium text-foreground">নাম:</span>
              <span className="truncate">{data?.fullName || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="font-medium text-foreground">ইমেইল:</span>
              <span className="truncate font-mono">{data?.user.email || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-4 w-4 shrink-0" />
              <span className="font-medium text-foreground">ইউজার আইডি:</span>
              <span className="truncate font-mono text-[11px] select-all">{data?.user.id || "—"}</span>
            </div>
          </div>

          <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            <p className="font-semibold mb-1">কী করতে হবে?</p>
            <p>
              অনুগ্রহ করে সিস্টেম অ্যাডমিনের সাথে যোগাযোগ করে আপনার ইউজার আইডিতে উপযুক্ত ভূমিকা যুক্ত করতে বলুন। ভূমিকা যোগ হওয়ার পর নিচের বাটনে ক্লিক করে স্ট্যাটাস আপডেট করুন।
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button
              type="button"
              className="flex-1 gap-2"
              onClick={handleCheckRole}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              পুনরায় চেক করুন
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              লগ আউট
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
