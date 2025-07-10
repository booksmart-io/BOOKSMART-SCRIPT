import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Clock, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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

function fullName(u: UserRow) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

export default function CpaLeads() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // ── Pending orders assigned to this CPA ───────────────────────────────────
  const { data: leads = [], isLoading } = useQuery<Order[]>({
    queryKey: ["cpa_leads", numericId],
    enabled: !!numericId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("cpa_id", numericId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── User names ─────────────────────────────────────────────────────────────
  const [userMap, setUserMap] = useState<Record<number, UserRow>>({});
  useEffect(() => {
    const ids = [...new Set(leads.map((o) => o.user_id))];
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
  }, [leads]);

  // ── Accept / Decline mutations ─────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "active" ? "Lead accepted — order is now active." : "Lead declined.");
      qc.invalidateQueries({ queryKey: ["cpa_leads", numericId] });
      qc.invalidateQueries({ queryKey: ["cpa_orders", numericId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Incoming Leads</h1>
        <p className="text-muted-foreground">Review and accept client requests assigned to you.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : leads.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-16 text-center">
            <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No pending leads right now.</p>
            <p className="text-xs text-muted-foreground mt-1">New client requests will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {leads.map((lead) => {
            const client = userMap[lead.user_id];
            const isPending = updateStatus.isPending;
            return (
              <Card key={lead.id} className="border-border/50 hover:border-primary/50 transition-colors flex flex-col">
                <CardHeader className="pb-3 border-b border-border/20">
                  <div className="flex justify-between items-start gap-2">
                    <div className="overflow-hidden">
                      <CardTitle className="text-base truncate">{lead.title}</CardTitle>
                      <p className="text-sm text-muted-foreground truncate">
                        {client ? fullName(client) : `Client #${lead.user_id}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 shrink-0">
                      New
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 pt-4 space-y-4">
                  {lead.services?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Services Requested</div>
                      <div className="flex flex-wrap gap-1">
                        {lead.services.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {lead.description && (
                    <div className="bg-secondary/10 p-3 rounded-md border border-secondary/20">
                      <p className="text-sm italic text-muted-foreground">"{lead.description}"</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Received {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
                    {lead.amount > 0 && (
                      <span className="font-medium text-foreground">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(lead.amount)}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1"
                      disabled={isPending}
                      onClick={() => updateStatus.mutate({ id: lead.id, status: "active" })}
                    >
                      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Accept Lead
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-primary"
                      title="Chat with client"
                      onClick={() => navigate("/chat")}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 text-rose-500 hover:bg-rose-500/10 border-rose-500/30"
                      title="Decline lead"
                      disabled={isPending}
                      onClick={() => updateStatus.mutate({ id: lead.id, status: "cancelled" })}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
