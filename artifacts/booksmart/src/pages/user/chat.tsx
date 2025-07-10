import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, Loader2, MessageSquare, Paperclip, Download, X, FileText, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface Chat {
  id: number;
  sender_id: number;
  receiver_id: number;
  last_message: string;
  last_message_time: string;
  created_at: string;
}

interface Message {
  id: number;
  chat_id: number;
  sender_id: number;
  content: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface AttachmentMeta {
  url: string;
  name: string;
  size: number;
  mime: string;
}

interface UserProfile {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
}

interface PendingFile {
  file: File;
  previewUrl?: string;
  type: "image" | "file";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullName(u: UserProfile) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function initials(u: UserProfile) {
  return (u.first_name ? u.first_name[0] : u.email[0]).toUpperCase();
}

function relativeTime(ts: string) {
  try { return formatDistanceToNow(new Date(ts), { addSuffix: false }); }
  catch { return ""; }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAttachment(content: string): AttachmentMeta | null {
  try { return JSON.parse(content) as AttachmentMeta; }
  catch { return null; }
}

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function AttachmentIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileText className={className} />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className={className} />;
  return <FileText className={className} />;
}

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe, peerInitial, myInitial }: {
  msg: Message; isMe: boolean; peerInitial: string; myInitial: string;
}) {
  const attachment = msg.type !== "text" ? parseAttachment(msg.content) : null;

  return (
    <div className={`flex gap-2 max-w-[80%] ${isMe ? "ml-auto flex-row-reverse" : ""}`}>
      <Avatar className="h-7 w-7 mt-auto shrink-0">
        <AvatarFallback className={`text-xs font-bold ${isMe ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          {isMe ? myInitial : peerInitial}
        </AvatarFallback>
      </Avatar>

      {/* Image message */}
      {msg.type === "image" && attachment ? (
        <div className={`rounded-2xl overflow-hidden max-w-[240px] ${isMe ? "rounded-br-sm" : "rounded-bl-sm"}`}>
          <img
            src={attachment.url}
            alt={attachment.name}
            className="w-full object-cover"
            loading="lazy"
          />
          <div className={`flex items-center justify-between px-2 py-1 text-[10px] gap-2 ${isMe ? "bg-primary/80 text-primary-foreground/80" : "bg-secondary/30 text-muted-foreground"}`}>
            <span className="truncate">{attachment.name}</span>
            <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer"
              className="shrink-0 hover:opacity-70" onClick={e => e.stopPropagation()}>
              <Download className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : msg.type === "file" && attachment ? (
        /* File message */
        <div className={`flex items-center gap-3 p-3 rounded-2xl min-w-[180px] max-w-[280px] ${isMe ? "bg-primary/90 text-primary-foreground rounded-br-sm" : "bg-secondary/20 rounded-bl-sm"}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMe ? "bg-primary-foreground/15" : "bg-primary/10"}`}>
            <AttachmentIcon mime={attachment.mime} className={`h-5 w-5 ${isMe ? "text-primary-foreground" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium truncate ${isMe ? "text-primary-foreground" : ""}`}>{attachment.name}</p>
            <p className={`text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{formatBytes(attachment.size)}</p>
          </div>
          <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer"
            className={`shrink-0 hover:opacity-70 ${isMe ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            <Download className="h-4 w-4" />
          </a>
        </div>
      ) : (
        /* Text message */
        <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap break-words ${isMe ? "bg-primary/90 text-primary-foreground rounded-br-sm" : "bg-secondary/20 rounded-bl-sm"}`}>
          {msg.content}
          <div className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60 text-right" : "text-muted-foreground"}`}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Chat() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const params = new URLSearchParams(window.location.search);
  const cpaNaturalId = params.get("cpa_id") ? Number(params.get("cpa_id")) : null;

  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [search, setSearch] = useState("");
  const [userMap, setUserMap] = useState<Record<number, UserProfile>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch chats (poll every 4s) ──────────────────────────────────────────

  const { data: chats = [], isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ["chats", numericId],
    enabled: !!numericId,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .or(`sender_id.eq.${numericId},receiver_id.eq.${numericId}`)
        .order("last_message_time", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── User map ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!numericId || chats.length === 0) return;
    const otherIds = [...new Set(chats.map(c => c.sender_id === numericId ? c.receiver_id : c.sender_id))];
    supabase.from("users").select("id,first_name,last_name,email,role").in("id", otherIds)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, UserProfile> = {};
        for (const u of data) map[u.id] = u;
        setUserMap(map);
      });
  }, [chats, numericId]);

  // ── Handle ?cpa_id param ──────────────────────────────────────────────────

  useEffect(() => {
    if (!cpaNaturalId || !numericId || chatsLoading) return;
    const existing = chats.find(c =>
      (c.sender_id === numericId && c.receiver_id === cpaNaturalId) ||
      (c.receiver_id === numericId && c.sender_id === cpaNaturalId)
    );
    if (existing) {
      setActiveChatId(existing.id);
    } else {
      supabase.from("chats").insert({
        sender_id: numericId, receiver_id: cpaNaturalId,
        last_message: "", last_message_time: new Date().toISOString(),
      }).select().single().then(({ data, error }) => {
        if (!error && data) {
          qc.invalidateQueries({ queryKey: ["chats", numericId] });
          setActiveChatId(data.id);
        }
      });
    }
    navigate("/user/chat", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpaNaturalId, numericId, chatsLoading]);

  // ── Load messages ─────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (chatId: number) => {
    setMsgsLoading(true);
    const { data, error } = await supabase.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true });
    setMsgsLoading(false);
    if (!error) setMessages(data ?? []);
    if (numericId) {
      supabase.from("messages").update({ is_read: true }).eq("chat_id", chatId).neq("sender_id", numericId).eq("is_read", false)
        .then(() => qc.invalidateQueries({ queryKey: ["chats", numericId] }));
    }
  }, [numericId, qc]);

  useEffect(() => {
    if (!activeChatId) return;
    loadMessages(activeChatId);
  }, [activeChatId, loadMessages]);

  // ── Realtime: messages ────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeChatId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const channel = supabase.channel(`messages:${activeChatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${activeChatId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          qc.invalidateQueries({ queryKey: ["chats", numericId] });
          if (numericId && newMsg.sender_id !== numericId) {
            supabase.from("messages").update({ is_read: true }).eq("id", newMsg.id).then(() => {});
          }
        })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [activeChatId, numericId, qc]);

  // ── Polling fallback: messages ────────────────────────────────────────────

  useEffect(() => {
    if (!activeChatId) return;
    const id = setInterval(async () => {
      const { data } = await supabase.from("messages").select("*").eq("chat_id", activeChatId).order("created_at", { ascending: true });
      if (data) setMessages(data);
    }, 4000);
    return () => clearInterval(id);
  }, [activeChatId]);

  // ── Realtime: chats list ──────────────────────────────────────────────────

  useEffect(() => {
    if (!numericId) return;
    const ch = supabase.channel(`chats_user:${numericId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chats" },
        () => qc.invalidateQueries({ queryKey: ["chats", numericId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [numericId, qc]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── File picker ───────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 25 MB.");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
    setPendingFile({ file, previewUrl, type: isImage ? "image" : "file" });

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const removePendingFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async ({ text, file }: { text: string; file: PendingFile | null }) => {
      if (!activeChatId || !numericId) throw new Error("No active chat");

      if (file) {
        setUploading(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const formData = new FormData();
        formData.append("file", file.file);

        const res = await fetch("/api/chat-upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        setUploading(false);

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(body.message ?? `Upload failed: ${res.status}`);
        }

        const meta = await res.json() as { publicUrl: string; name: string; size: number; mime: string; type: "image" | "file" };

        const content = JSON.stringify({ url: meta.publicUrl, name: meta.name, size: meta.size, mime: meta.mime });
        const { error: msgErr } = await supabase.from("messages").insert({
          chat_id: activeChatId, sender_id: numericId, content, type: meta.type, is_read: false,
        });
        if (msgErr) throw msgErr;

        const lastMsg = meta.type === "image" ? `📷 ${meta.name}` : `📎 ${meta.name}`;
        await supabase.from("chats").update({ last_message: lastMsg, last_message_time: new Date().toISOString() }).eq("id", activeChatId);
      }

      if (text) {
        const { error: msgErr } = await supabase.from("messages").insert({
          chat_id: activeChatId, sender_id: numericId, content: text, type: "text", is_read: false,
        });
        if (msgErr) throw msgErr;
        await supabase.from("chats").update({ last_message: text, last_message_time: new Date().toISOString() }).eq("id", activeChatId);
      }
    },
    onSuccess: () => {
      setMessageText("");
      removePendingFile();
      qc.invalidateQueries({ queryKey: ["chats", numericId] });
    },
    onError: (e: Error) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const handleSend = () => {
    const text = messageText.trim();
    if ((!text && !pendingFile) || sendMutation.isPending) return;
    sendMutation.mutate({ text, file: pendingFile });
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const filteredChats = chats.filter(c => {
    if (!search) return true;
    const otherId = c.sender_id === numericId ? c.receiver_id : c.sender_id;
    const u = userMap[otherId];
    return u ? fullName(u).toLowerCase().includes(search.toLowerCase()) : false;
  });

  const activeChat = chats.find(c => c.id === activeChatId) ?? null;
  const activePeer = activeChat
    ? userMap[activeChat.sender_id === numericId ? activeChat.receiver_id : activeChat.sender_id]
    : null;

  const myInitial = (profile?.email?.[0] ?? "U").toUpperCase();
  const peerInitial = activePeer ? initials(activePeer) : "?";

  const isBusy = sendMutation.isPending || uploading;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Sidebar ── */}
      <Card className="w-80 flex-shrink-0 flex flex-col border-border/50 hidden md:flex">
        <div className="p-4 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search messages..." className="pl-9 h-9 bg-secondary/20"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chatsLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No conversations yet.</div>
          ) : (
            filteredChats.map(chat => {
              const otherId = chat.sender_id === numericId ? chat.receiver_id : chat.sender_id;
              const other = userMap[otherId];
              const isActive = chat.id === activeChatId;
              return (
                <div key={chat.id} onClick={() => setActiveChatId(chat.id)}
                  className={`p-4 border-b border-border/20 cursor-pointer hover:bg-secondary/10 transition-colors ${isActive ? "bg-secondary/20" : ""}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {other ? initials(other) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-center mb-0.5">
                        <h4 className="text-sm font-semibold truncate">{other ? fullName(other) : `User #${otherId}`}</h4>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                          {chat.last_message_time ? relativeTime(chat.last_message_time) : ""}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{chat.last_message || "No messages yet"}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Main Chat Area ── */}
      <Card className="flex-1 flex flex-col border-border/50 min-w-0">
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select a conversation to start chatting</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border/30 flex items-center gap-3 shrink-0">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{peerInitial}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold leading-tight">
                  {activePeer ? fullName(activePeer) : `User #${activeChat.receiver_id}`}
                </h3>
                <p className="text-xs text-muted-foreground">{activePeer?.role === "cpa" ? "CPA" : activePeer?.role ?? ""}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/50">
              {msgsLoading ? (
                <div className="flex items-center justify-center h-24">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                  No messages yet — say hello!
                </div>
              ) : (
                messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} isMe={msg.sender_id === numericId}
                    peerInitial={peerInitial} myInitial={myInitial} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending file preview */}
            {pendingFile && (
              <div className="px-4 pt-3 pb-0 shrink-0">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20 border border-border/40">
                  {pendingFile.previewUrl ? (
                    <img src={pendingFile.previewUrl} alt="preview" className="h-12 w-12 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{pendingFile.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(pendingFile.file.size)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={removePendingFile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-border/30 bg-card shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.xls,.xlsx,.csv"
                onChange={handleFileChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-primary"
                  title="Attach file (images, PDF, Excel)"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  className="flex-1 bg-secondary/20 border-transparent focus-visible:ring-1"
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  disabled={isBusy}
                />
                <Button size="icon" className="shrink-0" onClick={handleSend}
                  disabled={(!messageText.trim() && !pendingFile) || isBusy}>
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 ml-10">
                Attach images, PDFs, or Excel files (up to 25 MB)
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
