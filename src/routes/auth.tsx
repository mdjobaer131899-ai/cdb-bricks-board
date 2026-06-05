import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Factory, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "লগইন — CDB Bricks" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-info/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elegant">
            <Factory className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">CDB Bricks</h1>
          <p className="text-sm text-muted-foreground">সেলস ম্যানেজমেন্ট সিস্টেম</p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">প্রবেশ করুন</CardTitle>
            <CardDescription>আপনার অ্যাকাউন্ট দিয়ে সাইন ইন বা সাইন আপ করুন</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">সাইন ইন</TabsTrigger>
                <TabsTrigger value="signup">সাইন আপ</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4"><SignInForm /></TabsContent>
              <TabsContent value="signup" className="mt-4"><SignUpForm /></TabsContent>
            </Tabs>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              প্রথম সাইন আপকারী স্বয়ংক্রিয়ভাবে অ্যাডমিন হবেন। পরবর্তী সাইন আপকারীরা ম্যানেজার হিসেবে যুক্ত হবেন।
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">ফিরে যান</Link>
        </p>
      </div>
    </div>
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

function SignUpForm() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, phone },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("অ্যাকাউন্ট তৈরি হয়েছে");
    navigate({ to: "/", replace: true });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="su-name">পূর্ণ নাম</Label>
        <Input id="su-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-email">ইমেইল</Label>
        <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-phone">ফোন (ঐচ্ছিক)</Label>
        <Input id="su-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pw">পাসওয়ার্ড</Label>
        <Input id="su-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} অ্যাকাউন্ট তৈরি করুন
      </Button>
    </form>
  );
}
