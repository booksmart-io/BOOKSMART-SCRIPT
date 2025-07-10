import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, User, Sparkles, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT =
  "You are BookSmart AI, a financial assistant specializing in US freelancer and small business taxes. " +
  "Help users understand tax deductions, interpret their transactions, and prepare for filing. " +
  "Be concise, accurate, and always remind users to confirm advice with a licensed CPA when appropriate.";

export default function AiChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your BookSmart AI assistant. I can help you analyze transactions, suggest tax deductions, or answer general accounting questions. How can I help you today?",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const updated: Message[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...updated.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && body?.error === "limit_reached") {
          throw new Error(body.message ?? "You've reached your plan's monthly AI question limit. Upgrade to ask more.");
        }
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply: string =
        data?.choices?.[0]?.message?.content ?? "Sorry, I couldn't get a response.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to get a response: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          AI Tax Assistant{" "}
          <Badge
            variant="secondary"
            className="bg-primary/20 text-primary hover:bg-primary/30"
          >
            Beta
          </Badge>
        </h1>
        <p className="text-muted-foreground">
          Instant answers to your financial questions based on your data.
        </p>
      </div>

      <Card className="flex-1 flex flex-col border-border/50 overflow-hidden shadow-lg shadow-primary/5">
        <div className="bg-secondary/10 p-3 border-b border-border/30 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          AI responses do not constitute professional financial advice. Always
          verify with your CPA.
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "user"
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-secondary/50 text-foreground rounded-tr-sm"
                    : "bg-card border border-border/50 shadow-sm rounded-tl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm rounded-tl-sm flex items-center gap-2">
                <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" />
                <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="p-4 rounded-2xl max-w-[85%] text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-tl-sm">
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="p-4 bg-card border-t border-border/30">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Ask about your taxes, transactions, or deductions..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-background border-border/50 focus-visible:ring-primary"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            />
            <Button
              size="icon"
              className="shrink-0 group"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
