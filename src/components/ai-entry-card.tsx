import { useState, type ReactNode } from "react";
import { CheckCircle, FileEdit, Loader2, Pencil, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { bn, bnDate } from "@/lib/format";
import { moneyHead, type MoneyKey } from "@/lib/money-heads";
import { METHOD_LABEL, PAY_METHOD_LIST, SELLER_HEADS, whenText, type PayMethod, type SavedRef } from "@/lib/ai-entries";

/**
 * One card under an assistant reply: what will be written, a quick change (amount, purse,
 * date, note), "খাতায় সেভ", and after saving an undo for the admin (with the password).
 * A money card can also open the full form already filled in.
 */
export type ChatEntry = {
  type: string;
  data: any;
  saved?: boolean;
  refs?: SavedRef[];
  undone?: boolean;
  challanNo?: string;
  /** the message the save returned */
  savedText?: string;
  /** saved from the full form, so the chat has no rows to undo */
  viaForm?: boolean;
};

const tk = (n: number) => `৳${bn(Math.round((Number(n) || 0) * 100) / 100)}`;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const STEP_TITLE: Record<string, string> = {
  production: "🧱 কাঁচা ইট তৈরি",
  load: "🔥 ভাটায় ঢোকানো (লোড)",
  unload: "📦 পাকা ইট বের (আনলোড)",
  damage: "⚠️ কাঁচা ইট নষ্ট",
};

export function entryTitle(e: ChatEntry): string {
  const d = e.data ?? {};
  switch (e.type) {
    case "MONEY": {
      const h = moneyHead(d.head as MoneyKey);
      return `${h?.group === "in" ? "📥" : "📤"} ${h?.label ?? "টাকা"}${d.person ? ` · ${d.person}` : ""}`;
    }
    case "SALE_CHALLAN": return "🧾 চালান";
    case "ATTENDANCE": return "🧑‍🏭 হাজিরা";
    case "KACHA_BRICK": return STEP_TITLE[d.step] ?? "🧱 উৎপাদন";
    case "VEKU_DAY": return `🚜 ${d.vekuName ?? "ভেকু"} · দিনের হিসাব`;
    case "TRANSFER": return "🔁 টাকা সরানো";
    case "DAY_CLOSE": return "🔒 দিন বন্ধ";
    case "BOOK_MARK": return "📒 কাগজের খাতায় তোলা";
    case "REMINDER": return "⏰ মনে করিয়ে দেওয়া";
    default: return "এন্ট্রি";
  }
}

/** the account before and after this entry, in words that say who owes whom */
function dueWords(v: number, side: "pay" | "receive") {
  if (Math.abs(v) < 0.5) return "কিছু বাকি নেই";
  if (side === "pay") return v > 0 ? `বাকি ${tk(v)}` : `অগ্রিম ${tk(-v)}`;
  return v > 0 ? `পাওনা ${tk(v)}` : `অগ্রিম জমা ${tk(-v)}`;
}

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className={`num min-w-0 text-right ${strong ? "font-bold" : "font-semibold"}`}>{v}</span>
    </div>
  );
}

