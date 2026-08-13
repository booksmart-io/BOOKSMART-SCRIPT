import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, MessageSquarePlus, ShieldCheck, Users } from "lucide-react";
import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type CpaTask = {
  id: number; organization_id: number; organization_name: string; client_name: string;
  title: string; description: string; category: string; priority: string;
  status: "open" | "in_progress" | "waiting"; due_date: string | null;
  requires_cpa: boolean; assignment_role: "owner" | "cpa" | "booksmart";
  collaboration_events: Array<{ id: number; event_type: "cpa_acknowledged" | "cpa_note"; note: string | null; created_at: string }>;
};

async function loadCpaTasks() {
  const response = await authenticatedApi("/api/cpa/monitoring/tasks");
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not load client tasks."));
  return response.json() as Promise<{ tasks: CpaTask[]; generated_at: string }>;
}

async function collaborate(taskId: number, action: "acknowledge" | "note", note?: string) {
  const response = await authenticatedApi(`/api/cpa/monitoring/tasks/${taskId}/events`, { method: "POST", body: JSON.stringify({ action, note }) });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not save CPA activity."));
  return response.json();
}

export default function CpaInsights() {
  const [notes, setNotes] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: ["cpa-monitoring-tasks"], queryFn: loadCpaTasks, retry: false });
  const mutation = useMutation({
    mutationFn: ({ taskId, action, note }: { taskId: number; action: "acknowledge" | "note"; note?: string }) => collaborate(taskId, action, note),
    onSuccess: (_, variables) => { setNotes(current => ({ ...current, [variables.taskId]: "" })); queryClient.invalidateQueries({ queryKey: ["cpa-monitoring-tasks"] }); toast({ title: variables.action === "acknowledge" ? "Task acknowledged" : "CPA note saved" }); },
    onError: error => toast({ title: "Could not save activity", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const tasks = query.data?.tasks ?? [];
  return <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div><h1 className="text-2xl font-bold">Client attention</h1><p className="mt-0.5 text-sm text-muted-foreground">Read-only tasks requiring CPA awareness across active client relationships.</p></div>
    <Card><CardContent className="flex gap-3 p-4 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" /><p>Only active clients and tasks marked for CPA involvement appear here. You can acknowledge or leave a note; task status and financial changes remain with the business owner.</p></CardContent></Card>
    {query.isLoading ? <div className="flex min-h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      : query.isError ? <Card><CardContent className="p-6 text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Client tasks are unavailable."}</CardContent></Card>
      : tasks.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-400" /><div><p className="font-semibold">No client tasks need CPA attention</p><p className="mt-1 text-sm text-muted-foreground">BookSmart will show relevant tasks here when an active client needs your involvement.</p></div></CardContent></Card>
      : <div className="grid gap-3">{tasks.map(task => <Card key={task.id}><CardContent className="space-y-3 p-4"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{task.title}</h2><Badge variant="outline" className="capitalize">{task.priority}</Badge><Badge variant="secondary" className="capitalize">{task.status.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{task.description}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{task.client_name} · {task.organization_name}</span>{task.due_date && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Due {new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}</span>}</div></div><div className="flex items-center gap-2 text-xs text-amber-300"><AlertCircle className="h-4 w-4" />CPA awareness</div></div>{task.collaboration_events.length > 0 && <div className="space-y-2 rounded-md border bg-background/30 p-3"><p className="text-xs font-medium">CPA activity</p>{task.collaboration_events.map(event => <div key={event.id} className="text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="capitalize">{event.event_type.replaceAll("_", " ")}</span><span className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span></div>{event.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.note}</p>}</div>)}</div>}<div className="flex flex-col gap-2 border-t pt-3 sm:flex-row"><textarea value={notes[task.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [task.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Add a note for the business owner" className="min-h-10 flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /><div className="flex gap-2 sm:items-start"><Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ taskId: task.id, action: "acknowledge" })}><CheckCircle2 className="mr-1.5 h-4 w-4" />Acknowledge</Button><Button disabled={mutation.isPending || !(notes[task.id] ?? "").trim()} onClick={() => mutation.mutate({ taskId: task.id, action: "note", note: notes[task.id] })}><MessageSquarePlus className="mr-1.5 h-4 w-4" />Add note</Button></div></div></CardContent></Card>)}</div>}
  </div>;
}
