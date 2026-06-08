import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Users, FileText, ScrollText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";

interface CustomerHit { kind: "customer"; id: string; name: string; phone: string | null; address: string | null; }
interface ChallanHit { kind: "challan"; id: string; challan_no: string; sale_date: string; vehicle_number: string | null; customer: string; }
interface ContractHit { kind: "contract"; id: string; contract_no: string; customer: string; }
type Hit = CustomerHit | ChallanHit | ContractHit;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term) { setHits([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const like = `%${term}%`;
        const [cRes, sRes, kRes] = await Promise.all([
          supabase.from("customers").select("id, name, phone, address").or(`name.ilike.${like},phone.ilike.${like}`).limit(8),
          supabase.from("sales_entries").select("id, challan_no, sale_date, vehicle_number, customer:customers(name)").or(`challan_no.ilike.${like},vehicle_number.ilike.${like}`).limit(8),
          supabase.from("contracts").select("id, contract_no, customer:customers(name)").ilike("contract_no", like).limit(8),
        ]);
        const all: Hit[] = [
          ...((cRes.data ?? []).map((c) => ({ kind: "customer" as const, id: c.id, name: c.name, phone: c.phone, address: c.address }))),
          ...((sRes.data ?? []).map((s) => ({ kind: "challan" as const, id: s.id, challan_no: s.challan_no, sale_date: s.sale_date, vehicle_number: s.vehicle_number, customer: (s.customer as { name?: string } | null)?.name ?? "—" }))),
          ...((kRes.data ?? []).map((k) => ({ kind: "contract" as const, id: k.id, contract_no: k.contract_no, customer: (k.customer as { name?: string } | null)?.name ?? "—" }))),
        ];
        setHits(all);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [term]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    if (h.kind === "customer") navigate({ to: "/customers/$id", params: { id: h.id } });
    else if (h.kind === "challan") navigate({ to: "/challans/$id", params: { id: h.id } });
    else navigate({ to: "/contracts/$id", params: { id: h.id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden h-9 gap-2 md:flex md:w-[260px] md:justify-start text-muted-foreground">
          <Search className="h-4 w-4" />
          <span className="text-xs">গ্রাহক, চালান, চুক্তি, গাড়ি…</span>
          <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
        </Button>
      </DialogTrigger>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="search">
          <Search className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-[10%] translate-y-0 max-w-xl p-0 gap-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="নাম, ফোন, চালান নং, চুক্তি নং, গাড়ির নং…"
            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!term ? (
            <p className="p-6 text-center text-xs text-muted-foreground">টাইপ করে অনুসন্ধান শুরু করুন</p>
          ) : hits.length === 0 && !loading ? (
            <p className="p-6 text-center text-xs text-muted-foreground">কিছু পাওয়া যায়নি</p>
          ) : (
            <ul className="space-y-1">
              {hits.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    type="button"
                    onClick={() => go(h)}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <div className="mt-0.5">
                      {h.kind === "customer" && <Users className="h-4 w-4 text-primary" />}
                      {h.kind === "challan" && <FileText className="h-4 w-4 text-warning" />}
                      {h.kind === "contract" && <ScrollText className="h-4 w-4 text-info" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {h.kind === "customer" && (
                        <>
                          <div className="font-medium truncate">{h.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {h.phone ? `📱 ${h.phone}` : ""}{h.phone && h.address ? " • " : ""}{h.address ?? ""}
                          </div>
                        </>
                      )}
                      {h.kind === "challan" && (
                        <>
                          <div className="font-mono text-xs font-semibold">{h.challan_no}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {h.customer} • {bnDate(h.sale_date)}{h.vehicle_number ? ` • 🚚 ${h.vehicle_number}` : ""}
                          </div>
                        </>
                      )}
                      {h.kind === "contract" && (
                        <>
                          <div className="font-mono text-xs font-semibold">{h.contract_no}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{h.customer}</div>
                        </>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {h.kind === "customer" ? "গ্রাহক" : h.kind === "challan" ? "চালান" : "চুক্তি"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {term && hits.length > 0 && (
            <p className="px-3 py-2 text-[10px] text-muted-foreground">{bn(hits.length)} টি ফলাফল</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
