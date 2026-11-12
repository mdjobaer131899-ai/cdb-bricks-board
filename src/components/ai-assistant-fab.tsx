import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Send, Sparkles, X, Bot, User, Camera, Paperclip, FileText, Volume2, VolumeX, Share2, Save, Loader2, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  processBrickFieldCommand, saveAiActionToDatabase, startRoutineAsk, getAiHistory, setAiHistory,
  type AIAttachment, type AskKind,
} from "../services/gemini";
import { EntryCard, UndoBox, entryTitle, type ChatEntry } from "./ai-entry-card";
import { ExpenseEntryDialog, type ExpenseInitial, type HeadKey } from "./expense-entry";
import { IncomeEntryDialog, type IncomeInitial, type IncomeKey } from "./income-entry";
import { undoSaved } from "@/lib/ai-entries";
import { moneyHead } from "@/lib/money-heads";
import { useCurrentUser } from "@/lib/use-current-user";
import { useBackToClose } from "@/lib/back-close";
import { toast } from "sonner";
import { bn } from "@/lib/format";

export const OPEN_AI_CHAT_EVENT = "open-ai-chat-drawer";
/** opens the chat on a check-in question, e.g. today's attendance (detail: { ask: "attendance" }) */
export const AI_ASK_EVENT = "ai-chat-ask";
export type AiAsk = AskKind;
const ASK_KINDS: AskKind[] = ["attendance", "kacha", "day_close", "loans", "morning", "reminders"];

/** open the assistant on a check-in from anywhere (home tasks, notifications) */
export function askAi(ask: AiAsk) {
  window.dispatchEvent(new CustomEvent(AI_ASK_EVENT, { detail: { ask } }));
}

interface Message {
  role: "user" | "assistant";
  text: string;
  imagePreview?: string;
  fileName?: string;
  /** the cards under an assistant reply */
  entries?: ChatEntry[];
  /** one-tap answers under an assistant message */
  chips?: string[];
  /** a person's account was shown: send it on WhatsApp */
  share?: { phone: string; name: string };
  /** "শেষ এন্ট্রি মুছে দাও": which card to undo [message, entry] */
  undoTarget?: [number, number];
}

const WELCOME: Message = {
  role: "assistant",
  text: "আসসালামু আলাইকুম! আমি CDB Bricks AI সহকারী। হিসাব জানতে প্রশ্ন করুন, অথবা মুখে বলে এন্ট্রি দিন (একসাথে কয়েকটাও)। খাতার পাতা বা রসিদের ছবিও পাঠাতে পারেন।",
};

/* ---------- today's chat is kept on this phone, so a reload or a notification does not lose it ---------- */
const CHAT_KEY = "cdb-ai-chat-v2";
const SPEAK_KEY = "cdb-ai-speak";
const dhakaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

function loadChat(): Message[] | null {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v?.day !== dhakaToday() || !Array.isArray(v.messages) || !v.messages.length) return null;
    setAiHistory(v.history);
    return v.messages as Message[];
  } catch {
    return null;
  }
}
function storeChat(messages: Message[]) {
  try {
    const keep = messages.slice(-50).map(({ imagePreview: _img, ...m }) => m);
    localStorage.setItem(CHAT_KEY, JSON.stringify({ day: dhakaToday(), messages: keep, history: getAiHistory() }));
  } catch {
    // storage full or blocked: the chat still works for this visit
  }
}

/* ---------- reading a reply aloud ---------- */
function speakText(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const clean = text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/[•·→]/g, ",")
      .replace(/৳\s?/g, "")
      .slice(0, 1500);
    const u = new SpeechSynthesisUtterance(clean);
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("bn"));
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "bn-BD";
    u.rate = 1;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

