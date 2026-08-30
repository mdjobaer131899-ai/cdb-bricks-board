import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, Send, Sparkles, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

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

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    onError: (e) => console.error("AI chat error:", e),
  });

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
    await sendMessage({ text });
  };

  return (
    <>
      {/* Floating Action Button */}
      {!open && (
        <button
          aria-label="CDB Bricks AI Assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary/80 px-4 py-3 text-primary-foreground shadow-lg ring-1 ring-primary/30 transition-transform hover:scale-105 active:scale-95"
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
                if (!text && !isUser && status !== "streaming") return null;
                return (
                  <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
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
                className="min-h-[40px] max-h-[120px] resize-none text-sm"
                disabled={!token}
              />
              {busy ? (
                <Button size="icon" variant="outline" onClick={() => stop()} className="h-10 w-10 shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="icon" onClick={handleSend} disabled={!input.trim() || !token} className="h-10 w-10 shrink-0">
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
