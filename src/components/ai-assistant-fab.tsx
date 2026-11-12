import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowUp, BrickWall, Camera, Copy, FileText, HandCoins, ListChecks, Loader2, Lock, Mic, Paperclip, Save,
  Share2, Sparkles, SquarePen, Sun, UserCheck, Volume2, VolumeX, Wallet, X,
} from "lucide-react";
import { Button } from "./ui/button";
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

  // the page under the chat does not scroll while it is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // the writing box grows with the text, up to six lines
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input, isOpen]);

  const empty = messages.length <= 1;
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", hour12: false }));
  const greeting = hour >= 5 && hour < 12 ? "সুপ্রভাত" : hour < 16 && hour >= 12 ? "শুভ দুপুর" : hour >= 16 && hour < 18 ? "শুভ বিকেল" : hour >= 18 && hour < 21 ? "শুভ সন্ধ্যা" : "শুভ রাত্রি";
  const firstName = me?.fullName && !me.fullName.includes("@") ? me.fullName.split(" ")[0] : "";
  const starters: Array<{ icon: typeof Wallet; label: string; run: () => void }> = [
    { icon: Wallet, label: "হাতে নগদ কত?", run: () => void handleSend("হাতে নগদ কত?") },
    { icon: ListChecks, label: "আজকের কাজ কী বাকি?", run: () => void handleSend("আজকের কাজ কী বাকি?") },
    { icon: UserCheck, label: "আজকের হাজিরা নাও", run: () => void startAsk("attendance") },
    { icon: BrickWall, label: "আজকের কাঁচা ইট লিখি", run: () => void startAsk("kacha") },
    { icon: Lock, label: "দিন বন্ধ করি", run: () => void startAsk("day_close") },
    { icon: HandCoins, label: "কার কাছে কত বাকি?", run: () => void handleSend("কার কাছে কত বাকি?") },
    { icon: Sun, label: "সকালের হিসাব", run: () => void startAsk("morning") },
    { icon: Camera, label: "খাতার পাতা স্ক্যান", run: () => cameraInputRef.current?.click() },
  ];
  const canSend = !loading && (!!input.trim() || !!attachment);
  const copyText = (t: string) => {
    void navigator.clipboard?.writeText(t).then(() => toast.success("কপি হয়েছে"), () => toast.error("কপি হয়নি"));
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hidden md:flex fixed bottom-6 right-6 z-50 h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        title="সহকারী"
        aria-label="সহকারী খুলুন"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {isOpen && (
        <>
          {/* desktop: the page stays visible, dimmed, beside the chat */}
          {/* above the phone's bottom bar; a form opened from a card (z-50) comes on top of it */}
          <div onClick={() => setIsOpen(false)} className={`fixed inset-0 hidden bg-black/30 md:block ${form ? "z-[44]" : "z-[60]"}`} />

          <section
            role="dialog"
            aria-label="সহকারী"
            className={`fixed inset-0 ${form ? "z-[45]" : "z-[61]"} flex flex-col bg-background text-foreground md:inset-y-0 md:left-auto md:right-0 md:w-[480px] md:border-l md:shadow-2xl animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-right-8 md:slide-in-from-bottom-0`}
          >
            {/* top bar */}
            <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border/60 px-2 pt-[env(safe-area-inset-top)]">
              <button type="button" onClick={() => setIsOpen(false)} aria-label="বন্ধ করুন"
                className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <ArrowLeft className="h-5 w-5 md:hidden" />
                <X className="hidden h-5 w-5 md:block" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-[15px] font-semibold leading-tight">সহকারী</div>
                <div className="text-[11px] leading-tight text-muted-foreground">সি ডি বি ব্রিকসের খাতা দেখে উত্তর দেয়</div>
              </div>
              <button type="button" onClick={toggleSpeak} aria-label={speakOn ? "উত্তর পড়ে শোনানো বন্ধ" : "উত্তর পড়ে শোনাও"} title={speakOn ? "উত্তর পড়ে শোনানো বন্ধ" : "উত্তর পড়ে শোনাও"}
                className={`grid h-10 w-10 place-items-center rounded-full hover:bg-muted ${speakOn ? "text-primary" : "text-muted-foreground"}`}>
                {speakOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
              <button type="button" aria-label="নতুন কথা শুরু" title="নতুন কথা শুরু"
                onClick={() => { setMessages([WELCOME]); setAiHistory([]); }}
                className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <SquarePen className="h-5 w-5" />
              </button>
            </header>

            {/* the talk */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-[720px] px-4 pb-6 pt-4">
                {empty ? (
                  <div className="flex min-h-[calc(100dvh-14rem)] flex-col justify-center py-6 md:min-h-[60vh]">
                    <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h2 className="text-[26px] font-semibold leading-tight tracking-tight">
                      {greeting}{firstName ? `, ${firstName}` : ""}
                    </h2>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                      হিসাব জিজ্ঞেস করুন, বা মুখে বলে খাতায় তুলুন। একবারে কয়েকটা এন্ট্রিও বলা যায়।
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-2">
                      {starters.map((x) => (
                        <button key={x.label} type="button" onClick={x.run} disabled={loading}
                          className="flex min-h-[3.25rem] items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 text-left text-[13px] font-medium leading-snug shadow-xs transition active:scale-[0.98] hover:bg-muted/60 disabled:opacity-50">
                          <x.icon className="h-4 w-4 shrink-0 text-primary" />
                          <span>{x.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((m, idx) => {
                      if (idx === 0 && m === messages[0] && m.text === WELCOME.text) return null;
                      const pending = (m.entries ?? []).filter((e) => !e.saved).length;
                      if (m.role === "user") {
                        return (
                          <div key={idx} className="flex justify-end">
                            <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-muted px-4 py-2.5 text-[15px] leading-relaxed">
                              {m.imagePreview && <img src={m.imagePreview} alt="পাঠানো ছবি" className="mb-2 max-h-48 rounded-2xl object-cover" />}
                              {!m.imagePreview && m.fileName && (
                                <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" /> {m.fileName}</div>
                              )}
                              {m.text && <p className="whitespace-pre-line">{m.text}</p>}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="flex gap-3">
                          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {m.text && <p className="whitespace-pre-line text-[15px] leading-7">{m.text}</p>}

                            {m.text && (
                              <div className="mt-1 flex items-center gap-0.5 text-muted-foreground">
                                <button type="button" title="কপি" aria-label="কপি" onClick={() => copyText(m.text)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Copy className="h-3.5 w-3.5" /></button>
                                <button type="button" title="শুনুন" aria-label="শুনুন" onClick={() => { if (!speakText(m.text)) toast.message("এই ফোনে পড়ে শোনানো যাচ্ছে না"); }} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Volume2 className="h-3.5 w-3.5" /></button>
                                {!m.entries?.length && (
                                  <button type="button" onClick={() => shareText(m.text, m.share?.phone)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium hover:bg-muted">
                                    <Share2 className="h-3.5 w-3.5" /> {m.share ? `${m.share.name}-কে WhatsApp` : ""}
                                  </button>
                                )}
                              </div>
                            )}

                            {m.chips && m.chips.length > 0 && idx === messages.length - 1 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {m.chips.map((c) => (
                                  <button key={c} type="button" disabled={loading} onClick={() => handleSend(c)}
                                    className="rounded-full border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground shadow-xs hover:bg-muted disabled:opacity-50">
                                    {c}
                                  </button>
                                ))}
                              </div>
                            )}

                            {m.undoTarget && (() => {
                              const [ti, tj] = m.undoTarget!;
                              const t = messages[ti]?.entries?.[tj];
                              if (!t) return null;
                              if (t.undone) return <div className="mt-2 rounded-xl bg-muted py-2 text-center text-xs font-semibold text-muted-foreground">মুছে ফেলা হয়েছে</div>;
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
                              <Button size="sm" disabled={savingKey !== null} onClick={() => void saveAll(idx)}
                                className="mt-3 h-11 w-full rounded-2xl text-sm font-bold">
                                {savingKey !== null ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                                সব সেভ ({bn(pending)}টা)
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {loading && (
                      <div className="flex items-center gap-3">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1" aria-label="ভাবছি">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* the writing box */}
            <div className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-1">
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
              <div className="mx-auto w-full max-w-[720px] rounded-[26px] border bg-card shadow-sm transition focus-within:border-primary/40 focus-within:shadow-md">
                {attachment && (
                  <div className="flex items-center gap-2 px-3 pt-3">
                    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted px-2 py-1.5">
                      {attachment.previewUrl
                        ? <img src={attachment.previewUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        : <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />}
                      <span className="truncate text-xs font-medium">{attachment.fileName}</span>
                      <button type="button" aria-label="ছবি সরান" onClick={() => setAttachment(null)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-background"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}
                <textarea
                  ref={boxRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={loading}
                  placeholder={isListening ? "শুনছি… বলুন" : attachment ? "ছবিটা সম্পর্কে কিছু লিখুন, বা সরাসরি পাঠান" : "সহকারীকে লিখুন বা মাইকে বলুন…"}
                  className="block max-h-[168px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/80"
                />
                <div className="flex items-center gap-1 px-2 pb-2">
                  <button type="button" title="ক্যামেরা দিয়ে খাতা বা রসিদ" aria-label="ক্যামেরা" disabled={loading}
                    onClick={() => cameraInputRef.current?.click()}
                    className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50">
                    <Camera className="h-[18px] w-[18px]" />
                  </button>
                  <button type="button" title="ছবি বা পিডিএফ" aria-label="ছবি বা পিডিএফ যুক্ত করুন" disabled={loading}
                    onClick={() => fileInputRef.current?.click()}
                    className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50">
                    <Paperclip className="h-[18px] w-[18px]" />
                  </button>
                  <div className="flex-1" />
                  <button type="button" onClick={toggleListening} aria-label={isListening ? "শোনা বন্ধ" : "মুখে বলুন"} title="মুখে বলুন"
                    className={`grid h-9 w-9 place-items-center rounded-full transition ${isListening ? "bg-destructive text-destructive-foreground ring-4 ring-destructive/20 animate-pulse" : "text-muted-foreground hover:bg-muted"}`}>
                    <Mic className="h-[18px] w-[18px]" />
                  </button>
                  <button type="button" onClick={() => void handleSend()} disabled={!canSend} aria-label="পাঠান"
                    className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition disabled:bg-muted disabled:text-muted-foreground">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">খাতায় তোলার আগে কার্ডটা দেখে নিন</p>
            </div>
          </section>
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
