import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, FileText, Loader2, MessageSquare, ShieldCheck, UserRoundSearch } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { isActiveCpaEngagement } from "@/lib/route-access";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import { loadMonitoring } from "@/lib/monitoring-client";

type CpaOrder = {
  id: number; cpa_id: number | null; title: string | null; services: string | null;
  description: string | null; status: string; created_at: string;
  cpa: { first_name: string | null; last_name: string | null; email: string | null; phone_number: string | null } | null;
};

const cpaName = (order: CpaOrder) => [order.cpa?.first_name, order.cpa?.last_name].filter(Boolean).join(" ") || "Your CPA";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "CPA";

export default function MyCpa() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const { data: organization } = useMonitoringOrganization();
  const { data: orders = [], isLoading, isError } = useQuery<CpaOrder[]>({
    queryKey: ["my-cpa-orders", numericId], enabled: numericId !== null, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id,cpa_id,title,services,description,status,created_at,cpa:users!cpa_id(first_name,last_name,email,phone_number)")
        .eq("user_id", numericId!).order("created_at", { ascending: false });
      if (error) { if (error.code === "42P01") return []; throw error; }
      return (data ?? []) as unknown as CpaOrder[];
    },
  });
  const monitoring = useQuery({
    queryKey: ["monitoring-projection", organization?.id ?? null], enabled: Boolean(organization?.id),
    queryFn: () => loadMonitoring(organization!.id), retry: false,
  });

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  const activeOrders = orders.filter(order => isActiveCpaEngagement(order.status) && order.cpa_id);
  const current = activeOrders[0] ?? orders.find(order => order.cpa_id) ?? null;
  const cpaAttention = (monitoring.data?.signals ?? []).filter(signal => signal.status === "active" && ["optional", "recommended", "urgent"].includes(signal.cpa_review_level));

  return <div className="monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
    <div><h1 className="text-2xl font-bold md:text-3xl">My CPA</h1><p className="mt-1 text-sm text-muted-foreground">Your financial partner.</p></div>

    {isError ? <Card><CardContent className="p-6"><p className="font-medium">CPA relationship data is unavailable.</p><p className="mt-1 text-sm text-muted-foreground">No access or order information was changed.</p></CardContent></Card> : !current ? <Card><CardContent className="flex flex-col items-center gap-4 p-10 text-center"><div className="rounded-full bg-primary/10 p-4"><UserRoundSearch className="h-8 w-8 text-primary" /></div><div><h2 className="text-xl font-semibold">You do not have a CPA engagement yet</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Choose a verified professional through the existing CPA Network. BookSmart will show the relationship here after an engagement becomes active.</p></div><Button asChild><Link href="/user/cpa-network">Find a CPA</Link></Button></CardContent></Card> : <>
      <Card><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"><Avatar className="h-14 w-14"><AvatarFallback className="bg-violet-500 text-base text-white">{initials(cpaName(current))}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">{cpaName(current)}</h2>{current.cpa?.email && <p className="truncate text-sm text-muted-foreground">{current.cpa.email}</p>}{current.cpa?.phone_number && <p className="text-sm text-muted-foreground">{current.cpa.phone_number}</p>}</div><Button asChild className="w-full sm:w-auto" disabled={!current.cpa_id}><Link href={`/user/chat?cpa_id=${current.cpa_id}`}><MessageSquare className="mr-2 h-4 w-4" />Message CPA</Link></Button></CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card><CardHeader><CardTitle>Current engagements</CardTitle><CardDescription>Services currently active with your CPA.</CardDescription></CardHeader><CardContent className="space-y-3">{activeOrders.length === 0 ? <p className="text-sm text-muted-foreground">There is no active CPA engagement. Previous requests remain available in Orders.</p> : activeOrders.map(order => <div key={order.id} className="flex items-start justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">{order.title ?? order.services ?? "CPA service"}</p><p className="mt-1 text-xs text-muted-foreground">Started {new Date(order.created_at).toLocaleDateString()}</p></div><Badge className="capitalize">{order.status.replaceAll("_", " ")}</Badge></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>{activeOrders.length ? "BookSmart has shared" : "CPA access is inactive"}</CardTitle><CardDescription>{activeOrders.length ? "Access available through the active CPA relationship." : "No financial information is currently shared through an active engagement."}</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="font-medium">Permission remains status-controlled</p><p className="text-sm text-muted-foreground">CPA financial access is limited to active engagements by the current access rules.</p></div></div>
          <div className="flex gap-3"><FileText className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Accounting remains the source of truth</p><p className="text-sm text-muted-foreground">My CPA does not copy reports, transactions, or documents into another ledger.</p></div></div>
          <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-cyan-400" /><div><p className="font-medium">Existing communication</p><p className="text-sm text-muted-foreground">Messages continue through BookSmart’s current Chat workflow.</p></div></div>
        </CardContent></Card>
      </div>
    </>}

    <Card><CardHeader><CardTitle>CPA Attention Needed {cpaAttention.length > 0 && <Badge className="ml-2 bg-red-500/20 text-red-300">{cpaAttention.length}</Badge>}</CardTitle><CardDescription>Financial events where professional review may be useful.</CardDescription></CardHeader><CardContent className="space-y-3">{monitoring.isError ? <p className="text-sm text-muted-foreground">CPA review signals are temporarily unavailable.</p> : cpaAttention.length === 0 ? <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="font-medium">No active CPA review items</p><p className="text-sm text-muted-foreground">BookSmart will show supported financial events here when professional review is justified.</p></div></div> : cpaAttention.slice(0, 5).map(signal => <div key={signal.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /><div><p className="font-medium">{signal.title}</p><p className="text-sm text-muted-foreground">{signal.description}</p><p className="mt-1 text-xs capitalize text-amber-300">CPA review {signal.cpa_review_level}</p></div></div>{signal.cta_route && <Button asChild size="sm" variant="outline"><Link href={signal.cta_route}>{signal.cta_label ?? "Review"}</Link></Button>}</div>)}</CardContent></Card>

    <Card><CardHeader><CardTitle>Next recommended review</CardTitle><CardDescription>Plan your next financial check-in.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">No review scheduled</p><p className="text-sm text-muted-foreground">Message your CPA to choose a date for your next review.</p></div></div><Button asChild variant="outline"><Link href={current?.cpa_id ? `/user/chat?cpa_id=${current.cpa_id}` : "/user/cpa-network"}><Clock3 className="mr-2 h-4 w-4" />{current?.cpa_id ? "Ask your CPA" : "Find a CPA"}</Link></Button></CardContent></Card>
  </div>;
}
