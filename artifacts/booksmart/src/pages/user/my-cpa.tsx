import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, ExternalLink, FileText, Loader2, MessageSquare, RefreshCw, ShieldCheck, UserRoundSearch, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { isActiveCpaEngagement } from "@/lib/route-access";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import { loadMonitoring, manageTask, type MonitoringTask } from "@/lib/monitoring-client";
import { useToast } from "@/hooks/use-toast";
import { CPA_SHARED_ACCESS, needsCpaAttention } from "@/lib/my-cpa-access";

type CpaOrder = {
  id: number; cpa_id: number | null; title: string | null; services: string | null;
  description: string | null; status: string; created_at: string;
  cpa: { first_name: string | null; last_name: string | null; email: string | null; phone_number: string | null } | null;
};

type JobberCpaCandidate = { candidateKey: string; title: string; description: string; amount: number; ageDays: number; directUrl: string | null; shared: boolean };
type JobberCpaPreview = {
  organization_id: number; consent_enabled: boolean; active_approved_cpa_engagement: boolean;
  eligible_for_future_escalation: boolean; eligibility_reasons: string[]; candidate_count: number;
  candidates: JobberCpaCandidate[]; dry_run: true; persisted: false; cpa_visibility_changed: false;
};

const cpaName = (order: CpaOrder) => [order.cpa?.first_name, order.cpa?.last_name].filter(Boolean).join(" ") || "Your CPA";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "CPA";

async function loadJobberCpaPreview(organizationId: number): Promise<JobberCpaPreview> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/integrations/jobber/cpa-escalation-preview?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not load Jobber CPA review items.");
  }
  return response.json() as Promise<JobberCpaPreview>;
}

