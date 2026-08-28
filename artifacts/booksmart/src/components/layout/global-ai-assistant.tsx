import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ExternalLink, Loader2, Minus, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormattedAiMessage } from "@/components/ai/formatted-ai-message";
import { useActiveOrganizationId } from "@/lib/active-organization";
import { useAuth } from "@/hooks/use-auth";

type Message = { role: "user" | "assistant"; content: string };

const welcome: Message = { role: "assistant", content: "Hi! I’m your BookSmart AI assistant. Ask me about transactions, deductions, reports, or your business finances." };
const systemPrompt = "You are BookSmart AI, a concise financial assistant for US freelancers and small businesses. Help explain transactions, deductions, reports, and accounting concepts. Clearly identify uncertainty and recommend confirming material tax or accounting decisions with a licensed CPA.";
const quickQuestions = ["Summarize my business", "What needs attention?", "Explain my deductions"];

function cleanReply(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "Sorry, I couldn’t get a response.";
  return value.trim();
}

export function GlobalAiAssistant({ role, location }: { role: "user" | "cpa" | "admin"; location: string }) {
  const { profile } = useAuth();
  const [activeOrganizationId] = useActiveOrganizationId(profile?.numericId ?? null);
  const hidden = role !== "user" || location === "/user/ai-chat";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeForOtherWidget = (event: Event) => {
      if ((event as CustomEvent<{ widget?: string }>).detail?.widget !== "ai") setOpen(false);
    };
    window.addEventListener("booksmart-global-widget-open", closeForOtherWidget);
    return () => window.removeEventListener("booksmart-global-widget-open", closeForOtherWidget);
  }, []);
  useEffect(() => { const panel = messagesRef.current; if (panel) panel.scrollTop = panel.scrollHeight; }, [messages, loading]);

  const show = () => {
    window.dispatchEvent(new CustomEvent("booksmart-global-widget-open", { detail: { widget: "ai" } }));
    setOpen(true);
  };
  const send = async (suggested?: string) => {
    const text = (suggested ?? input).trim();
    if (!text || loading) return;
    const updated: Message[] = [...messages, { role: "user", content: text }];
    setInput(""); setError(null); setMessages(updated); setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ model: "openai/gpt-4o-mini", organization_id: activeOrganizationId, messages: [{ role: "system", content: systemPrompt }, ...updated] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? body?.error ?? "The AI assistant is temporarily unavailable.");
      setMessages(current => [...current, { role: "assistant", content: cleanReply(body?.choices?.[0]?.message?.content) }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI assistant is temporarily unavailable.");
    } finally { setLoading(false); }
  };

  if (hidden) return null;
  return <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
    {open && <Card className="mb-3 flex h-[min(70dvh,36rem)] w-[calc(100vw-2rem)] max-w-96 flex-col overflow-hidden border-primary/30 bg-card shadow-2xl">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <div className="h-9 w-9 overflow-hidden rounded-full bg-primary/10"><img src="/booksmart-ai-mascot.png" alt="" className="h-full w-full object-cover object-top" /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">BookSmart AI</p><p className="text-[10px] text-muted-foreground">Financial assistant</p></div>
        <Button asChild size="icon" variant="ghost" className="h-8 w-8"><Link href="/user/ai-chat" aria-label="Open full AI Chat"><ExternalLink className="h-4 w-4" /></Link></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Minimize AI assistant"><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setOpen(false); setMessages([welcome]); setError(null); }} aria-label="Close and clear AI assistant"><X className="h-4 w-4" /></Button>
      </div>
      <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background/40 p-3">
        {messages.length === 1 && <div className="flex justify-center"><img src="/booksmart-ai-mascot.png" alt="BookSmart AI mascot" className="h-24 w-24 object-contain drop-shadow-md" /></div>}
        {messages.map((message, index) => <div key={index} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <div className="mt-1 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary/10"><img src="/booksmart-ai-mascot.png" alt="" className="h-full w-full object-cover object-top" /></div>}<div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${message.role === "user" ? "whitespace-pre-wrap rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card"}`}>{message.role === "assistant" ? <FormattedAiMessage content={message.content} /> : message.content}</div></div>)}
        {messages.length === 1 && <div className="flex flex-wrap gap-1.5 pl-9">{quickQuestions.map(question => <Button key={question} size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => void send(question)}>{question}</Button>)}</div>}
        {loading && <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />BookSmart AI is thinking…</div>}
        {error && <div className="ml-9 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
      </div>
      <form className="flex shrink-0 gap-2 border-t p-3" onSubmit={event => { event.preventDefault(); void send(); }}><Input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask BookSmart AI…" disabled={loading} /><Button size="icon" type="submit" disabled={!input.trim() || loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></form>
      <p className="shrink-0 px-3 pb-2 text-center text-[9px] text-muted-foreground">AI can make mistakes. Confirm important decisions with your CPA.</p>
    </Card>}
    <Button size="icon" className="h-12 w-12 overflow-hidden rounded-full border-2 border-primary/50 bg-card p-0 shadow-lg hover:bg-primary/10" onClick={() => open ? setOpen(false) : show()} aria-label={open ? "Minimize BookSmart AI" : "Open BookSmart AI assistant"} title="Ask BookSmart AI"><img src="/booksmart-ai-mascot.png" alt="" className="h-full w-full object-cover object-top" /></Button>
  </div>;
}