function MethodChips({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PAY_METHOD_LIST.map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${value === m ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>
          {METHOD_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: unknown; onChange: (n: number) => void }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input className="h-9 text-sm" type="number" inputMode="decimal" min="0" value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function TextField({ label, value, onChange, type = "text", max }: { label: string; value: unknown; onChange: (v: string) => void; type?: string; max?: string }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input className="h-9 text-sm" type={type} max={max} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** the lines of a card, by entry type */
function Body({ e }: { e: ChatEntry }) {
  const d = e.data ?? {};
  switch (e.type) {
    case "MONEY": {
      const h = moneyHead(d.head as MoneyKey);
      const isIn = h?.group === "in";
      const bill = num(d.bill);
      const amount = num(d.amount);
      const unit = d.head === "veku" ? "ঘণ্টা" : d.head === "vehicle" ? "ট্রিপ" : d.unit ?? "";
      const prev = d.prevDue === null || d.prevDue === undefined ? null : num(d.prevDue);
      const side = (d.dueSide ?? "pay") as "pay" | "receive";
      const after = prev === null ? null : side === "receive" ? prev - amount : prev + bill - amount;
      return (
        <>
          {d.person && <Row k="নাম" v={<>{d.person}{d.newPerson && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">নতুন নাম</span>}</>} />}
          {d.item && <Row k="কী" v={d.item} />}
          {d.vekuKind && <Row k="কিসের" v={d.vekuKind} />}
          {d.driver && <Row k="চালক" v={d.driver} />}
          {d.paymentType === "advance" && <Row k="ধরন" v="দাদন (অগ্রিম)" />}
          {bill > 0 && <Row k="বিল" v={num(d.qty) > 0 && num(d.rate) > 0 ? `${bn(num(d.qty))} ${unit} × ${tk(num(d.rate))} = ${tk(bill)}` : num(d.qty) > 0 ? `${bn(num(d.qty))} ${unit} · ${tk(bill)}` : tk(bill)} />}
          {(amount > 0 || !bill) && <Row k={isIn ? "পেলাম" : "দিলাম"} v={tk(amount)} strong />}
          {bill > 0 && !(amount > 0) && <Row k="দিলাম" v="এখন কিছু না (বাকিতে)" />}
          <Row k={isIn ? "কোথায় এলো" : "কোথা থেকে"} v={METHOD_LABEL[(d.method ?? "cash") as PayMethod] ?? "ক্যাশ"} />
          {d.dueDate && <Row k="ফেরতের তারিখ" v={bnDate(d.dueDate)} />}
          <Row k="তারিখ" v={bnDate(d.date)} />
          {d.note && <Row k="নোট" v={d.note} />}
          {prev !== null && after !== null && (
            <div className="num mt-1 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-semibold dark:bg-slate-900">
              আগে {dueWords(prev, side)} → পরে <b>{dueWords(after, side)}</b>
            </div>
          )}
        </>
      );
    }
    case "KACHA_BRICK": {
      const qty = num(d.quantity);
      const rate = num(d.rate);
      return (
        <>
          {d.mill && <Row k="মিল" v={d.mill} />}
          {d.sardar && <Row k="সরদার" v={d.sardar} />}
          {Array.isArray(d.grades) && d.grades.length > 0
            ? d.grades.map((g: any) => <Row key={g.brickTypeId} k={g.name} v={`${bn(num(g.quantity))} পিস`} />)
            : null}
          <Row k={d.step === "unload" ? "মোট" : "পরিমাণ"} v={`${bn(qty)} পিস`} strong />
          {d.step !== "damage" && <Row k="রেট" v={rate > 0 ? `${tk(rate)} প্রতি হাজার = ${tk(Math.round((qty / 1000) * rate))}` : "চলতি রেট (প্রতি হাজার)"} />}
          {d.reason && <Row k="কারণ" v={d.reason} />}
          <Row k="তারিখ" v={bnDate(d.date)} />
        </>
      );
    }
    case "VEKU_DAY": {
      const rent = Math.round(num(d.hours) * num(d.rate) * 100) / 100;
      const out = num(d.paid) + num(d.driverPay) + num(d.auto) + num(d.khoraki);
      return (
        <>
          {d.driver && <Row k="চালক" v={d.driver} />}
          {num(d.hours) > 0 && <Row k="কাজ" v={`${bn(num(d.hours))} ঘণ্টা × ${tk(num(d.rate))} = ${tk(rent)}`} />}
          {(num(d.litres) > 0 || num(d.price) > 0) && <Row k="ডিজেল" v={`${num(d.litres) ? `${bn(num(d.litres))} লিটার · ` : ""}দাম ${tk(num(d.price))}`} />}
          {num(d.price) > 0 && <Row k="পাম্পে দিলেন" v={num(d.paid) > 0 ? tk(num(d.paid)) : "বাকিতে"} />}
          {num(d.paid) > 0 && !(num(d.price) > 0) && <Row k="ডিজেলের টাকা" v={tk(num(d.paid))} />}
          {num(d.driverPay) > 0 && <Row k="চালকের বেতন" v={tk(num(d.driverPay))} />}
          {num(d.auto) > 0 && <Row k="অটো ভাড়া (A)" v={tk(num(d.auto))} />}
          {num(d.khoraki) > 0 && <Row k="খোরাকি (H, ভাটার খরচ)" v={tk(num(d.khoraki))} />}
          {out > 0 && <Row k="আজ টাকা গেল" v={tk(out)} strong />}
          <Row k="কোথা থেকে" v={METHOD_LABEL[(d.method ?? "cash") as PayMethod] ?? "ক্যাশ"} />
          <Row k="তারিখ" v={bnDate(d.date)} />
        </>
      );
    }
    case "TRANSFER":
      return (
        <>
          <Row k="কোথা থেকে" v={METHOD_LABEL[d.from as PayMethod]} />
          <Row k="কোথায়" v={METHOD_LABEL[d.to as PayMethod]} />
          <Row k="টাকা" v={tk(num(d.amount))} strong />
          <Row k="তারিখ" v={bnDate(d.date)} />
          <div className="text-[11px] text-muted-foreground">খরচ নয়: মোট হাতে নগদ একই থাকবে, শুধু জায়গা বদলাবে।</div>
        </>
      );
    case "DAY_CLOSE": {
      const diff = num(d.counted) - num(d.expected);
      return (
        <>
          <Row k="তারিখ" v={bnDate(d.date)} />
          <Row k="হিসাবে থাকার কথা" v={tk(num(d.expected))} />
          <Row k="গুনে পেলাম" v={tk(num(d.counted))} strong />
          <Row k="গরমিল" v={Math.abs(diff) < 1 ? "মিলে গেছে ✓" : `${diff > 0 ? "বেশি" : "কম"} ${tk(Math.abs(diff))}`} />
        </>
      );
    }
    case "BOOK_MARK":
      return (
        <>
          <Row k="পাতা" v={bn(num(d.page))} strong />
          <Row k="লাইন" v={`${bn((d.keys ?? []).length)}টা খরচ`} />
          <Row k="মোট" v={tk(num(d.total))} />
          <Row k="যে তারিখ পর্যন্ত" v={bnDate(d.upTo)} />
        </>
      );
    case "REMINDER":
      return (
        <>
          <Row k="কী" v={d.text} strong />
          <Row k="কখন" v={whenText(d.at)} />
          <div className="text-[11px] text-muted-foreground">সময় হলে এই ফোনে নোটিফিকেশন আসবে (আধা ঘণ্টার মধ্যে)।</div>
        </>
      );
    default:
      return null;
  }
}

/** the quick changes a card allows */
function Editor({ e, onChange }: { e: ChatEntry; onChange: (d: any) => void }) {
  const d = e.data ?? {};
  const set = (p: Record<string, unknown>) => onChange({ ...d, ...p });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const dateField = <TextField label="তারিখ" type="date" max={today} value={d.date} onChange={(v) => set({ date: v })} />;
  switch (e.type) {
    case "MONEY":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumField label={moneyHead(d.head)?.group === "in" ? "পেলাম (৳)" : "দিলাম (৳)"} value={d.amount} onChange={(n) => set({ amount: n })} />
            {SELLER_HEADS.has(d.head) ? <NumField label="বিল (৳)" value={d.bill} onChange={(n) => set({ bill: n, qty: undefined, rate: undefined })} /> : dateField}
          </div>
          {SELLER_HEADS.has(d.head) && dateField}
          <MethodChips value={(d.method ?? "cash") as PayMethod} onChange={(m) => set({ method: m })} />
          <TextField label="নোট" value={d.note} onChange={(v) => set({ note: v })} />
        </div>
      );
    case "KACHA_BRICK":
      return (
        <div className="grid grid-cols-2 gap-2">
          {d.step !== "unload" && <NumField label="পরিমাণ (পিস)" value={d.quantity} onChange={(n) => set({ quantity: n })} />}
          {d.step !== "damage" && <NumField label="রেট (প্রতি হাজার)" value={d.rate} onChange={(n) => set({ rate: n })} />}
          {dateField}
        </div>
      );
    case "VEKU_DAY":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumField label="ঘণ্টা" value={d.hours} onChange={(n) => set({ hours: n })} />
            <NumField label="ঘণ্টায় (৳)" value={d.rate} onChange={(n) => set({ rate: n })} />
            <NumField label="পাম্পে দিলেন (৳)" value={d.paid} onChange={(n) => set({ paid: n })} />
            <NumField label="চালকের বেতন (৳)" value={d.driverPay} onChange={(n) => set({ driverPay: n })} />
          </div>
          {dateField}
          <MethodChips value={(d.method ?? "cash") as PayMethod} onChange={(m) => set({ method: m })} />
        </div>
      );
    case "TRANSFER":
      return (
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">কোথা থেকে</div>
          <MethodChips value={d.from} onChange={(m) => set({ from: m })} />
          <div className="text-[11px] text-muted-foreground">কোথায়</div>
          <MethodChips value={d.to} onChange={(m) => set({ to: m })} />
          <div className="grid grid-cols-2 gap-2"><NumField label="টাকা" value={d.amount} onChange={(n) => set({ amount: n })} />{dateField}</div>
        </div>
      );
    case "DAY_CLOSE":
      return <NumField label="ড্রয়ারে গুনে পেলাম (৳)" value={d.counted} onChange={(n) => set({ counted: n })} />;
    case "BOOK_MARK":
      return <NumField label="পাতার নম্বর" value={d.page} onChange={(n) => set({ page: Math.round(n) })} />;
    case "REMINDER":
      return <TextField label="কী মনে করাতে হবে" value={d.text} onChange={(v) => set({ text: v })} />;
    default:
      return null;
  }
}

const EDITABLE = new Set(["MONEY", "KACHA_BRICK", "VEKU_DAY", "TRANSFER", "DAY_CLOSE", "BOOK_MARK", "REMINDER"]);
const UNDOABLE = new Set(["MONEY", "KACHA_BRICK", "VEKU_DAY", "TRANSFER", "DAY_CLOSE", "REMINDER", "SALE_CHALLAN"]);

export function UndoBox({ onUndo, onCancel }: { onUndo: (password: string) => Promise<void>; onCancel?: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950/40">
      <div className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">মুছতে অ্যাডমিন পাসওয়ার্ড দিন</div>
      <div className="flex gap-1.5">
        <Input className="h-9 flex-1 text-sm" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="পাসওয়ার্ড" />
        <Button size="sm" variant="destructive" className="h-9 text-xs font-bold" disabled={!pw || busy}
          onClick={async () => { setBusy(true); try { await onUndo(pw); } finally { setBusy(false); } }}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}মুছুন
        </Button>
        {onCancel && <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={onCancel}>থাক</Button>}
      </div>
    </div>
  );
}

export function EntryCard({ entry, busy, isAdmin, onChange, onSave, onOpenForm, onUndo, onPrint }: {
  entry: ChatEntry;
  busy: boolean;
  isAdmin: boolean;
  onChange: (data: any) => void;
  onSave: () => void;
  onOpenForm?: () => void;
  onUndo: (password: string) => Promise<void>;
  onPrint?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const d = entry.data ?? {};
  const needsReason = entry.type === "DAY_CLOSE" && Math.abs(num(d.counted) - num(d.expected)) >= 1;

  return (
    <div className="mt-2.5 space-y-1.5 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-xs text-foreground shadow-xs dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-orange-200 pb-1 font-bold text-orange-700 dark:border-slate-700 dark:text-orange-400">
        <span className="min-w-0 truncate">{entryTitle(entry)}</span>
        {entry.challanNo && <span className="rounded bg-orange-200/70 px-1.5 py-0.5 text-[11px]">#{entry.challanNo}</span>}
      </div>

      {entry.type === "ATTENDANCE" ? (
        <>
          <div className="font-semibold">{bnDate(d.date)}</div>
          {(d.marks ?? []).length === 0 ? (
            <div>সবাই উপস্থিত, নতুন কিছু বদলাবে না।</div>
          ) : (
            <ul className="space-y-0.5">
              {(d.marks ?? []).map((x: any) => (
                <li key={x.workerId} className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{x.name}</span>
                  <span className={x.status === "absent" ? "font-bold text-red-700" : x.status === "half" ? "font-bold text-amber-700" : "font-bold text-emerald-700"}>
                    {x.status === "absent" ? "অনুপস্থিত" : x.status === "half" ? "হাফ দিন" : "উপস্থিত"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-muted-foreground">বাকিরা উপস্থিত ধরা হবে।</div>
        </>
      ) : entry.type === "SALE_CHALLAN" ? (
        <>
          <Row k="ক্রেতা" v={d.customerName || d.customer_name || "নগদ"} />
          <Row k="ইট" v={`${d.brickType || d.brick_name || "—"} · ${bn(num(d.quantity))} পিস`} />
          <Row k="মোট বিল" v={tk(num(d.totalAmount ?? d.total_amount))} strong />
          <Row k="জমা" v={tk(num(d.paidAmount ?? d.paid_amount))} />
          <div className="text-[11px] text-muted-foreground">সেভের পর অনুমোদন পাতায় দাম বসিয়ে অনুমোদন দিলে স্টক ও হিসাবে উঠবে।</div>
        </>
      ) : (
        <Body e={entry} />
      )}

      {!entry.saved && editing && <div className="border-t border-orange-200 pt-2 dark:border-slate-700"><Editor e={entry} onChange={onChange} /></div>}
      {!entry.saved && entry.type === "DAY_CLOSE" && (
        <TextField label={needsReason ? "গরমিলের কারণ (লিখতেই হবে)" : "নোট (ইচ্ছা হলে)"} value={d.note} onChange={(v) => onChange({ ...d, note: v })} />
      )}

      {entry.undone ? (
        <div className="w-full rounded border border-slate-300 bg-slate-100 py-1 text-center text-xs font-bold text-slate-600">মুছে ফেলা হয়েছে</div>
      ) : entry.saved ? (
        <>
          <div className="flex w-full items-center justify-center gap-1 rounded border border-emerald-300 bg-emerald-100 py-1 text-center text-xs font-bold text-emerald-700">
            <CheckCircle className="h-3.5 w-3.5" /> {entry.viaForm ? "ফর্ম থেকে খাতায় উঠেছে" : "খাতায় উঠেছে"}
          </div>
          {entry.type === "SALE_CHALLAN" && onPrint && (
            <Button size="sm" variant="outline" className="h-8 w-full text-xs font-bold" onClick={onPrint}><Printer className="mr-1 h-3.5 w-3.5" /> প্রিন্ট</Button>
          )}
          {isAdmin && !entry.viaForm && UNDOABLE.has(entry.type) && (entry.refs ?? []).length > 0 && (
            undoOpen
              ? <UndoBox onUndo={onUndo} onCancel={() => setUndoOpen(false)} />
              : <button type="button" className="w-full pt-1 text-center text-[11px] font-semibold text-rose-700 underline-offset-2 hover:underline" onClick={() => setUndoOpen(true)}>ভুল হয়েছে? মুছুন</button>
          )}
        </>
      ) : (
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" disabled={busy || (needsReason && !String(d.note ?? "").trim())} onClick={onSave}
            className="h-9 flex-1 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700">
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            {entry.type === "REMINDER" ? "রেখে দিন" : entry.type === "ATTENDANCE" ? "হাজিরা সেভ" : "খাতায় সেভ"}
          </Button>
          {EDITABLE.has(entry.type) && (
            <Button size="sm" variant="outline" className="h-9 px-2.5 text-xs font-bold" onClick={() => setEditing((x) => !x)} aria-label="বদলান">
              <Pencil className="mr-1 h-3.5 w-3.5" />{editing ? "ঠিক আছে" : "বদলান"}
            </Button>
          )}
          {onOpenForm && (
            <Button size="sm" variant="outline" className="h-9 px-2.5 text-xs font-bold" onClick={onOpenForm} aria-label="ফর্মে খুলুন">
              <FileEdit className="mr-1 h-3.5 w-3.5" />ফর্ম
            </Button>
          )}
          {entry.type === "SALE_CHALLAN" && onPrint && (
            <Button size="sm" variant="outline" className="h-9 px-2.5" onClick={onPrint} aria-label="প্রিন্ট"><Printer className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      )}
    </div>
  );
}
