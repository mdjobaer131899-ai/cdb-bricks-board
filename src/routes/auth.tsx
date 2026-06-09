import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Factory, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "লগইন — CDB Bricks" },
      { name: "description", content: "CDB Bricks সেলস ম্যানেজমেন্ট সিস্টেমে সাইন ইন করুন — চালান, বিক্রয় ও গ্রাহক ব্যবস্থাপনার সম্পূর্ণ প্ল্যাটফর্ম।" },
      { property: "og:title", content: "লগইন — CDB Bricks" },
      { property: "og:description", content: "CDB Bricks সেলস ম্যানেজমেন্ট সিস্টেমে সাইন ইন করুন — চালান, বিক্রয় ও গ্রাহক ব্যবস্থাপনার সম্পূর্ণ প্ল্যাটফর্ম।" },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-info/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full border border-primary/30 bg-primary/10 px-5 py-2 text-sm font-semibold text-primary shadow-sm">
            আসসালামু আলাইকুম
          </div>
        </div>
        <div className="text-center">
          <BrandLogo className="mx-auto h-20 w-20 drop-shadow-md" />
          <h1 className="mt-3 bg-gradient-to-r from-[#e85d3a] via-[#f7931e] to-[#c2410c] bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">সি ডি বি ব্রিকস</h1>
          <p className="text-sm text-muted-foreground">কাপাসিয়া, গাজীপুর</p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">প্রবেশ করুন</CardTitle>
            <CardDescription>আপনার ইমেইল ও পাসওয়ার্ড দিয়ে সাইন ইন করুন</CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm />
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              নতুন অ্যাকাউন্ট তৈরি করতে এডমিনের সাথে যোগাযোগ করুন।
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">ফিরে যান</Link>
        </p>
      </div>
    </main>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("সফলভাবে লগইন হয়েছে");
    navigate({ to: "/", replace: true });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="si-email">ইমেইল</Label>
        <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-pw">পাসওয়ার্ড</Label>
        <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} সাইন ইন
      </Button>
    </form>
  );
}
