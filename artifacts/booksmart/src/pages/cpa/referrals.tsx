import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Link as LinkIcon, Users, Copy, CheckCircle2, ArrowUpRight, UserPlus, Loader2, Send } from "lucide-react";

type ReferredUser = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  created_at: string;
};

type ReferralOrg = {
  id: number;
  owner_id: number;
  name: string | null;
};

type ReferralOrder = {
  user_id: number;
  status: string;
  amount: number | null;
};

const AVATAR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

function fullName(user: ReferredUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
}

function initials(user: ReferredUser) {
  return fullName(user).slice(0, 2).toUpperCase();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CpaReferrals() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const [copied, setCopied] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const referralLink = `${window.location.origin}/sign-up?ref=${numericId ?? ""}`;

  const { data: referredUsers = [], isLoading: usersLoading } = useQuery<ReferredUser[]>({
    queryKey: ["cpa_referred_users", numericId],
    enabled: !!numericId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, email, created_at")
        .eq("role", "user")
        .eq("referred_by_cpa_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ReferredUser[]) ?? [];
    },
  });

  const referredIds = useMemo(() => referredUsers.map((user) => user.id), [referredUsers]);

  const { data: organizations = [] } = useQuery<ReferralOrg[]>({
    queryKey: ["cpa_referred_orgs", referredIds],
    enabled: referredIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, owner_id, name")
        .in("owner_id", referredIds);
      if (error) throw error;
      return (data as ReferralOrg[]) ?? [];
    },
  });

  const { data: orders = [] } = useQuery<ReferralOrder[]>({
    queryKey: ["cpa_referred_orders", numericId],
    enabled: !!numericId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("user_id, status, amount")
        .eq("cpa_id", numericId!);
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data as ReferralOrder[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    return referredUsers.map((user, index) => {
      const userOrgs = organizations.filter((org) => org.owner_id === user.id);
      const userOrders = orders.filter((order) => order.user_id === user.id);
      const revenue = userOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
      const isActive = userOrgs.length > 0 || userOrders.some((order) => ["active", "completed"].includes(order.status));
      return {
        user,
        color: AVATAR_COLORS[index % AVATAR_COLORS.length],
        business: userOrgs[0]?.name || "No business yet",
        joined: formatDate(user.created_at),
        status: isActive ? "Active" : "Pending",
        revenue: revenue > 0 ? formatMoney(revenue) : "-",
      };
    });
  }, [organizations, orders, referredUsers]);

  const totalReferred = rows.length;
  const activeClients = rows.filter((row) => row.status === "Active").length;
  const pendingClients = Math.max(0, totalReferred - activeClients);
  const referralRate = totalReferred === 0 ? 0 : Math.round((activeClients / totalReferred) * 100);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSendReferral = async () => {
    const email = recipientEmail.trim();
    if (!email) {
      toast.error("Enter the client's email address.");
      return;
    }
    setSendingInvite(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/referrals/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipientEmail: email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "Could not send referral email.");
      setRecipientEmail("");
      toast.success("Referral email sent!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send referral email.");
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Invite clients and track every signup linked to your CPA account.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Referred", value: String(totalReferred), sub: "All time", color: "text-white" },
          { label: "Active Clients", value: String(activeClients), sub: "Business setup complete", color: "text-emerald-400" },
          { label: "Pending", value: String(pendingClients), sub: "Awaiting setup", color: "text-amber-400" },
          { label: "Referral Rate", value: `${referralRate}%`, sub: "Active from referrals", color: "text-purple-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/60 bg-card">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" /> Your Referral Link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-muted-foreground mb-3">
            Share this link with prospective clients. When they sign up, they are automatically linked to your CPA account.
          </p>
          <div className="flex gap-2">
            <Input value={referralLink} readOnly className="bg-muted border-border text-foreground text-xs h-9" />
            <Button
              size="sm"
              onClick={handleCopy}
              disabled={!numericId}
              className="gap-1.5 text-xs bg-[#FFC72B] hover:bg-primary/90 text-primary-foreground font-semibold flex-shrink-0 h-9"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Send Referral Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-muted-foreground mb-3">
            Enter the client's email address. BookSmart will send your referral invite with your tracked signup link.
          </p>
          <div className="flex gap-2">
            <Input
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSendReferral();
              }}
              type="email"
              placeholder="client@example.com"
              className="bg-muted border-border text-foreground text-xs h-9"
            />
            <Button
              size="sm"
              onClick={handleSendReferral}
              disabled={!numericId || sendingInvite}
              className="gap-1.5 text-xs bg-[#FFC72B] hover:bg-primary/90 text-primary-foreground font-semibold flex-shrink-0 h-9"
            >
              {sendingInvite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {sendingInvite ? "Sending..." : "Send Invite"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: LinkIcon, color: "#3b82f6", title: "Share your link", desc: "Send your unique referral link to prospective clients via email or message." },
              { n: 2, icon: UserPlus, color: "#8b5cf6", title: "Client signs up", desc: "They create a BookSmart account using your referral link." },
              { n: 3, icon: ArrowUpRight, color: "#10b981", title: "You get visibility", desc: "The client appears here after signup and becomes active after business setup." },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3 p-3 rounded-xl bg-muted/60 border border-border/40">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${step.color}20`, border: `1px solid ${step.color}40` }}
                >
                  <step.icon className="h-4 w-4" style={{ color: step.color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white mb-0.5">{step.n}. {step.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Referred Clients
            </CardTitle>
            <Badge className="bg-primary/15 text-primary border-[#FFC72B]/30 text-[10px]">{totalReferred} clients</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className="grid gap-2 px-4 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/40"
            style={{ gridTemplateColumns: "2fr 2fr 1.2fr 1fr 1fr" }}
          >
            <span>Client</span>
            <span>Business</span>
            <span>Joined</span>
            <span>Status</span>
            <span>Revenue</span>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading referrals...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No referred clients yet. Share your link to get started.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.user.id}
                className="grid gap-2 px-4 py-3 border-b border-border/30 hover:bg-foreground/[0.02] transition-colors items-center last:border-0"
                style={{ gridTemplateColumns: "2fr 2fr 1.2fr 1fr 1fr" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: row.color }}
                  >
                    {initials(row.user)}
                  </div>
                  <span className="text-xs font-semibold text-white truncate">{fullName(row.user)}</span>
                </div>
                <span className="text-xs text-foreground truncate">{row.business}</span>
                <span className="text-[11px] text-muted-foreground">{row.joined}</span>
                <Badge className={`text-[9px] w-fit ${row.status === "Active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-400/30" : "bg-amber-500/15 text-amber-400 border-amber-400/30"}`}>
                  {row.status}
                </Badge>
                <span className="text-[11px] font-semibold text-foreground">{row.revenue}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
