import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, Send, Sparkles, X, Loader2, Mic, Paperclip, PieChart, CheckCircle2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@tanstack/react-router";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function getText(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function activeToolLabel(m: UIMessage): string | null {
  // Surface running tool name (Bengali label).
  for (const p of [...m.parts].reverse()) {
    const t = (p as { type?: string }).type ?? "";
    if (t.startsWith("tool-") && !t.endsWith("-result")) {
      const name = t.replace(/^tool-/, "").replace(/-result$/, "");
      const map: Record<string, string> = {
        resolveDateRange: "তারিখ নির্ধারণ করছি…",
        getSalesSummary: "বিক্রির হিসাব দেখছি…",
        getCustomerSummary: "গ্রাহকের তথ্য আনছি…",
        getTopSellingBricks: "সবচেয়ে বেশি বিক্রি দেখছি…",
        getCustomerDue: "বকেয়া হিসাব করছি…",
        searchCustomers: "গ্রাহক খুঁজছি…",
        listBrickTypes: "ইটের তালিকা দেখছি…",
        listAvailableData: "তথ্য খুঁজছি…",
      };
      return map[name] ?? `${name}…`;
    }
  }
  return null;
}

export const OPEN_AI_CHAT_EVENT = "cdb:open-ai-chat";

export function AiAssistantFab() {
  const [open, setOpen] = useState(() => {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem("cdb:ai-open") === "true";
    }
    return false;
  });
  
  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("cdb:ai-open", String(open));
    }
  }, [open]);

  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const location = useLocation();

  const [isListening, setIsListening] = useState(false);
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("আপনার ব্রাউজারে ভয়েস সাপোর্ট নেই");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_AI_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, handler);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Re-read session on every send so expired tokens auto-refresh.
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const t = data.session?.access_token;
          return t ? { Authorization: `Bearer ${t}` } : {};
        },
      }),
    [],
  );

  const storedMessages = useMemo(() => {
    if (typeof sessionStorage === "undefined") return [];
    try {
      return JSON.parse(sessionStorage.getItem("cdb:ai-messages") || "[]");
    } catch {
      return [];
    }
  }, []);

  const { messages, sendMessage, status, error, stop } = useChat({
    messages: storedMessages,
    transport,
    onError: (e) => console.error("AI chat error:", e),
  });

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && messages.length > 0) {
      sessionStorage.setItem("cdb:ai-messages", JSON.stringify(messages));
    }
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, status]);

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 50);
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage(
      { text },
      { body: { data: { currentPath: location.pathname } } },
    );
  };

  return (
    <>
      {/* Floating Action Button */}
      {!open && (
        <button
          aria-label="CDB Bricks AI Assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 hidden items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary/80 px-4 py-3 text-primary-foreground shadow-lg ring-1 ring-primary/30 transition-transform hover:scale-105 active:scale-95 md:flex"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">CDB AI সহকারী</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-x-2 bottom-2 z-50 flex max-h-[85vh] flex-col rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px] sm:max-h-[600px]">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">CDB Bricks AI সহকারী</div>
                <div className="text-[11px] text-muted-foreground">বাংলায় প্রশ্ন করুন</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-3 px-1 py-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="text-sm font-medium">আসসালামু আলাইকুম! 👋</div>
                <div className="text-xs text-muted-foreground">
                  আমি আপনার ব্যবসার তথ্য নিয়ে সাহায্য করতে পারি। যেমন:
                </div>
                <div className="mx-auto flex max-w-[280px] flex-wrap gap-1.5">
                  {[
                    "আজকের মোট বিক্রি কত?",
                    "এই সপ্তাহে সবচেয়ে বেশি বিক্রি কোন ইট?",
                    "রহিম ট্রেডার্স এর বকেয়া কত?",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((m) => {
                const text = getText(m);
                const isUser = m.role === "user";
                const toolParts = m.parts.filter((p): p is any => p.type === "dynamic-tool" || (typeof p.type === "string" && p.type.startsWith("tool-") && p.type !== "text"));
                if (!text && !isUser && status !== "streaming" && !toolParts.length) return null;
                return (
                  <div key={m.id} className="flex flex-col gap-2">
                    {(text || isUser) && (
                      <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm",
                          )}
                        >
                          {text || <span className="text-muted-foreground">…</span>}
                        </div>
                      </div>
                    )}
                    
                    {/* Generative UI Tool Invocations */}
                    {toolParts.map((ti: any) => {
                      const toolName = ti.type === "dynamic-tool" ? ti.toolName : ti.type.replace(/^tool-/, "");
                      const toolCallId = ti.toolCallId;
                      const isReady = ti.state === "result" || ti.state === "output-available";
                      if (!isReady) return null;
                      const result = ti.output ?? ti.result;
                      
                      // 1. Sales Chart
                      if (toolName === "getSalesSummary" || toolName === "getCustomerSummary") {
                        const data = result as any;
                        if (!data?.breakdown_by_brick?.length) return null;
                        return (
                          <div key={toolCallId} className="mr-auto w-[85%] rounded-2xl rounded-bl-sm bg-muted/50 p-3 text-sm border shadow-sm">
                            <div className="mb-3 flex items-center gap-2 font-semibold text-primary">
                              <PieChart className="h-4 w-4" /> বিক্রির চার্ট
                            </div>
                            <div className="h-[120px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.breakdown_by_brick} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                  <Bar dataKey="qty" fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
                                    {data.breakdown_by_brick.map((entry: any, index: number) => (
                                      <Cell key={`cell-${index}`} fill={`hsl(var(--primary) / ${0.7 + (index % 3) * 0.1})`} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      }
                      
                      // 2. Expense Draft
                      if (toolName === "prepareExpenseDraft") {
                        const draft = (result as any).draft;
                        return (
                          <div key={toolCallId} className="mr-auto w-[85%] rounded-2xl rounded-bl-sm bg-blue-500/10 p-3 text-sm border border-blue-500/20 shadow-sm">
                            <div className="mb-2 flex items-center gap-2 font-semibold text-blue-600 dark:text-blue-400">
                              <Receipt className="h-4 w-4" /> খরচের ড্রাফট প্রস্তুত
                            </div>
                            <div className="mb-3 space-y-1 text-xs">
                              <div><span className="text-muted-foreground">খাত:</span> {draft.category}</div>
                              <div><span className="text-muted-foreground">পরিমাণ:</span> ৳{draft.amount}</div>
                              {draft.note && <div><span className="text-muted-foreground">নোট:</span> {draft.note}</div>}
                            </div>
                            <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.dispatchEvent(new CustomEvent("open-expense-modal", { detail: draft }))}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> ড্রাফট চেক করুন
                            </Button>
                          </div>
                        );
                      }

                      // 3. Sales Draft
                      if (toolName === "prepareSalesDraft") {
                        const draft = (result as any).draft;
                        return (
                          <div key={toolCallId} className="mr-auto w-[85%] rounded-2xl rounded-bl-sm bg-green-500/10 p-3 text-sm border border-green-500/20 shadow-sm">
                            <div className="mb-2 flex items-center gap-2 font-semibold text-green-600 dark:text-green-400">
                              <Receipt className="h-4 w-4" /> বিক্রির ড্রাফট প্রস্তুত
                            </div>
                            <div className="mb-3 space-y-1 text-xs">
                              <div><span className="text-muted-foreground">গ্রাহক:</span> {draft.customerName}</div>
                              <div><span className="text-muted-foreground">ইট:</span> {draft.brickType} ({draft.quantity} পিস/ফুট)</div>
                              <div><span className="text-muted-foreground">দর:</span> ৳{draft.price}</div>
                            </div>
                            <Button size="sm" className="w-full h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => window.dispatchEvent(new CustomEvent("open-sales-modal", { detail: draft }))}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> ড্রাফট চেক করুন
                            </Button>
                          </div>
                        );
                      }
                      
                      return null;
                    })}
                  </div>
                );
              })}

              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {activeToolLabel(messages[messages.length - 1] ?? ({} as UIMessage)) ?? "ভাবছি..."}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  ত্রুটি: {error.message}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t p-2">
            <div className="flex items-end gap-2">
              <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="আপনার প্রশ্ন লিখুন…"
                rows={1}
                className="min-h-[40px] max-h-[120px] resize-none text-sm bg-muted/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                disabled={!token}
              />
              <Button 
                size="icon" 
                variant="ghost" 
                className={cn("h-10 w-10 shrink-0 transition-colors", isListening ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : "text-muted-foreground hover:text-foreground")}
                onClick={startListening}
              >
                <Mic className="h-4 w-4" />
              </Button>
              {busy ? (
                <Button size="icon" variant="outline" onClick={() => stop()} className="h-10 w-10 shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="icon" onClick={handleSend} disabled={!input.trim() || !token} className="h-10 w-10 shrink-0 bg-primary/90 hover:bg-primary">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!token && (
              <div className="px-1 pt-1 text-[10px] text-muted-foreground">প্রমাণীকরণের জন্য অপেক্ষা…</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
