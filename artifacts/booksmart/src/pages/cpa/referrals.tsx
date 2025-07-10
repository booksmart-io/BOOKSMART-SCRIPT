import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Link as LinkIcon, Users, Copy, CheckCircle2, ArrowUpRight, UserPlus, ChevronRight } from "lucide-react";

const REFERRED = [
  { initials: "TS", color: "#3b82f6", name: "Taylor Smith", business: "Smith Designs LLC", joined: "Jan 12, 2025", status: "Active", revenue: "$24,300" },
  { initials: "JB", color: "#8b5cf6", name: "James Brown", business: "Prime Build Co.", joined: "Feb 3, 2025", status: "Active", revenue: "$18,600" },
  { initials: "MC", color: "#10b981", name: "Maria Chen", business: "Bloom Wellness", joined: "Mar 8, 2025", status: "Active", revenue: "$11,780" },
  { initials: "DW", color: "#f59e0b", name: "David Wilson", business: "Wilson Consulting", joined: "Mar 22, 2025", status: "Active", revenue: "$31,400" },
  { initials: "LW", color: "#ef4444", name: "Laura White", business: "White Legal LLC", joined: "Apr 15, 2025", status: "Pending", revenue: "—" },
];

export default function CpaReferrals() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const [copied, setCopied] = useState(false);

  const referralLink = `${window.location.origin}/signup?ref=${numericId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Invite clients and earn rewards for every successful referral.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Referred", value: "14", sub: "All time", color: "text-white" },
          { label: "Active Clients", value: "13", sub: "Currently engaged", color: "text-emerald-400" },
          { label: "Pending", value: "1", sub: "Awaiting sign up", color: "text-amber-400" },
          { label: "Referral Rate", value: "50%", sub: "Of your total clients", color: "text-purple-400" },
        ].map(s => (
          <Card key={s.label} className="border-border/60 bg-card">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral link card */}
      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" /> Your Referral Link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-muted-foreground mb-3">
            Share this link with prospective clients. When they sign up, they're automatically linked to your account.
          </p>
          <div className="flex gap-2">
            <Input
              value={referralLink}
              readOnly
              className="bg-muted border-border text-foreground text-xs h-9"
            />
            <Button size="sm" onClick={handleCopy}
              className="gap-1.5 text-xs bg-[#FFC72B] hover:bg-primary/90 text-primary-foreground font-semibold flex-shrink-0 h-9">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: LinkIcon, color: "#3b82f6", title: "Share your link", desc: "Send your unique referral link to prospective clients via email or message." },
              { n: 2, icon: UserPlus, color: "#8b5cf6", title: "Client signs up", desc: "They create a Booksmart account and connect their business financial data." },
              { n: 3, icon: ArrowUpRight, color: "#10b981", title: "You get visibility", desc: "Monitor their progress, health score, and key financial insights." },
            ].map(step => (
              <div key={step.n} className="flex items-start gap-3 p-3 rounded-xl bg-muted/60 border border-border/40">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${step.color}20`, border: `1px solid ${step.color}40` }}>
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

      {/* Referred clients list */}
      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Referred Clients
            </CardTitle>
            <Badge className="bg-primary/15 text-primary border-[#FFC72B]/30 text-[10px]">{REFERRED.length} clients</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-2 px-4 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/40"
            style={{ gridTemplateColumns: "2fr 2fr 1.2fr 1fr 1fr" }}>
            <span>Client</span>
            <span>Business</span>
            <span>Joined</span>
            <span>Status</span>
            <span>Revenue</span>
          </div>
          {REFERRED.map(c => (
            <div key={c.name}
              className="grid gap-2 px-4 py-3 border-b border-border/30 hover:bg-foreground/[0.02] transition-colors items-center last:border-0"
              style={{ gridTemplateColumns: "2fr 2fr 1.2fr 1fr 1fr" }}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: c.color }}>{c.initials}</div>
                <span className="text-xs font-semibold text-white truncate">{c.name}</span>
              </div>
              <span className="text-xs text-foreground truncate">{c.business}</span>
              <span className="text-[11px] text-muted-foreground">{c.joined}</span>
              <Badge className={`text-[9px] w-fit ${c.status === "Active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-400/30" : "bg-amber-500/15 text-amber-400 border-amber-400/30"}`}>
                {c.status}
              </Badge>
              <span className="text-[11px] font-semibold text-foreground">{c.revenue}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