export default function MyCpa() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const { data: organization } = useMonitoringOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
  const jobberCpaPreview = useQuery({
    queryKey: ["jobber-cpa-escalation-preview", organization?.id ?? null], enabled: Boolean(organization?.id),
    queryFn: () => loadJobberCpaPreview(organization!.id), retry: false, staleTime: 60_000,
  });
  const shareJobberCandidate = useMutation({
    mutationFn: async (candidateKey: string) => {
      if (!organization?.id) throw new Error("No active organization is available.");
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/integrations/jobber/cpa-escalations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ organization_id: organization.id, candidate_key: candidateKey }),
      });
      const body = await response.json().catch(() => null) as { message?: string; already_shared?: boolean } | null;
      if (!response.ok) throw new Error(body?.message ?? "Could not share this Jobber item.");
      return body;
    },
    onSuccess: async result => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobber-cpa-escalation-preview", organization?.id] }),
        queryClient.invalidateQueries({ queryKey: ["monitoring-projection", organization?.id] }),
      ]);
      toast({ title: result?.already_shared ? "Already shared with your CPA" : "Shared with your CPA", description: "The item is now available in CPA client attention with an audit record." });
    },
    onError: error => toast({ title: "Could not share item", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const escalate = useMutation({
    mutationFn: (task: MonitoringTask) => manageTask(organization!.id, task.id, { priority: task.priority, dueDate: task.due_date, assignmentRole: "cpa" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["monitoring-projection", organization?.id] }); toast({ title: "Task assigned to your CPA" }); },
    onError: error => toast({ title: "Could not assign task", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  const activeOrders = orders.filter(order => isActiveCpaEngagement(order.status) && order.cpa_id);
  const current = activeOrders[0] ?? orders.find(order => order.cpa_id) ?? null;
  const cpaAttention = (monitoring.data?.signals ?? []).filter(needsCpaAttention);
  const activeTasks = (monitoring.data?.tasks ?? []).filter(task => ["open", "in_progress", "waiting"].includes(task.status));
  const cpaTasks = activeTasks.filter(task => task.assignment_role === "cpa" || task.requires_cpa);

  return <div className="monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
    <div><h1 className="text-2xl font-bold md:text-3xl">My CPA</h1><p className="mt-1 text-sm text-muted-foreground">Your financial partner.</p></div>

    {isError ? <Card><CardContent className="p-6"><p className="font-medium">CPA relationship data is unavailable.</p><p className="mt-1 text-sm text-muted-foreground">No access or order information was changed.</p></CardContent></Card> : !current ? <Card><CardContent className="flex flex-col items-center gap-4 p-10 text-center"><div className="rounded-full bg-primary/10 p-4"><UserRoundSearch className="h-8 w-8 text-primary" /></div><div><h2 className="text-xl font-semibold">You do not have a CPA engagement yet</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Choose a verified professional through the existing CPA Network. BookSmart will show the relationship here after an engagement becomes active.</p></div><Button asChild><Link href="/user/cpa-network">Find a CPA</Link></Button></CardContent></Card> : <>
      <Card><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"><Avatar className="h-14 w-14"><AvatarFallback className="bg-violet-500 text-base text-white">{initials(cpaName(current))}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">{cpaName(current)}</h2>{current.cpa?.email && <p className="truncate text-sm text-muted-foreground">{current.cpa.email}</p>}{current.cpa?.phone_number && <p className="text-sm text-muted-foreground">{current.cpa.phone_number}</p>}</div><Button asChild className="w-full sm:w-auto" disabled={!current.cpa_id}><Link href={`/user/chat?cpa_id=${current.cpa_id}`}><MessageSquare className="mr-2 h-4 w-4" />Message CPA</Link></Button></CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card><CardHeader><CardTitle>Current engagements</CardTitle><CardDescription>Services currently active with your CPA.</CardDescription></CardHeader><CardContent className="space-y-3">{activeOrders.length === 0 ? <p className="text-sm text-muted-foreground">There is no active CPA engagement. Previous requests remain available in Orders.</p> : activeOrders.map(order => <div key={order.id} className="flex items-start justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">{order.title ?? order.services ?? "CPA service"}</p><p className="mt-1 text-xs text-muted-foreground">Started {new Date(order.created_at).toLocaleDateString()}</p></div><Badge className="capitalize">{order.status.replaceAll("_", " ")}</Badge></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>{activeOrders.length ? "What your CPA can access" : "CPA access is inactive"}</CardTitle><CardDescription>{activeOrders.length ? "This access is read from the existing active-engagement rules." : "No financial information is currently shared through an active engagement."}</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="font-medium">Permission remains status-controlled</p><p className="text-sm text-muted-foreground">CPA financial access is limited to active engagements by the current access rules.</p></div></div>
          {activeOrders.length > 0 && <ul className="space-y-2 rounded-lg border p-4 text-sm">{CPA_SHARED_ACCESS.map(item => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{item}</span></li>)}</ul>}
          <div className="flex gap-3"><FileText className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Accounting remains the source of truth</p><p className="text-sm text-muted-foreground">My CPA does not copy reports, transactions, or documents into another ledger.</p></div></div>
          <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-cyan-400" /><div><p className="font-medium">Existing communication</p><p className="text-sm text-muted-foreground">Messages continue through BookSmart’s current Chat workflow.</p></div></div>
        </CardContent></Card>
      </div>
    </>}

    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><CardTitle>Jobber items for CPA review</CardTitle><Badge variant="outline">Owner-only preview</Badge></div><CardDescription className="mt-1">Material completed work that may need future CPA attention. Preview results are not shared with your CPA.</CardDescription></div>
        <Button size="sm" variant="outline" disabled={jobberCpaPreview.isFetching || !organization?.id} onClick={() => void jobberCpaPreview.refetch()}>{jobberCpaPreview.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {jobberCpaPreview.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking synchronized Jobber work...</div>
          : jobberCpaPreview.isError ? <div className="rounded-lg border p-4"><p className="font-medium">Jobber review is unavailable</p><p className="mt-1 text-sm text-muted-foreground">Connect and synchronize Jobber in Settings, then try again. No data was changed.</p></div>
          : !jobberCpaPreview.data?.consent_enabled ? <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">CPA sharing consent is off</p><p className="mt-1 text-sm text-muted-foreground">Turn on consent in Settings to evaluate qualifying Jobber work. Nothing is currently shared.</p></div><Button asChild size="sm" variant="outline"><Link href="/user/settings">Open Settings</Link></Button></div>
          : !jobberCpaPreview.data.active_approved_cpa_engagement ? <div className="rounded-lg border p-4"><p className="font-medium">An approved active CPA engagement is required</p><p className="mt-1 text-sm text-muted-foreground">Jobber items remain private until both consent and an eligible CPA relationship are present.</p></div>
          : jobberCpaPreview.data.candidates.length === 0 ? <div className="flex gap-3 rounded-lg border p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><div><p className="font-medium">No qualifying Jobber items</p><p className="mt-1 text-sm text-muted-foreground">No synchronized job currently meets the $5,000, explicit completion date, and 14-day requirements.</p></div></div>
          : jobberCpaPreview.data.candidates.map(candidate => <article key={candidate.candidateKey} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{candidate.title}</p><p className="mt-1 text-sm text-muted-foreground">{candidate.description}</p></div><p className="font-semibold">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(candidate.amount)}</p></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{candidate.ageDays} days since recorded completion</span>{candidate.directUrl?.startsWith("https://") && <a href={candidate.directUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Open in Jobber <ExternalLink className="h-3 w-3" /></a>}</div>{candidate.shared ? <Badge className="bg-emerald-500/15 text-emerald-300">Shared with CPA</Badge> : <Button size="sm" disabled={shareJobberCandidate.isPending} onClick={() => { if (window.confirm("Share this Jobber review item with your active CPA? This creates a CPA-visible task and audit record.")) shareJobberCandidate.mutate(candidate.candidateKey); }}>{shareJobberCandidate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Share with CPA</Button>}</div></article>)}
        {jobberCpaPreview.data && <p className="text-xs text-muted-foreground">Nothing is shared automatically. Only items you explicitly approve become CPA-visible tasks; Jobber amounts remain non-accounting operational evidence.</p>}
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle>CPA Attention Needed {cpaAttention.length > 0 && <Badge className="ml-2 bg-red-500/20 text-red-300">{cpaAttention.length}</Badge>}</CardTitle><CardDescription>Financial events where professional review may be useful.</CardDescription></CardHeader><CardContent className="space-y-3">{monitoring.isError ? <p className="text-sm text-muted-foreground">CPA review signals are temporarily unavailable.</p> : cpaAttention.length === 0 ? <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="font-medium">No active CPA review items</p><p className="text-sm text-muted-foreground">BookSmart will show supported financial events here when professional review is justified.</p></div></div> : cpaAttention.slice(0, 5).map(signal => <div key={signal.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /><div><p className="font-medium">{signal.title}</p><p className="text-sm text-muted-foreground">{signal.description}</p><p className="mt-1 text-xs capitalize text-amber-300">CPA review {signal.cpa_review_level}</p></div></div>{signal.cta_route && <Button asChild size="sm" variant="outline"><Link href={signal.cta_route}>{signal.cta_label ?? "Review"}</Link></Button>}</div>)}</CardContent></Card>

    <Card><CardHeader><CardTitle>CPA Tasks {cpaTasks.length > 0 && <Badge className="ml-2" variant="outline">{cpaTasks.length}</Badge>}</CardTitle><CardDescription>Persisted work that needs CPA awareness or has been assigned to your CPA. Open a task to see CPA acknowledgements and notes in its activity history.</CardDescription></CardHeader><CardContent className="space-y-3">{monitoring.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading CPA tasks…</div> : monitoring.isError ? <p className="text-sm text-muted-foreground">CPA tasks are temporarily unavailable.</p> : cpaTasks.length === 0 ? <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="font-medium">No active CPA tasks</p><p className="text-sm text-muted-foreground">Escalated tasks will appear here and in your CPA’s client-attention view.</p></div></div> : cpaTasks.slice(0, 6).map(task => <div key={task.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">{task.title}</p><p className="text-sm text-muted-foreground">{task.description}</p><p className="mt-1 text-xs text-muted-foreground">{task.assignment_role === "cpa" ? "Assigned to CPA" : "CPA review recommended"}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}` : ""}</p></div></div>{task.assignment_role !== "cpa" && activeOrders.length > 0 ? <Button size="sm" variant="outline" disabled={escalate.isPending} onClick={() => escalate.mutate(task)}>Assign to CPA</Button> : <Button asChild size="sm" variant="ghost"><Link href="/user/tasks">View activity</Link></Button>}</div>)}</CardContent></Card>

    <Card><CardHeader><CardTitle>Next recommended review</CardTitle><CardDescription>Plan your next financial check-in.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">No review scheduled</p><p className="text-sm text-muted-foreground">Message your CPA to choose a date for your next review.</p></div></div><Button asChild variant="outline"><Link href={current?.cpa_id ? `/user/chat?cpa_id=${current.cpa_id}` : "/user/cpa-network"}><Clock3 className="mr-2 h-4 w-4" />{current?.cpa_id ? "Ask your CPA" : "Find a CPA"}</Link></Button></CardContent></Card>
  </div>;
}
