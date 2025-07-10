import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MessageSquare, ChevronRight, FileText, Send, PackageCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: number;
  user_id: number;
  cpa_id: number;
  title: string;
  services: string[];
  description: string;
  status: string;
  payment_status: string;
  amount: number;
  created_at: string;
}

interface UserRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
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

function fullName(u: UserRow) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function initials(u: UserRow) {
  return fullName(u).slice(0, 2).toUpperCase();
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const STATUS_OPTIONS = ["pending", "active", "completed", "cancelled"];

const statusColor = (s: string) => {
  if (s === "completed") return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
  if (s === "active") return "text-primary border-primary/30 bg-primary/10";
  if (s === "cancelled") return "text-rose-500 border-rose-500/30 bg-rose-500/10";
  return "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CpaOrders() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const qc = useQueryClient();

  // ── List / filter state ───────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Order detail dialog ───────────────────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // ── Inline chat sheet ─────────────────────────────────────────────────────
  const [chatUserId, setChatUserId] = useState<number | null>(null);
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── User map ──────────────────────────────────────────────────────────────
  const [userMap, setUserMap] = useState<Record<number, UserRow>>({});

  // ── Orders query ─────────────────────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["cpa_orders", numericId],
    enabled: !!numericId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,user_id,cpa_id,title,services,description,status,payment_status,amount,created_at")
        .eq("cpa_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Fetch user display names ──────────────────────────────────────────────
  useEffect(() => {
    const ids = [...new Set(orders.map((o) => o.user_id))].filter(Boolean);
    if (!ids.length) return;
    supabase
      .from("users")
      .select("id,first_name,last_name,email")
      .in("id", ids)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<number, UserRow> = {};
        for (const u of data) m[u.id] = u;
        setUserMap(m);
      });
  }, [orders]);

  // ── Update order (status + amount) ───────────────────────────────────────
  const updateOrder = useMutation({
    mutationFn: async ({ id, status, amount }: { id: number; status: string; amount: number }) => {
      const { error } = await supabase.from("orders").update({ status, amount }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.status === "completed" ? "Order delivered!" : "Order updated.");
      qc.invalidateQueries({ queryKey: ["cpa_orders", numericId] });
      qc.invalidateQueries({ queryKey: ["cpa_leads", numericId] });
      if (selectedOrder) setSelectedOrder({ ...selectedOrder, status: vars.status, amount: vars.amount });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Open chat sheet: find or create chat, load messages ───────────────────
  const openChat = async (clientId: number) => {
    if (!numericId) return;
    setChatUserId(clientId);
    setMessages([]);
    setMsgText("");
    setChatLoading(true);

    // find existing chat
    const { data: existing } = await supabase
      .from("chats")
      .select("id")
      .or(
        `and(sender_id.eq.${numericId},receiver_id.eq.${clientId}),and(sender_id.eq.${clientId},receiver_id.eq.${numericId})`
      )
      .limit(1)
      .single();

    let id: number;
    if (existing?.id) {
      id = existing.id;
    } else {
      const { data: newChat, error } = await supabase
        .from("chats")
        .insert({ sender_id: numericId, receiver_id: clientId })
        .select("id")
        .single();
      if (error || !newChat) { setChatLoading(false); toast.error("Could not open chat."); return; }
      id = newChat.id;
    }
    setChatId(id);

    // load messages
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });
    setMessages(msgs ?? []);
    setChatLoading(false);

    // realtime
    if (channelRef.current) { supabase.removeChannel(channelRef.current); }
    const ch = supabase
      .channel(`chat-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();
    channelRef.current = ch;
  };

  const closeChat = () => {
    setChatUserId(null);
    setChatId(null);
    setMessages([]);
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
  };

  // scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // cleanup on unmount
  useEffect(() => () => { if (channelRef.current) supabase.removeChannel(channelRef.current); }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!msgText.trim() || !chatId || !numericId || !chatUserId) return;
    const content = msgText.trim();
    setMsgText("");
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId, sender_id: numericId, content, type: "text", is_read: false,
    });
    if (error) { toast.error("Failed to send message."); return; }
    await supabase.from("chats").update({ last_message: content, last_message_time: new Date().toISOString() }).eq("id", chatId);
  };

  // ── Send order request via chat ───────────────────────────────────────────
  const sendOrderRequest = async () => {
    if (!chatId || !numericId || !chatUserId) return;
    const content = "📋 Order Request Sent\nPlease check your dashboard for details.";
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId, sender_id: numericId, content, type: "text", is_read: false,
    });
    if (!error) {
      await supabase.from("chats").update({ last_message: content, last_message_time: new Date().toISOString() }).eq("id", chatId);
      toast.success("Order request sent via chat.");
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = orders.filter((o) => {
    const client = userMap[o.user_id];
    const nameMatch = !search ||
      o.title.toLowerCase().includes(search.toLowerCase()) ||
      (client && fullName(client).toLowerCase().includes(search.toLowerCase()));
    const statusMatch = statusFilter === "all" || o.status === statusFilter;
    return nameMatch && statusMatch;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Orders</h1>
          <p className="text-muted-foreground">Manage your current client engagements.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Order Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No orders found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const client = userMap[order.user_id];
            return (
              <Card
                key={order.id}
                className="border-border/50 hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedOrder(order);
                  setNewStatus(order.status);
                  setNewAmount(String(order.amount ?? 0));
                }}
              >
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                      {client ? initials(client) : "#"}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold truncate">{order.title}</p>
                        <span className="text-xs text-muted-foreground shrink-0">#{order.id}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {client ? fullName(client) : `Client #${order.user_id}`}
                        {" · "}
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Amount */}
                    <span className="text-sm font-semibold text-primary shrink-0">
                      {fmtCurrency(order.amount ?? 0)}
                    </span>

                    {/* Status badge */}
                    <Badge
                      variant="outline"
                      className={`capitalize text-xs shrink-0 ${statusColor(order.status)}`}
                    >
                      {order.status}
                    </Badge>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title="Chat with client"
                        onClick={(e) => {
                          e.stopPropagation();
                          openChat(order.user_id);
                        }}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Services */}
                  {order.services?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pl-13">
                      {order.services.map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Order detail dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Order #{selectedOrder?.id}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 text-sm">
              {/* Header card */}
              <div className="rounded-lg border border-border/50 bg-secondary/10 p-4 text-center">
                <Badge variant="outline" className={`mb-2 capitalize ${statusColor(selectedOrder.status)}`}>
                  {selectedOrder.status}
                </Badge>
                <p className="font-semibold text-base">{selectedOrder.title}</p>
              </div>

              {/* Order Information */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Order Information</p>
                <div className="rounded-lg border border-border/30 divide-y divide-border/20">
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-medium">
                      {userMap[selectedOrder.user_id]
                        ? fullName(userMap[selectedOrder.user_id])
                        : `Client #${selectedOrder.user_id}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-muted-foreground">Received</span>
                    <span className="font-medium">{new Date(selectedOrder.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-medium capitalize">{selectedOrder.payment_status}</span>
                  </div>
                  {selectedOrder.services?.length > 0 && (
                    <div className="flex justify-between items-start px-4 py-2.5 gap-2">
                      <span className="text-muted-foreground shrink-0">Services</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {selectedOrder.services.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {selectedOrder.description && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</p>
                  <p className="bg-secondary/10 border border-border/30 rounded-lg p-3 text-sm leading-relaxed">
                    {selectedOrder.description}
                  </p>
                </div>
              )}

              {/* Edit fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Fee Amount ($)</div>
                  <Input
                    type="number" min="0" step="0.01" className="h-9"
                    value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="sm:mr-auto" onClick={() => setSelectedOrder(null)}>
              Close
            </Button>
            <Button
              variant="outline"
              disabled={!selectedOrder || updateOrder.isPending ||
                (newStatus === selectedOrder?.status && Number(newAmount) === (selectedOrder?.amount ?? 0))}
              onClick={() => {
                if (!selectedOrder) return;
                updateOrder.mutate({ id: selectedOrder.id, status: newStatus, amount: Math.max(0, Number(newAmount) || 0) });
              }}
            >
              {updateOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
            {/* Deliver Order — primary gold action */}
            {selectedOrder && selectedOrder.status !== "completed" && selectedOrder.status !== "cancelled" && (
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                disabled={updateOrder.isPending}
                onClick={() => {
                  if (!selectedOrder) return;
                  updateOrder.mutate({
                    id: selectedOrder.id,
                    status: "completed",
                    amount: Math.max(0, Number(newAmount) || 0),
                  });
                }}
              >
                {updateOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                Deliver Order
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Inline chat sheet ───────────────────────────────────────────────── */}
      <Sheet open={!!chatUserId} onOpenChange={(o) => { if (!o) closeChat(); }}>
        <SheetContent side="right" className="w-full sm:w-[400px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-4 border-b border-border/30">
            <SheetTitle className="text-base">
              {chatUserId && userMap[chatUserId]
                ? `${fullName(userMap[chatUserId])} : USER`
                : "Client Chat"}
            </SheetTitle>
          </SheetHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {chatLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground">Start the conversation below</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === numericId;
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary/40 text-foreground rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                      <div className={`text-[10px] mt-0.5 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="border-t border-border/30 px-3 py-3 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Securely send a message..."
                className="flex-1 h-9 text-sm"
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMessage} disabled={!msgText.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {/* Send Order Request */}
            <Button
              variant="outline"
              className="w-full h-9 text-sm border-primary/40 text-primary hover:bg-primary/10"
              onClick={sendOrderRequest}
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              Send Order Request
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
