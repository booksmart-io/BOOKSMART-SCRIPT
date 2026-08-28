import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, ExternalLink, Loader2, MessageCircle, Minus, Send, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ChatRow = { id: number; sender_id: number; receiver_id: number; last_message: string; last_message_time: string };
type MessageRow = { id: number; chat_id: number; sender_id: number; content: string; type: string; created_at: string };
type UnreadMessageRow = Pick<MessageRow, "id" | "chat_id" | "sender_id" | "created_at">;
type Person = { id: number; first_name: string | null; last_name: string | null; email: string; img_url: string | null; role: string };

const personName = (person?: Person) => person ? [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email : "Conversation";
const personInitial = (person?: Person) => (person?.first_name?.[0] || person?.email?.[0] || "?").toUpperCase();

export function GlobalChatWidget({ role, location, unreadCount }: { role: "user" | "cpa" | "admin"; location: string; unreadCount: number }) {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(() => localStorage.getItem("booksmart-global-chat-open") === "true");
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const hidden = role === "admin" || location === "/user/chat" || location === "/cpa/chat";

  const chats = useQuery<ChatRow[]>({
    queryKey: ["global-chats", numericId], enabled: Boolean(numericId) && !hidden, refetchInterval: 5000,
    queryFn: async () => { const { data, error } = await supabase.from("chats").select("id,sender_id,receiver_id,last_message,last_message_time").or(`sender_id.eq.${numericId},receiver_id.eq.${numericId}`).order("last_message_time", { ascending: false, nullsFirst: false }); if (error) throw error; return data ?? []; },
  });
  const otherIds = useMemo(() => [...new Set((chats.data ?? []).map(chat => chat.sender_id === numericId ? chat.receiver_id : chat.sender_id))], [chats.data, numericId]);
  const chatIds = useMemo(() => (chats.data ?? []).map(chat => chat.id), [chats.data]);
  const chatsById = useMemo(() => new Map((chats.data ?? []).map(chat => [chat.id, chat])), [chats.data]);
  const people = useQuery<Person[]>({
    queryKey: ["global-chat-people", otherIds.join(",")], enabled: otherIds.length > 0 && !hidden,
    queryFn: async () => { const { data, error } = await supabase.from("users").select("id,first_name,last_name,email,img_url,role").in("id", otherIds); if (error) throw error; return data ?? []; },
  });
  const peopleById = useMemo(() => new Map((people.data ?? []).map(person => [person.id, person])), [people.data]);
  const activeChat = (chats.data ?? []).find(chat => chat.id === activeChatId);
  const peerId = activeChat ? (activeChat.sender_id === numericId ? activeChat.receiver_id : activeChat.sender_id) : null;
  const peer = peerId == null ? undefined : peopleById.get(peerId);
  const messages = useQuery<MessageRow[]>({
    queryKey: ["global-chat-messages", activeChatId], enabled: activeChatId != null && open && !hidden, refetchInterval: 4000,
    queryFn: async () => { const { data, error } = await supabase.from("messages").select("id,chat_id,sender_id,content,type,created_at").eq("chat_id", activeChatId!).order("created_at"); if (error) throw error; return data ?? []; },
  });
  const unreadMessages = useQuery<UnreadMessageRow[]>({
    queryKey: ["global-chat-unread-messages", numericId, chatIds.join(",")], enabled: Boolean(numericId) && chatIds.length > 0 && !hidden,
    queryFn: async () => { const { data, error } = await supabase.from("messages").select("id,chat_id,sender_id,created_at").in("chat_id", chatIds).eq("is_read", false).neq("sender_id", numericId!).order("created_at", { ascending: false }).limit(100); if (error) throw error; return data ?? []; },
  });
  const unreadConversations = useMemo(() => {
    const counts = new Map<number, { count: number; senderId: number; latestAt: string }>();
    for (const message of unreadMessages.data ?? []) {
      const current = counts.get(message.chat_id);
      counts.set(message.chat_id, {
        count: (current?.count ?? 0) + 1,
        senderId: message.sender_id,
        latestAt: current?.latestAt ?? message.created_at,
      });
    }
    return [...counts.entries()]
      .map(([chatId, value]) => { const chat = chatsById.get(chatId); const peerId = chat ? (chat.sender_id === numericId ? chat.receiver_id : chat.sender_id) : value.senderId; return ({ chatId, ...value, senderId: peerId }); })
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
      .slice(0, 3);
  }, [chatsById, numericId, unreadMessages.data]);

  useEffect(() => { localStorage.setItem("booksmart-global-chat-open", String(open)); }, [open]);
  useEffect(() => {
    const closeForOtherWidget = (event: Event) => {
      if ((event as CustomEvent<{ widget?: string }>).detail?.widget !== "chat") setOpen(false);
    };
    window.addEventListener("booksmart-global-widget-open", closeForOtherWidget);
    return () => window.removeEventListener("booksmart-global-widget-open", closeForOtherWidget);
  }, []);
  useEffect(() => {
    if (!numericId || hidden) return;
    const channel = supabase.channel(`global-chat:${numericId}`).on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
      queryClient.invalidateQueries({ queryKey: ["global-chats", numericId] });
      queryClient.invalidateQueries({ queryKey: ["global-chat-messages", activeChatId] });
      queryClient.invalidateQueries({ queryKey: ["global-chat-unread-messages", numericId] });
      queryClient.invalidateQueries({ queryKey: ["unread_count", numericId] });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChatId, hidden, numericId, queryClient]);
  useEffect(() => {
    if (!open || !activeChatId || !numericId) return;
    void supabase.from("messages").update({ is_read: true }).eq("chat_id", activeChatId).neq("sender_id", numericId).eq("is_read", false).then(() => {
      queryClient.invalidateQueries({ queryKey: ["unread_count", numericId] });
      queryClient.invalidateQueries({ queryKey: ["global-chat-unread-messages", numericId] });
    });
  }, [activeChatId, messages.data, numericId, open, queryClient]);

  const send = useMutation({
    mutationFn: async () => {
      const content = text.trim(); if (!content || !activeChatId || !numericId) return;
      const { error } = await supabase.from("messages").insert({ chat_id: activeChatId, sender_id: numericId, content, type: "text", is_read: false }); if (error) throw error;
      await supabase.from("chats").update({ last_message: content, last_message_time: new Date().toISOString() }).eq("id", activeChatId);
    },
    onSuccess: () => { setText(""); queryClient.invalidateQueries({ queryKey: ["global-chat-messages", activeChatId] }); queryClient.invalidateQueries({ queryKey: ["global-chats", numericId] }); },
  });

  if (hidden || !numericId) return null;
  const fullChatRoute = role === "cpa" ? "/cpa/chat" : "/user/chat";
  const minimizedBubbles = [
    ...(activeChatId && peerId ? [{ chatId: activeChatId, senderId: peerId, count: unreadConversations.find(item => item.chatId === activeChatId)?.count ?? 0, minimized: true }] : []),
    ...unreadConversations.filter(item => item.chatId !== activeChatId).map(item => ({ chatId: item.chatId, senderId: item.senderId, count: item.count, minimized: false })),
  ].slice(0, 3);
  return <div className="fixed bottom-[5rem] right-4 z-40 sm:bottom-[5.5rem] sm:right-6">
    {!open && minimizedBubbles.length > 0 && <div className="mb-3 flex flex-col items-end gap-2" aria-label="Minimized and unread conversations">
      {minimizedBubbles.map(conversation => { const person = peopleById.get(conversation.senderId); return <div key={conversation.chatId} className="group relative"><button type="button" onClick={() => { setActiveChatId(conversation.chatId); setOpen(true); }} className="relative rounded-full border-2 border-card bg-card shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={conversation.count > 0 ? `Open ${personName(person)} conversation, ${conversation.count} unread message${conversation.count === 1 ? "" : "s"}` : `Restore ${personName(person)} conversation`} title={conversation.count > 0 ? `${personName(person)} · ${conversation.count} unread` : `Restore ${personName(person)}`}><Avatar className="h-11 w-11 sm:h-12 sm:w-12">{person?.img_url && <AvatarImage src={person.img_url} alt="" className="object-cover" />}<AvatarFallback>{personInitial(person)}</AvatarFallback></Avatar>{conversation.count > 0 && <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white">{conversation.count > 99 ? "99+" : conversation.count}</Badge>}</button>{conversation.minimized && <button type="button" onClick={() => setActiveChatId(null)} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-card bg-foreground text-background opacity-0 shadow transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`Close ${personName(person)} chat bubble`} title="Close chat bubble"><X className="h-3 w-3" /></button>}</div>; })}
    </div>}
    {open && <Card className="mb-3 flex h-[min(70dvh,36rem)] w-[calc(100vw-2rem)] max-w-96 flex-col overflow-hidden border-border/70 bg-card shadow-2xl">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        {activeChatId && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setActiveChatId(null)} aria-label="Back to conversations"><ChevronLeft className="h-4 w-4" /></Button>}
        {activeChatId ? <><Avatar className="h-8 w-8">{peer?.img_url && <AvatarImage src={peer.img_url} alt="" className="object-cover" />}<AvatarFallback>{personInitial(peer)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{personName(peer)}</p><p className="text-[10px] capitalize text-muted-foreground">{peer?.role ?? "Contact"}</p></div></> : <div className="flex-1"><p className="font-semibold">Messages</p><p className="text-[10px] text-muted-foreground">Recent conversations</p></div>}
        <Button asChild size="icon" variant="ghost" className="h-8 w-8"><Link href={fullChatRoute} aria-label="Open full Chat page"><ExternalLink className="h-4 w-4" /></Link></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Minimize chat"><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setOpen(false); setActiveChatId(null); }} aria-label="Close chat"><X className="h-4 w-4" /></Button>
      </div>
      {!activeChatId ? <div className="min-h-0 flex-1 overflow-y-auto">
        {chats.isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (chats.data ?? []).length === 0 ? <div className="flex h-56 flex-col items-center justify-center px-6 text-center"><MessageCircle className="mb-3 h-9 w-9 text-muted-foreground/40" /><p className="text-sm font-medium">No conversations yet</p><Button asChild size="sm" variant="outline" className="mt-3"><Link href={fullChatRoute}>Open Chat</Link></Button></div> : (chats.data ?? []).map(chat => { const otherId = chat.sender_id === numericId ? chat.receiver_id : chat.sender_id; const person = peopleById.get(otherId); return <button type="button" key={chat.id} onClick={() => setActiveChatId(chat.id)} className="flex w-full items-center gap-3 border-b border-border/40 p-3 text-left hover:bg-muted/30"><Avatar className="h-9 w-9">{person?.img_url && <AvatarImage src={person.img_url} alt="" className="object-cover" />}<AvatarFallback>{personInitial(person)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{personName(person)}</p><p className="truncate text-xs text-muted-foreground">{chat.last_message || "No messages yet"}</p></div></button>; })}
      </div> : <><div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-background/40 p-3">
        {messages.isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (messages.data ?? []).map(message => { const mine = message.sender_id === numericId; const attachment = message.type !== "text"; return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"}`}>{attachment ? <Link href={fullChatRoute} className="underline">Open attachment in Chat</Link> : message.content}<p className={`mt-1 text-[9px] ${mine ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div></div>; })}
      </div><form className="flex shrink-0 gap-2 border-t p-3" onSubmit={event => { event.preventDefault(); if (text.trim() && !send.isPending) send.mutate(); }}><Input value={text} onChange={event => setText(event.target.value)} placeholder="Write a reply…" disabled={send.isPending} /><Button size="icon" type="submit" disabled={!text.trim() || send.isPending}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></form></>}
    </Card>}
    <Button size="icon" className="relative ml-auto h-12 w-12 rounded-full shadow-lg" onClick={() => { if (open) setOpen(false); else { window.dispatchEvent(new CustomEvent("booksmart-global-widget-open", { detail: { widget: "chat" } })); setOpen(true); } }} aria-label={open ? "Minimize messages" : "Open messages"}><MessageCircle className="h-5 w-5" />{unreadCount > 0 && <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white">{unreadCount > 99 ? "99+" : unreadCount}</Badge>}</Button>
  </div>;
}
