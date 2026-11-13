import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Mic, Search, Sparkles, User, Users, X, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bnDate } from "@/lib/format";
import { matchPages, navIntent, type PageLink } from "@/lib/page-catalog";
import { usePageAccess } from "@/lib/page-permissions";
import { sendToAi } from "@/components/ai-assistant-fab";

/**
 * The bar at the top of every page: type to find a page, a customer, a challan or a person, or
 * tap the mic on its right and say what to do. "সরদার পৃষ্ঠায় যাও" opens the page here; anything
 * else ("রহিমকে ৫০০ দিলাম", "হাতে নগদ কত") goes to the assistant, which opens with the answer
 * or the card. Spoken words appear in the bar and run by themselves a moment after the speaker
 * stops, unless the bar is tapped to correct them first.
 */
type Hit =
  | { kind: "page"; page: PageLink }
  | { kind: "customer"; id: string; name: string; sub: string }
  | { kind: "challan"; id: string; no: string; sub: string }
  | { kind: "person"; name: string; sub: string };

const AUTO_RUN_MS = 1400;

export function AskBar() {
  const navigate = useNavigate();
  const { can, isAdmin } = usePageAccess();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [dbHits, setDbHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [listening, setListening] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);
  const heard = useRef("");
  const runTimer = useRef<number | null>(null);

  const allowed = (p: PageLink) => p.perm === "/preferences" || (p.adminOnly ? isAdmin : can(p.perm));
  const term = q.trim();

  // ⌘K / Ctrl+K puts the cursor in the bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a tap outside closes the list
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [focused]);

  // customers, challans and people by name, a moment after typing stops
  useEffect(() => {
    if (term.length < 2 || listening) { setDbHits([]); return; }
    const id = window.setTimeout(async () => {
      setSearching(true);
      try {
        const like = `%${term.replace(/[\\%_,()]/g, " ").trim()}%`;
        const [c, ch, sd, wk] = await Promise.all([
          can("/customers") ? sdb.from("customers").select("id, name, phone, address").or(`name.ilike.${like},phone.ilike.${like}`).limit(5) : Promise.resolve({ data: [] as any[] }),
          can("/challans") ? sdb.from("sales_entries").select("id, challan_no, sale_date, customer:customers(name)").or(`challan_no.ilike.${like},vehicle_number.ilike.${like}`).limit(4) : Promise.resolve({ data: [] as any[] }),
          (supabase as any).from("sardars").select("name, kind").ilike("name", like).limit(4),
          (supabase as any).from("workers").select("name, role").ilike("name", like).limit(4),
        ]);
        const out: Hit[] = [
          ...((c.data ?? []) as any[]).map((x) => ({ kind: "customer" as const, id: x.id, name: x.name, sub: [x.phone, x.address].filter(Boolean).join(" · ") || "গ্রাহক" })),
          ...((sd.data ?? []) as any[]).map((x) => ({ kind: "person" as const, name: x.name, sub: "সরদার" })),
          ...((wk.data ?? []) as any[]).map((x) => ({ kind: "person" as const, name: x.name, sub: x.role === "daily" ? "ডেলি শ্রমিক" : x.role || "স্টাফ" })),
          ...((ch.data ?? []) as any[]).map((x) => ({ kind: "challan" as const, id: x.id, no: x.challan_no, sub: `${x.customer?.name ?? "—"} · ${bnDate(x.sale_date)}` })),
        ];
        setDbHits(out);
      } catch {
        setDbHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, listening]);

  const hits: Hit[] = useMemo(() => {
    if (!term) return [];
    const pages = matchPages(term).filter((m) => allowed(m.page)).slice(0, 4).map((m) => ({ kind: "page" as const, page: m.page }));
    return [...pages, ...dbHits].slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, dbHits, isAdmin]);

  const openPage = (p: PageLink) => {
    if (!allowed(p)) {
      toast.error(`"${p.title}" পাতা দেখার অনুমতি আপনার নেই`);
      return;
    }
    navigate({ to: p.to as any, search: (p.search ?? {}) as any });
  };

  const finish = () => {
    setQ("");
    setFocused(false);
    setActive(-1);
    inputRef.current?.blur();
  };

  const pick = (h: Hit) => {
    if (h.kind === "page") openPage(h.page);
    else if (h.kind === "customer") navigate({ to: "/customers/$id", params: { id: h.id } });
    else if (h.kind === "challan") navigate({ to: "/challans/$id", params: { id: h.id } });
    else sendToAi(`${h.name}-এর হিসাব দেখাও`);
    finish();
  };

  /** what the words ask for: a page opens here, everything else goes to the assistant */
  const run = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const page = navIntent(t);
    if (page) {
      if (allowed(page)) toast.message(`${page.title} খুলছি…`);
      openPage(page);
    } else {
      sendToAi(t);
    }
    finish();
  };

  // the mic's handlers are made once; they call the latest run (permissions load later)
  const runRef = useRef(run);
  runRef.current = run;

  const cancelAutoRun = () => {
    if (runTimer.current) window.clearTimeout(runTimer.current);
    runTimer.current = null;
    setCountdown(false);
  };

  // ---------- the mic: one sentence, shown as it is said, run a moment after it ends ----------
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "bn-BD";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      let acc = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = String(e.results[i][0]?.transcript ?? "").trim();
        if (!t) continue;
        if (acc && t.startsWith(acc)) acc = t;
        else if (!acc.endsWith(t)) acc = acc ? `${acc} ${t}` : t;
      }
      heard.current = acc;
      setQ(acc);
    };
    rec.onerror = (e: any) => {
      const err = String(e?.error ?? "");
      if (err === "not-allowed" || err === "service-not-allowed") toast.error("মাইক ব্যবহারের অনুমতি দিন (ব্রাউজারের সেটিংসে)।");
      else if (err === "network") toast.error("ইন্টারনেট ছাড়া মুখে বলা যাচ্ছে না।");
      else if (err === "no-speech") toast.message("কিছু শুনতে পাইনি, আবার মাইক চাপুন।");
    };
    rec.onend = () => {
      setListening(false);
      const said = heard.current.trim();
      if (!said) return;
      // a moment to read it; a tap on the bar stops it and lets the words be corrected
      setCountdown(true);
      runTimer.current = window.setTimeout(() => {
        runTimer.current = null;
        setCountdown(false);
        runRef.current(said);
      }, AUTO_RUN_MS);
    };
    recRef.current = rec;
    return () => {
      try { rec.abort(); } catch { /* not running */ }
      if (runTimer.current) window.clearTimeout(runTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const rec = recRef.current;
    if (!rec) {
      toast.message("এই ব্রাউজারে মুখে বলা যায় না। লিখে দিন, বা উপরের সহকারী খুলে কিবোর্ডের মাইক ব্যবহার করুন।");
      return;
    }
    cancelAutoRun();
    if (listening) {
      try { rec.stop(); } catch { /* not running */ }
      return;
    }
    heard.current = "";
    setQ("");
    setFocused(false);
    inputRef.current?.blur();
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const showList = focused && !!term && !listening && !countdown;
  const rows: Array<Hit | { kind: "ask" }> = showList ? [...hits, { kind: "ask" as const }] : [];

  return (
    <div ref={wrapRef} className="relative mx-auto mb-3 w-full max-w-3xl md:mb-5">
      <div className={`flex h-12 items-center gap-1.5 rounded-full border bg-card pl-4 pr-1.5 shadow-xs transition ${listening ? "border-destructive/60 ring-4 ring-destructive/10" : "focus-within:border-primary/40 focus-within:shadow-sm"}`}>
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(-1); setFocused(true); }}
          onFocus={() => { cancelAutoRun(); setFocused(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            else if (e.key === "Escape") { setFocused(false); inputRef.current?.blur(); }
            else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const r = active >= 0 ? rows[active] : null;
              if (r && r.kind !== "ask") pick(r);
              else run(q);
            }
          }}
          placeholder={listening ? "বলুন… যেমন: সরদার পৃষ্ঠায় যাও" : "খুঁজুন বা বলুন: পাতা, নাম, চালান, কাজ…"}
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          aria-label="খুঁজুন বা সহকারীকে বলুন"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/80"
        />
        {q && !listening && (
          <button type="button" aria-label="মুছুন" onPointerDown={(e) => e.preventDefault()} onClick={() => { cancelAutoRun(); setQ(""); inputRef.current?.focus(); }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}
        {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? "শোনা বন্ধ" : "মুখে বলুন, সহকারী করে দেবে"}
          title="মুখে বলুন, সহকারী করে দেবে"
          className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground hover:brightness-110"}`}
        >
          <Mic className="h-[18px] w-[18px]" />
          {!listening && <Sparkles className="absolute -right-0.5 -top-0.5 h-3 w-3 text-amber-400" aria-hidden />}
        </button>
      </div>

      {(listening || countdown) && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {listening ? (
            <span className="font-medium text-destructive">শুনছি — বলা থামালে নিজেই করে দেব</span>
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>করছি… ঠিক করতে চাইলে লেখায় চাপুন</span>
              <button type="button" className="font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => { cancelAutoRun(); inputRef.current?.focus(); }}>থামান</button>
            </>
          )}
        </div>
      )}

      {showList && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[60vh] overflow-y-auto rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {rows.map((r, i) => {
            const on = i === active;
            const base = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${on ? "bg-muted" : "hover:bg-muted/60"}`;
            if (r.kind === "ask") {
              return (
                <li key="ask">
                  <button type="button" className={base} onPointerDown={(e) => e.preventDefault()} onClick={() => run(q)}>
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">সহকারীকে বলুন: <b>“{term}”</b></span>
                  </button>
                </li>
              );
            }
            const icon = r.kind === "page" ? <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
              : r.kind === "customer" ? <Users className="h-4 w-4 shrink-0 text-primary" />
              : r.kind === "challan" ? <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <User className="h-4 w-4 shrink-0 text-muted-foreground" />;
            const title = r.kind === "page" ? r.page.title : r.kind === "challan" ? `চালান ${r.no}` : r.name;
            const sub = r.kind === "page" ? "পাতা খুলুন" : r.kind === "person" ? `${r.sub} · হিসাব দেখুন` : r.sub;
            return (
              <li key={`${r.kind}-${i}`}>
                <button type="button" className={base} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
                  {icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