/* ---------- sending an answer on ---------- */
function shareText(text: string, phone?: string) {
  const body = `${text}\n\n— সি ডি বি ব্রিকস`;
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const intl = digits.startsWith("880") ? digits : digits.startsWith("01") ? `88${digits}` : digits;
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(body)}`, "_blank");
    return;
  }
  if (navigator.share) {
    void navigator.share({ text: body }).catch(() => undefined);
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, "_blank");
}

const UNDO_WORDS = /(মুছে দাও|মুছে দিন|মুছে ফেলো|মুছে ফেল|ডিলিট কর|ডিলিট দাও|বাতিল কর)/;

/** the open money form for a card: which head and what to fill in */
type FormOpen =
  | { kind: "out"; head: HeadKey; partyId: string | null; initial: ExpenseInitial; at: [number, number] }
  | { kind: "in"; head: IncomeKey; partyId: string | null; initial: IncomeInitial; at: [number, number] };

function printChallan(d: any, challanNo?: string) {
  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>চালান রসিদ - CDB Bricks</title>
        <style>
          body { font-family: sans-serif; padding: 30px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #ea580c; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 26px; font-weight: bold; color: #ea580c; margin: 0; }
          .sub { font-size: 14px; color: #555; margin-top: 4px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ccc; padding: 10px; text-align: left; font-size: 15px; }
          th { background: #fff7ed; }
          .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">সি ডি বি ব্রিকস (CDB Bricks)</h1>
          <div class="sub">কাপাসিয়া, গাজীপুর | ক্যাশ মেমো ও ডেলিভারি চালান</div>
        </div>
        <div class="row">
          <div><b>চালান নং:</b> ${challanNo || "অটো"}</div>
          <div><b>তারিখ:</b> ${new Date().toLocaleDateString("bn-BD")}</div>
        </div>
        <div class="row">
          <div><b>ক্রেতার নাম:</b> ${d?.customerName || d?.customer_name || "নগদ ক্রেতা"}</div>
          <div><b>গাড়ি নং:</b> ${d?.vehicleNumber || d?.vehicle_number || "N/A"}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ইটের বিবরণ</th>
              <th>পরিমাণ (পিস)</th>
              <th>মোট টাকা</th>
              <th>নগদ জমা</th>
              <th>বাকি টাকা</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${d?.brickType || d?.brick_name || "১ নম্বর ইট"}</td>
              <td>${d?.quantity || 0} টি</td>
              <td>৳${d?.totalAmount ?? d?.total_amount ?? 0}</td>
              <td>৳${d?.paidAmount ?? d?.paid_amount ?? 0}</td>
              <td><b>৳${d?.dueAmount ?? d?.due_amount ?? 0}</b></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div>ক্রেতার স্বাক্ষর</div>
          <div>ম্যানেজার / কর্তৃপক্ষের স্বাক্ষর</div>
        </div>
        <script>window.print();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export function AiAssistantFab() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [isOpen, setIsOpen] = useState(false);
  // the phone's back button closes the chat, not the page under it
  useBackToClose(isOpen, () => setIsOpen(false));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [attachment, setAttachment] = useState<(AIAttachment & { previewUrl?: string }) | null>(null);
  const [form, setForm] = useState<FormOpen | null>(null);
  const [speakOn, setSpeakOn] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);
  const speakRef = useRef(false);
  speakRef.current = speakOn;

  // today's chat comes back after a reload
  useEffect(() => {
    const saved = loadChat();
    if (saved) setMessages(saved);
    try { setSpeakOn(localStorage.getItem(SPEAK_KEY) === "1"); } catch { /* storage blocked */ }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (restored.current) storeChat(messages);
  }, [messages]);

  const addAssistant = (m: Omit<Message, "role">) => {
    setMessages((prev) => [...prev, { role: "assistant", ...m }]);
    if (speakRef.current && m.text) speakText(m.text);
  };

  useEffect(() => {
    const handleOpenEvent = () => setIsOpen((prev) => !prev);
    window.addEventListener(OPEN_AI_CHAT_EVENT, handleOpenEvent);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, handleOpenEvent);
  }, []);

  // a check-in: the assistant opens and asks first (from a home task or a phone notification)
  const startAsk = async (ask: AiAsk) => {
    if (!ASK_KINDS.includes(ask)) return;
    setIsOpen(true);
    setLoading(true);
    try {
      const q = await startRoutineAsk(ask);
      addAssistant({ text: q.text, chips: q.chips });
    } catch {
      addAssistant({ text: "খাতা পড়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const onAsk = (e: Event) => void startAsk(((e as CustomEvent).detail?.ask ?? "attendance") as AiAsk);
    window.addEventListener(AI_ASK_EVENT, onAsk);
    // opened from a notification: /?ask=attendance (kacha, day_close, loans, morning, reminders)
    try {
      const url = new URL(window.location.href);
      const ask = url.searchParams.get("ask") as AiAsk | null;
      if (ask) {
        url.searchParams.delete("ask");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        if (ASK_KINDS.includes(ask)) setTimeout(() => void startAsk(ask), 600);
      }
    } catch {
      // ignore
    }
    return () => window.removeEventListener(AI_ASK_EVENT, onAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isOpen]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = "bn-BD";
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        handleSendRef.current?.(transcript);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.message("ভয়েস টাইপিংয়ের জন্য মোবাইলের কিবোর্ডের মাইক বাটনটি ব্যবহার করুন।");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const toggleSpeak = () => {
    const next = !speakOn;
    setSpeakOn(next);
    try { localStorage.setItem(SPEAK_KEY, next ? "1" : "0"); } catch { /* storage blocked */ }
    if (!next) { try { window.speechSynthesis?.cancel(); } catch { /* none */ } }
    toast.message(next ? "এখন থেকে উত্তর পড়ে শোনাব" : "উত্তর আর পড়ে শোনাব না");
  };

  // ছবি বা ফাইল সিলেক্ট করলে সেটিকে Base64-এ রূপান্তর করা
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("ফাইলটির সাইজ ১০ মেগাবাইটের কম হতে হবে।");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64Data = resultStr.split(",")[1] || "";
      setAttachment({
        mimeType: file.type || "image/jpeg",
        base64Data,
        fileName: file.name,
        previewUrl: file.type.startsWith("image/") ? resultStr : undefined,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /** the last card saved from this chat that can still be undone */
  const lastSaved = (list: Message[]): [number, number] | null => {
    for (let i = list.length - 1; i >= 0; i--) {
      const es = list[i].entries ?? [];
      for (let j = es.length - 1; j >= 0; j--) {
        if (es[j].saved && !es[j].undone && !es[j].viaForm && (es[j].refs ?? []).length) return [i, j];
      }
    }
    return null;
  };

  const handleSend = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    if ((!textToSend && !attachment) || loading) return;

    const currentAttachment = attachment;
    const userMsg: Message = {
      role: "user",
      text: textToSend || (currentAttachment ? `📎 স্ক্যান করা ফাইল: ${currentAttachment.fileName}` : ""),
      imagePreview: currentAttachment?.previewUrl,
      fileName: currentAttachment?.fileName,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachment(null);

    // "শেষ এন্ট্রি মুছে দাও": the last card this chat saved, with the password box
    if (!currentAttachment && UNDO_WORDS.test(textToSend) && textToSend.length < 60) {
      const target = lastSaved(messages);
      if (!target) {
        addAssistant({ text: "এই চ্যাট থেকে সেভ হওয়া কোনো এন্ট্রি পাইনি। অন্য এন্ট্রি মুছতে ক্যাশ বইয়ে সেই লাইনে চাপুন।" });
      } else if (!isAdmin) {
        addAssistant({ text: "এন্ট্রি মুছতে পারেন শুধু অ্যাডমিন। অ্যাডমিনকে বলুন।" });
      } else {
        const e = messages[target[0]].entries![target[1]];
        addAssistant({ text: `শেষ সেভ হওয়া এন্ট্রি: ${entryTitle(e)}। মুছতে নিচে অ্যাডমিন পাসওয়ার্ড দিন।`, undoTarget: target });
      }
      return;
    }

    setLoading(true);
    try {
      const res: any = await processBrickFieldCommand(textToSend, currentAttachment);
      const replyText = res?.reply || res?.reply_bn || res?.message || (typeof res === "string" ? res : "");
      const list: ChatEntry[] = Array.isArray(res?.entries)
        ? res.entries.map((x: any) => ({ type: x.type, data: x.data }))
        : res?.type && res.type !== "QUERY" && res.type !== "UNKNOWN" && res.type !== "ENTRIES" && res.data
          ? [{ type: res.type, data: res.data }]
          : [];
      addAssistant({ text: replyText, entries: list.length ? list : undefined, chips: res?.chips, share: res?.share });
    } catch (err: any) {
      console.error("Chat Error:", err);
      const rawMessage =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "TimeoutError"
          : err instanceof Error && err.message.trim()
            ? err.message.trim()
            : "অজানা ত্রুটি";
      const normalized = rawMessage.toLowerCase();
      const errorMessage =
        normalized.includes("too many requests") ||
        normalized.includes("rate limit") ||
        normalized.includes("quota") ||
        normalized.includes("429") ||
        normalized.includes("overloaded") ||
        normalized.includes("temporarily unavailable")
          ? "AI সার্ভিসে এই মুহূর্তে খুব বেশি অনুরোধ হচ্ছে। একটু পরে আবার চেষ্টা করুন।"
          : normalized.includes("timeout") || normalized.includes("timed out")
            ? "উত্তর তৈরি করতে বেশি সময় লাগছে। প্রশ্নটি ছোট করে আবার চেষ্টা করুন।"
            : normalized.includes("model_busy") || normalized.includes("busy")
              ? "AI সার্ভিস এখন ব্যস্ত। একটু পরে আবার চেষ্টা করুন।"
              : "দুঃখিত, AI উত্তর দিতে পারেনি। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
      addAssistant({ text: errorMessage });
    } finally {
      setLoading(false);
    }
  };
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const patchEntry = (mi: number, ei: number, p: Partial<ChatEntry>) =>
    setMessages((prev) => prev.map((m, i) => (i === mi && m.entries ? { ...m, entries: m.entries.map((e, j) => (j === ei ? { ...e, ...p } : e)) } : m)));

  /** saves one card; returns whether it went in */
  const saveEntry = async (mi: number, ei: number, quiet = false): Promise<boolean> => {
    const e = messages[mi]?.entries?.[ei];
    if (!e || e.saved) return true;
    setSavingKey(`${mi}:${ei}`);
    try {
      const res: any = await (saveAiActionToDatabase as any)(e.type, e.data);
      if (res && res.success === false) {
        toast.error(res.message || "সেভ করতে সমস্যা হয়েছে।");
        return false;
      }
      if (!quiet) toast.success(res?.message || "খাতায় সেভ হয়েছে");
      // not a useMutation, so the pages are refreshed here
      void queryClient.invalidateQueries();
      patchEntry(mi, ei, { saved: true, refs: res?.refs ?? [], challanNo: res?.challanNo, savedText: res?.message });
      return true;
    } catch (err: any) {
      toast.error(`${quiet ? `${entryTitle(e)}: ` : ""}সেভ হয়নি: ${err?.message ?? err}`);
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const saveAll = async (mi: number) => {
    const es = messages[mi]?.entries ?? [];
    let ok = 0;
    let bad = 0;
    for (let j = 0; j < es.length; j++) {
      if (es[j].saved) continue;
      if (await saveEntry(mi, j, true)) ok++;
      else bad++;
    }
    if (ok) toast.success(`${bn(ok)}টা এন্ট্রি খাতায় উঠেছে${bad ? `, ${bn(bad)}টা হয়নি` : ""}`);
  };

  const undoEntry = async (mi: number, ei: number, password: string) => {
    const e = messages[mi]?.entries?.[ei];
    if (!e) return;
    try {
      const msg = await undoSaved(e.refs ?? [], password);
      toast.success(msg);
      void queryClient.invalidateQueries();
      patchEntry(mi, ei, { undone: true });
    } catch (err: any) {
      toast.error(err?.message ?? String(err));
    }
  };

  /** a money card opens the full form, already filled in */
  const openForm = (mi: number, ei: number) => {
    const e = messages[mi]?.entries?.[ei];
    if (!e || e.type !== "MONEY") return;
    const d = e.data ?? {};
    const head = moneyHead(d.head);
    if (!head) return;
    if (head.group === "in") {
      setForm({
        kind: "in", head: d.head as IncomeKey, partyId: d.personId ?? null, at: [mi, ei],
        initial: { party: d.head === "loanIn" ? d.person : undefined, amount: d.amount, method: d.method, date: d.date, note: d.note, dueDate: d.dueDate },
      });
    } else {
      const typed = ["raw", "parts", "vehicle", "land", "clean", "loanGive"].includes(d.head);
      setForm({
        kind: "out", head: d.head as HeadKey, partyId: d.personId ?? null, at: [mi, ei],
        initial: {
          party: typed && !d.personId ? d.person : undefined,
          paid: d.amount, qty: d.qty, rate: d.rate, total: d.bill,
          what: ["parts", "misc", "asset"].includes(d.head) ? d.item : undefined,
          kindName: ["raw", "parts"].includes(d.head) ? d.item : undefined,
          vekuKind: d.vekuKind, driver: d.driver, method: d.method, date: d.date, note: d.note, dueDate: d.dueDate,
        },
      });
    }
  };
  const formDone = () => {
    if (form) patchEntry(form.at[0], form.at[1], { saved: true, viaForm: true });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hidden md:flex fixed bottom-6 right-6 z-50 h-14 w-14 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl hover:bg-orange-700 transition-all duration-300 focus:outline-none"
        title="CDB AI সহকারী"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-7 w-7 animate-pulse" />}
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
          />

          <Card className="fixed bottom-20 md:bottom-24 right-3 left-3 md:left-auto md:right-6 z-50 md:w-[430px] h-[min(600px,calc(100dvh-7rem))] flex flex-col shadow-2xl border-2 border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-5">
            <CardHeader className="bg-gradient-to-r from-slate-900 via-[#3b150a] to-slate-900 text-white p-3.5 flex flex-row items-center justify-between space-y-0 border-b border-orange-500/30">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-extrabold text-white">CDB Bricks AI ব্রেন</CardTitle>
                  <p className="text-[11px] text-amber-300/90 font-medium">হিসাব, এন্ট্রি, রসিদ স্ক্যান ও রুটিন সহকারী</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/15 h-8 w-8 rounded-full"
                  onClick={toggleSpeak}
                  aria-label={speakOn ? "উত্তর পড়ে শোনানো বন্ধ" : "উত্তর পড়ে শোনাও"}
                  title={speakOn ? "উত্তর পড়ে শোনানো বন্ধ" : "উত্তর পড়ে শোনাও"}
                >
                  {speakOn ? <Volume2 className="h-4 w-4 text-amber-300" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/15 h-8 w-8 rounded-full"
                  onClick={() => {
                    setMessages([WELCOME]);
                    setAiHistory([]);
                  }}
                  aria-label="নতুন করে শুরু"
                  title="নতুন করে শুরু"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/15 h-8 w-8 rounded-full"
                  onClick={() => setIsOpen(false)}
                  aria-label="বন্ধ"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 text-sm bg-slate-50 dark:bg-slate-950">
              {messages.map((m, idx) => {
                const pending = (m.entries ?? []).filter((e) => !e.saved).length;
                return (
                  <div
                    key={idx}
                    className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "assistant" && (
                      <div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 max-w-[86%] leading-relaxed shadow-xs ${
                        m.role === "user"
                          ? "bg-orange-700 text-white rounded-br-none font-medium"
                          : "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-tl-none border border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      {m.imagePreview && (
                        <img
                          src={m.imagePreview}
                          alt="স্ক্যান করা ছবি"
                          className="mb-2 max-h-40 rounded-lg border border-white/20 object-cover"
                        />
                      )}
                      {!m.imagePreview && m.fileName && (
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs bg-black/20 px-2 py-1 rounded">
                          <FileText className="h-3.5 w-3.5" /> {m.fileName}
                        </div>
                      )}
                      {m.text && <p className="whitespace-pre-line">{m.text}</p>}

                      {m.role === "assistant" && idx > 0 && m.text && (
                        <div className="mt-1.5 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                          <button type="button" className="inline-flex items-center gap-1 hover:text-orange-700" onClick={() => { if (!speakText(m.text)) toast.message("এই ফোনে পড়ে শোনানো যাচ্ছে না"); }}>
                            <Volume2 className="h-3.5 w-3.5" /> শুনুন
                          </button>
                          {!m.entries?.length && (
                            <button type="button" className="inline-flex items-center gap-1 hover:text-orange-700" onClick={() => shareText(m.text, m.share?.phone)}>
                              <Share2 className="h-3.5 w-3.5" /> {m.share ? `${m.share.name}-কে WhatsApp` : "পাঠান"}
                            </button>
                          )}
                        </div>
                      )}

                      {m.role === "assistant" && m.chips && m.chips.length > 0 && idx === messages.length - 1 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {m.chips.map((c) => (
                            <button
                              key={c}
                              type="button"
                              disabled={loading}
                              onClick={() => handleSend(c)}
                              className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      )}

                      {m.undoTarget && (() => {
                        const [ti, tj] = m.undoTarget!;
                        const t = messages[ti]?.entries?.[tj];
                        if (!t) return null;
                        if (t.undone) return <div className="mt-2 rounded border border-slate-300 bg-slate-100 py-1 text-center text-xs font-bold text-slate-600">মুছে ফেলা হয়েছে</div>;
                        return <UndoBox onUndo={(pw) => undoEntry(ti, tj, pw)} />;
                      })()}

                      {(m.entries ?? []).map((e, ei) => (
                        <EntryCard
                          key={ei}
                          entry={e}
                          busy={savingKey === `${idx}:${ei}`}
                          isAdmin={isAdmin}
                          onChange={(data) => patchEntry(idx, ei, { data })}
                          onSave={() => void saveEntry(idx, ei)}
                          onOpenForm={e.type === "MONEY" ? () => openForm(idx, ei) : undefined}
                          onUndo={(pw) => undoEntry(idx, ei, pw)}
                          onPrint={e.type === "SALE_CHALLAN" ? () => printChallan(e.data, e.challanNo) : undefined}
                        />
                      ))}

                      {pending > 1 && (
                        <Button
                          size="sm"
                          disabled={savingKey !== null}
                          onClick={() => void saveAll(idx)}
                          className="mt-2.5 h-10 w-full bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-800"
                        >
                          {savingKey !== null ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                          সব সেভ ({bn(pending)}টা)
                        </Button>
                      )}
                    </div>
                    {m.role === "user" && (
                      <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && (
                <div className="flex gap-2 items-center text-slate-600 dark:text-slate-400 text-xs font-medium italic">
                  <Bot className="h-4 w-4 animate-spin text-orange-600" /> আপনার প্রশ্নের সঠিক উত্তর তৈরি হচ্ছে...
                </div>
              )}
              <div ref={messagesEndRef} />
            </CardContent>
            {/* ফাইল বা ছবি অ্যাটাচ করলে তার প্রিভিউ বার */}
            {attachment && (
              <div className="px-3 py-2 bg-orange-50 dark:bg-slate-800 border-t border-orange-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt="Preview" className="h-10 w-10 rounded object-cover border border-orange-300" />
                  ) : (
                    <FileText className="h-8 w-8 text-orange-600 shrink-0" />
                  )}
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{attachment.fileName}</p>
                    <p className="text-[10px] text-orange-600 dark:text-orange-400">স্ক্যান করার জন্য প্রস্তুত — সেন্ড চাপুন</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-rose-600 hover:bg-rose-100"
                  onClick={() => setAttachment(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ইনপুট বার: ক্যামেরা স্ক্যান + ফাইল অ্যাটাচ + ভয়েস মাইক + টেক্সট */}
            <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5">
              {/* হিডেন ইনপুটসমূহ */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelect}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* ১. ক্যামেরা স্ক্যান বাটন */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => cameraInputRef.current?.click()}
                disabled={loading}
                title="রসিদ বা খাতা ক্যামেরা দিয়ে স্ক্যান করুন"
                className="h-9 w-9 flex-shrink-0 rounded-full border-slate-300 hover:bg-orange-50"
              >
                <Camera className="h-4 w-4 text-orange-600" />
              </Button>

              {/* ২. গ্যালারি / ফাইল অ্যাটাচ বাটন */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                title="ছবি বা পিডিএফ ফাইল যুক্ত করুন"
                className="h-9 w-9 flex-shrink-0 rounded-full border-slate-300 hover:bg-orange-50"
              >
                <Paperclip className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              </Button>

              {/* ৩. ভয়েস মাইক বাটন */}
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                onClick={toggleListening}
                title="মুখে বলুন"
                className={`h-9 w-9 flex-shrink-0 rounded-full border-slate-300 transition-all ${
                  isListening ? "animate-pulse ring-2 ring-red-400" : ""
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-orange-600" />}
              </Button>

              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={attachment ? "ছবিটি সম্পর্কে কিছু লিখুন বা সরাসরি সেন্ড চাপুন..." : "মুখে বলুন, ছবি তুলুন বা লিখুন..."}
                className="flex-1 h-9 text-sm bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 rounded-full px-3.5"
                disabled={loading}
              />

              <Button
                type="button"
                size="icon"
                onClick={() => handleSend()}
                disabled={loading || (!input.trim() && !attachment)}
                className="h-9 w-9 flex-shrink-0 rounded-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* a money card opened as the full form (on top of the chat) */}
      {form?.kind === "out" && (
        <ExpenseEntryDialog
          open
          onOpenChange={(o) => { if (!o) setForm(null); }}
          head={form.head}
          partyId={form.partyId}
          initial={form.initial}
          lockHead
          onDone={formDone}
        />
      )}
      {form?.kind === "in" && (
        <IncomeEntryDialog
          open
          onOpenChange={(o) => { if (!o) setForm(null); }}
          head={form.head}
          partyId={form.partyId}
          initial={form.initial}
          lockHead
          onDone={formDone}
        />
      )}
    </>
  );
}

export const AIAssistantFab = AiAssistantFab;
