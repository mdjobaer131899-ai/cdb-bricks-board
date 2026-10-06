import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, Sparkles, X, Printer, CheckCircle, Bot, User, Save, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { processBrickFieldCommand, saveAiActionToDatabase } from "../services/gemini";
import { toast } from "sonner";

export const OPEN_AI_CHAT_EVENT = "open-ai-chat-drawer";

interface Message {
  role: "user" | "assistant";
  text: string;
  data?: any;
  saved?: boolean;
  challanNo?: string;
}

export function AiAssistantFab() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "আসসালামু আলাইকুম! আমি CDB Bricks AI সহকারী। ভাটার যেকোনো হিসাব জানতে, নতুন চালান কাটতে বা জমা-খরচ খাতায় তুলতে আমাকে বাংলায় বলুন বা লিখুন।",
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const handleOpenEvent = () => setIsOpen((prev) => !prev);
    window.addEventListener(OPEN_AI_CHAT_EVENT, handleOpenEvent);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, handleOpenEvent);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

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
        handleSend(transcript);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("ভয়েস টাইপিংয়ের জন্য আপনার মোবাইলের কিবোর্ডের মাইক বাটনটি ব্যবহার করুন।");
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

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = { role: "user", text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res: any = await processBrickFieldCommand(textToSend);

      const replyText =
        res?.reply ||
        res?.reply_bn ||
        res?.message ||
        res?.answer ||
        res?.text ||
        (typeof res === "string" ? res : "আপনার তথ্যের হিসাব নিচে দেওয়া হলো:");

      const normalizedData = {
        ...res,
        type: res?.type || res?.action || "QUERY",
        data: res?.data || res,
      };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: replyText,
          data: normalizedData,
        },
      ]);
    } catch (err: any) {
      console.error("Chat Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "দুঃখিত, সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEntry = async (idx: number, actionType: string, entryData: any) => {
    setSavingIdx(idx);
    try {
      const res: any = await (saveAiActionToDatabase as any)(actionType, entryData);
      if (res && res.success === false) {
        toast.error(res.message || "সেভ করতে সমস্যা হয়েছে।");
        return;
      }
      toast.success("সফলভাবে খাতায় (Database-এ) সেভ হয়েছে!");
      setMessages((prev) =>
        prev.map((m, i) =>
          i === idx ? { ...m, saved: true, challanNo: res?.challanNo } : m
        )
      );
    } catch (err: any) {
      toast.error(`সেভ করতে সমস্যা: ${err.message}`);
    } finally {
      setSavingIdx(null);
    }
  };

  const handlePrintChallan = (d: any, challanNo?: string) => {
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

          <Card className="fixed bottom-20 md:bottom-24 right-3 left-3 md:left-auto md:right-6 z-50 md:w-[420px] h-[520px] flex flex-col shadow-2xl border-2 border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-5">
            <CardHeader className="bg-gradient-to-r from-slate-900 via-[#3b150a] to-slate-900 text-white p-3.5 flex flex-row items-center justify-between space-y-0 border-b border-orange-500/30">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-extrabold text-white">CDB Bricks AI ব্রেন</CardTitle>
                  <p className="text-[11px] text-amber-300/90 font-medium">হিসাব, অটো এন্ট্রি ও চালান সহকারী</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/15 h-8 w-8 rounded-full"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 text-sm bg-slate-50 dark:bg-slate-950">
              {messages.map((m, idx) => (
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
                    className={`rounded-2xl px-3.5 py-2.5 max-w-[84%] leading-relaxed shadow-xs ${
                      m.role === "user"
                        ? "bg-orange-700 text-white rounded-br-none font-medium"
                        : "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-tl-none border border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-line">{m.text}</p>

                    {/* ১. চালান কার্ড */}
                    {m.data?.type === "SALE_CHALLAN" && (
                      <div className="mt-3 p-3 bg-orange-50/70 dark:bg-slate-800 rounded-xl border border-orange-200 dark:border-slate-700 text-xs text-foreground space-y-1.5 shadow-xs">
                        <div className="font-bold text-orange-700 dark:text-orange-400 flex items-center justify-between border-b border-orange-200 pb-1">
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" /> চালান বিবরণী
                          </span>
                          {m.challanNo && <span className="text-[11px] bg-orange-200/70 px-1.5 py-0.5 rounded">#{m.challanNo}</span>}
                        </div>
                        <div>👤 <b>ক্রেতা:</b> {m.data.data?.customerName || m.data.data?.customer_name || "নগদ"}</div>
                        <div>🧱 <b>ইট:</b> {m.data.data?.brickType || m.data.data?.brick_name || "১ নম্বর ইট"} ({m.data.data?.quantity || 0} পিস)</div>
                        <div>💰 <b>মোট বিল:</b> ৳{m.data.data?.totalAmount ?? m.data.data?.total_amount ?? 0}</div>
                        <div>💵 <b>জমা:</b> ৳{m.data.data?.paidAmount ?? m.data.data?.paid_amount ?? 0} | <b>বাকি:</b> ৳{m.data.data?.dueAmount ?? m.data.data?.due_amount ?? 0}</div>

                        <div className="flex gap-2 pt-2">
                          {!m.saved ? (
                            <Button
                              size="sm"
                              disabled={savingIdx === idx}
                              onClick={() => handleSaveEntry(idx, "SALE_CHALLAN", m.data.data)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-bold"
                            >
                              {savingIdx === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                              খাতায় সেভ করুন
                            </Button>
                          ) : (
                            <div className="flex-1 text-emerald-700 font-bold flex items-center justify-center text-xs bg-emerald-100 rounded border border-emerald-300">
                              ✓ খাতায় সেভ হয়েছে
                            </div>
                          )}

                          <Button
                            size="sm"
                            onClick={() => handlePrintChallan(m.data.data, m.challanNo)}
                            className="bg-orange-600 hover:bg-orange-700 text-white h-8 text-xs px-3 font-bold"
                          >
                            <Printer className="h-3.5 w-3.5 mr-1" /> প্রিন্ট
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ২. খরচ, কালেকশন, সর্দার, কাঁচা ইট ও সাপ্লায়ার কার্ড */}
                    {["EXPENSE", "COLLECTION", "SARDAR_PAYMENT", "KACHA_BRICK", "SUPPLIER_PAYMENT"].includes(m.data?.type) && (
                      <div className="mt-3 p-3 bg-orange-50/70 dark:bg-slate-800 rounded-xl border border-orange-200 text-xs text-foreground space-y-1.5 shadow-xs">
                        <div className="font-bold text-orange-700 border-b border-orange-200 pb-1">
                          {m.data.type === "EXPENSE" && "💸 খরচের ভাউচার"}
                          {m.data.type === "COLLECTION" && "💵 নগদ জমা / কালেকশন"}
                          {m.data.type === "SARDAR_PAYMENT" && "👷 সর্দার পেমেন্ট / দাদন"}
                          {m.data.type === "KACHA_BRICK" && "🧱 কাঁচা ইট (মিল) এন্ট্রি"}
                          {m.data.type === "SUPPLIER_PAYMENT" && "🚛 সাপ্লায়ার পেমেন্ট"}
                        </div>
                        {(m.data.data?.customerName || m.data.data?.customer_name || m.data.data?.sardarName || m.data.data?.sardar_name || m.data.data?.supplierName) && (
                          <div>👤 <b>নাম:</b> {m.data.data.customerName || m.data.data.customer_name || m.data.data.sardarName || m.data.data.sardar_name || m.data.data.supplierName}</div>
                        )}
                        {(m.data.data?.expenseCategory || m.data.data?.category) && (
                          <div>📂 <b>খাত:</b> {m.data.data.expenseCategory || m.data.data.category}</div>
                        )}
                        {m.data.data?.quantity > 0 && <div>🧱 <b>পরিমাণ:</b> {m.data.data.quantity} পিস</div>}
                        <div>💰 <b>টাকার পরিমাণ:</b> ৳{m.data.data?.amount || m.data.data?.paidAmount || m.data.data?.totalAmount || 0}</div>

                        {!m.saved ? (
                          <Button
                            size="sm"
                            disabled={savingIdx === idx}
                            onClick={() => handleSaveEntry(idx, m.data.type, m.data.data)}
                            className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-bold"
                          >
                            {savingIdx === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                            খাতায় সেভ নিশ্চিত করুন
                          </Button>
                        ) : (
                          <div className="w-full py-1 text-emerald-700 font-bold text-center text-xs bg-emerald-100 rounded border border-emerald-300">
                            ✓ খাতায় সেভ হয়েছে
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-2 items-center text-slate-600 dark:text-slate-400 text-xs font-medium italic">
                  <Bot className="h-4 w-4 animate-spin text-orange-600" /> এআই খাতা দেখছে ও হিসাব মেলাচ্ছে...
                </div>
              )}
              <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                onClick={toggleListening}
                className={`h-10 w-10 flex-shrink-0 rounded-full border-slate-300 transition-all ${
                  isListening ? "animate-pulse ring-2 ring-red-400" : ""
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-orange-600" />}
              </Button>

              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="মুখে বলুন বা এখানে লিখুন..."
                className="flex-1 h-10 text-sm bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 rounded-full px-4"
                disabled={loading}
              />

              <Button
                type="button"
                size="icon"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="h-10 w-10 flex-shrink-0 rounded-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export const AIAssistantFab = AiAssistantFab;
export default AiAssistantFab;