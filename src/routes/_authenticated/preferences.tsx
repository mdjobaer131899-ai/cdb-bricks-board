import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  CalendarRange,
  ChevronRight,
  Database,
  Landmark,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { useTheme } from "@/lib/theme";
import { SeasonSwitcher } from "@/components/season-switcher";
import { GlobalSearch } from "@/components/global-search";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/preferences")({
  head: () => ({ meta: [{ title: "সেটিংস — CDB Bricks" }] }),
  component: PreferencesPage,
});

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="section-label px-1">{title}</h2>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, hint, right, chip = "bg-muted text-foreground" }: { icon: typeof Moon; label: string; hint?: string; right?: ReactNode; chip?: string }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-tight">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {right}
    </div>
  );
}

function LinkRow({ to, icon, label, hint, chip }: { to: string; icon: typeof Moon; label: string; hint?: string; chip?: string }) {
  return (
    <Link to={to as never} className="block transition hover:bg-muted/60 active:bg-muted">
      <Row icon={icon} label={label} hint={hint} chip={chip} right={<ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />} />
    </Link>
  );
}

function PreferencesPage() {
  const { data, loading } = useCurrentUser();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = data?.role === "admin";
  const name = data?.fullName || "";
  const initial = (name.trim().charAt(0) || "U").toUpperCase();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("লগ আউট সফল");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 pb-6">
      <h1 className="font-display px-1 pt-1 text-2xl font-extrabold">সেটিংস</h1>

      {/* প্রোফাইল */}
      <section className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        {loading ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <>
            <span className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink text-xl font-bold text-ink-foreground">{initial}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold leading-tight">{name || "ব্যবহারকারী"}</div>
              <div className="truncate text-sm text-muted-foreground">{data?.user.email}</div>
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  isAdmin ? "bg-accent text-accent-foreground" : "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                }`}
              >
                {isAdmin ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : <UserCog className="h-3 w-3" aria-hidden="true" />}
                {isAdmin ? "অ্যাডমিন" : data?.role === "manager" ? "ম্যানেজার" : "ভূমিকা অপেক্ষমাণ"}
              </span>
            </div>
          </>
        )}
      </section>

      <Group title="সাধারণ">
        <Row icon={Search} label="খুঁজুন" hint="গ্রাহক, চালান নং বা গাড়ির নম্বর" right={<GlobalSearch />} />
        <Row
          icon={Moon}
          label="রাতের মোড (ডার্ক)"
          hint={theme === "dark" ? "চালু আছে" : "বন্ধ আছে"}
          right={
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="রাতের মোড"
              onClick={toggle}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-stone-300 dark:bg-stone-600"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${theme === "dark" ? "left-[22px]" : "left-0.5"}`} />
            </button>
          }
        />
        <Row icon={CalendarRange} label="চলতি মৌসুম" hint="কোন মৌসুমের হিসাব দেখবেন" right={<SeasonSwitcher />} />
      </Group>

      {isAdmin && (
        <Group title="অ্যাডমিন">
          <LinkRow to="/settings" icon={SlidersHorizontal} label="সিস্টেম ও ব্যাকআপ" hint="অ্যাকাউন্ট তথ্য, ডেটা এক্সপোর্ট" chip="bg-accent text-accent-foreground" />
          <LinkRow to="/users" icon={Users} label="ইউজার ও অনুমতি" hint="ম্যানেজার যোগ, কোন পাতা দেখবে" chip="bg-accent text-accent-foreground" />
          <LinkRow to="/seasons" icon={History} label="মৌসুম ব্যবস্থাপনা" hint="নতুন মৌসুম, মৌসুম বন্ধ" chip="bg-accent text-accent-foreground" />
          <LinkRow to="/opening-balances" icon={Database} label="পূর্বের বকেয়া ও জের" chip="bg-accent text-accent-foreground" />
          <LinkRow to="/owners" icon={Landmark} label="মালিক ও ঋণ" chip="bg-accent text-accent-foreground" />
        </Group>
      )}

      <section className="space-y-2">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-card text-[15px] font-bold text-destructive transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          লগ আউট
        </button>
        <p className="text-center text-xs text-muted-foreground">সি ডি বি ব্রিকস · কাপাসিয়া, গাজীপুর</p>
      </section>
    </div>
  );
}
