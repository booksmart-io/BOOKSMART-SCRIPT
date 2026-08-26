import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Plus,
  Clock3,
  DollarSign,
  History,
  Landmark,
  Loader2,
  PauseCircle,
  RotateCcw,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import {
  createTask,
  loadMonitoring,
  loadTaskEvents,
  manageTask,
  updateTask,
  type MonitoringTask,
} from "@/lib/monitoring-client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  taskAssignmentLabel,
  taskSourceLabel,
} from "@/lib/monitoring-task-presentation";
import { ContractorMatchReview } from "@/components/monitoring/contractor-match-review";

const statuses = ["active", "completed", "dismissed"] as const;
const statusLabel = (status: string) => status.replaceAll("_", " ");

function TaskGlyph({ task }: { task: MonitoringTask }) {
  const text = `${task.category} ${task.title}`.toLowerCase();
  if (text.includes("tax") || text.includes("cash"))
    return <AlertCircle className="h-5 w-5" />;
  if (text.includes("categor") || text.includes("review"))
    return <ClipboardList className="h-5 w-5" />;
  if (text.includes("payroll") || text.includes("invoice"))
    return <DollarSign className="h-5 w-5" />;
  if (
    text.includes("connect") ||
    text.includes("quickbooks") ||
    text.includes("bank")
  )
    return <Landmark className="h-5 w-5" />;
  if (task.due_date) return <CalendarDays className="h-5 w-5" />;
  return <Clock3 className="h-5 w-5" />;
}

function SectionGlyph({ label }: { label: string }) {
  if (label === "Today") return <AlertCircle className="h-3.5 w-3.5" />;
  if (label === "This Week") return <ClipboardList className="h-3.5 w-3.5" />;
  if (label === "Completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (label === "Dismissed") return <XCircle className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

export default function MonitoringTasks() {
  const { data: organization, isLoading: orgLoading } =
    useMonitoringOrganization();
  const orgId = organization?.id ?? null;
  const initialParams = new URLSearchParams(window.location.search);
  const requestedTaskId = Number(initialParams.get("task_id"));
  const requestedAssignmentId = Number(initialParams.get("assignment_id"));
  const requestedTransactionId = Number(initialParams.get("transaction_id"));
  const [filter, setFilter] = useState<(typeof statuses)[number]>("active");
  const [expandedTask, setExpandedTask] = useState<number | null>(Number.isSafeInteger(requestedTaskId) && requestedTaskId > 0 ? requestedTaskId : null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    dueDate: "",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const monitoring = useQuery({
    queryKey: ["monitoring-projection", orgId],
    enabled: orgId !== null,
    queryFn: () => loadMonitoring(orgId!),
    retry: false,
  });
  useEffect(() => {
    if (!monitoring.data || !Number.isSafeInteger(requestedTaskId) || requestedTaskId <= 0) return;
    const task = monitoring.data.tasks.find(item => item.id === requestedTaskId);
    if (!task) return;
    setFilter(task.status === "completed" ? "completed" : task.status === "dismissed" ? "dismissed" : "active");
    setExpandedTask(task.id);
    window.setTimeout(() => document.getElementById(`financial-task-${task.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [monitoring.data, requestedTaskId]);
  const history = useQuery({
    queryKey: ["monitoring-task-history", orgId, expandedTask],
    enabled: orgId !== null && expandedTask !== null,
    queryFn: () => loadTaskEvents(orgId!, expandedTask!),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      task,
      status,
    }: {
      task: MonitoringTask;
      status: MonitoringTask["status"];
    }) => updateTask(orgId!, task.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["monitoring-projection", orgId],
      });
      queryClient.invalidateQueries({
        queryKey: ["monitoring-task-history", orgId],
      });
      toast({ title: "Task updated" });
    },
    onError: (error) =>
      toast({
        title: "Could not update task",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createTask(orgId!, {
        requestId: crypto.randomUUID(),
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        dueDate: newTask.dueDate || null,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setNewTask({
        title: "",
        description: "",
        priority: "medium",
        dueDate: "",
      });
      queryClient.invalidateQueries({
        queryKey: ["monitoring-projection", orgId],
      });
      toast({ title: "Task created" });
    },
    onError: (error) =>
      toast({
        title: "Could not create task",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });
  const manageMutation = useMutation({
    mutationFn: ({
      task,
      priority,
      dueDate,
      assignmentRole,
    }: {
      task: MonitoringTask;
      priority: string;
      dueDate: string | null;
      assignmentRole: MonitoringTask["assignment_role"];
    }) => manageTask(orgId!, task.id, { priority, dueDate, assignmentRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["monitoring-projection", orgId],
      });
      queryClient.invalidateQueries({
        queryKey: ["monitoring-task-history", orgId],
      });
      toast({ title: "Task details updated" });
    },
    onError: (error) =>
      toast({
        title: "Could not update task",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });

  if (orgLoading || monitoring.isLoading)
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  if (!orgId || monitoring.isError)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card>
          <CardContent className="p-6">
            <CardTitle>Tasks are unavailable</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Restart the local API server and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );

  const tasks = (monitoring.data?.tasks ?? []).filter((task) =>
    filter === "active"
      ? ["open", "in_progress", "waiting"].includes(task.status)
      : task.status === filter,
  );
  const actions = (task: MonitoringTask) =>
    task.status === "open"
      ? ([
          ["Start", "in_progress", Circle],
          ["Complete", "completed", CheckCircle2],
          ["Dismiss", "dismissed", XCircle],
        ] as const)
      : task.status === "in_progress"
        ? ([
            ["Wait", "waiting", PauseCircle],
            ["Complete", "completed", CheckCircle2],
            ["Dismiss", "dismissed", XCircle],
          ] as const)
        : task.status === "waiting"
          ? ([
              ["Resume", "in_progress", Clock3],
              ["Complete", "completed", CheckCircle2],
              ["Dismiss", "dismissed", XCircle],
            ] as const)
          : ([["Reopen", "open", RotateCcw]] as const);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groupFor = (task: MonitoringTask) => {
    if (!task.due_date) return "Today";
    const due = new Date(`${task.due_date}T00:00:00`);
    const daysAway = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    return daysAway <= 0 ? "Today" : daysAway <= 7 ? "This Week" : "Upcoming";
  };
  const groups =
    filter === "active"
      ? ["Today", "This Week", "Upcoming"].map((label) => ({
          label,
          tasks: tasks.filter((task) => groupFor(task) === label),
        }))
      : [{ label: filter === "completed" ? "Completed" : "Dismissed", tasks }];

  return (
    <div className="monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Stay on top of what matters
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New task
          </Button>
          <select
            aria-label="Task status"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as (typeof statuses)[number])
            }
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-xs capitalize outline-none sm:flex-none"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "active" ? "All Tasks" : status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ContractorMatchReview organizationId={orgId} highlightAssignmentId={Number.isSafeInteger(requestedAssignmentId) && requestedAssignmentId > 0 ? requestedAssignmentId : null} highlightTransactionId={Number.isSafeInteger(requestedTransactionId) && requestedTransactionId > 0 ? requestedTransactionId : null} />

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No {filter} tasks.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const groupTone =
            group.label === "Today"
              ? "border-red-400/30 bg-red-500/15 text-red-300"
              : group.label === "This Week"
                ? "border-amber-400/30 bg-amber-400/15 text-amber-300"
                : group.label === "Completed"
                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-400/30 bg-slate-400/10 text-slate-300";
          return (
            <section key={group.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{group.label}</h2>
                <Badge variant="outline" className={`gap-1.5 ${groupTone}`}>
                  <SectionGlyph label={group.label} />
                  {group.tasks.length}
                </Badge>
              </div>
              <Card className="overflow-hidden">
                <CardContent className="divide-y p-0">
                  {group.tasks.length === 0 ? (
                    <div className="flex items-center gap-3 px-4 py-4 text-sm text-muted-foreground">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${groupTone}`}
                      >
                        <SectionGlyph label={group.label} />
                      </div>
                      <span>
                        No tasks scheduled for {group.label.toLowerCase()}.
                      </span>
                    </div>
                  ) : (
                    group.tasks.map((task) => {
                      const expanded = expandedTask === task.id;
                      const tone = ["high", "critical"].includes(task.priority)
                        ? "border-red-400/30 bg-red-500/15 text-red-300"
                        : task.priority === "medium"
                          ? "border-amber-400/30 bg-amber-400/15 text-amber-300"
                          : "border-emerald-400/30 bg-emerald-500/15 text-emerald-300";
                      return (
                        <div key={task.id} id={`financial-task-${task.id}`} className={requestedTaskId === task.id ? "ring-2 ring-primary/50 ring-inset" : undefined}>
                          <div className="grid grid-cols-[40px_minmax(0,1fr)_auto_32px] items-center gap-2.5 px-3 py-3.5 sm:grid-cols-[44px_minmax(0,1fr)_auto_36px] sm:gap-3 sm:px-4 sm:py-4">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}
                            >
                              <TaskGlyph task={task} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold leading-5">
                                {task.title}
                              </h3>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                                {task.description}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                {task.due_date && (
                                  <span>
                                    Due{" "}
                                    {new Date(
                                      `${task.due_date}T00:00:00`,
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  {task.assignment_role === "cpa" ? (
                                    <Users className="h-3 w-3" />
                                  ) : (
                                    <UserRound className="h-3 w-3" />
                                  )}
                                  {taskAssignmentLabel(task.assignment_role)}
                                </span>
                                {task.requires_cpa &&
                                  task.assignment_role !== "cpa" && (
                                    <span>CPA review recommended</span>
                                  )}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 capitalize ${tone}`}
                            >
                              {task.priority}
                            </Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() =>
                                setExpandedTask(expanded ? null : task.id)
                              }
                              aria-label={`Open ${task.title}`}
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                              />
                            </Button>
                          </div>
                          {expanded && (
                            <div className="border-t bg-background/20 px-3 py-3 sm:px-4">
                              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="secondary">
                                  {taskAssignmentLabel(task.assignment_role)}
                                </Badge>
                                {task.requires_cpa && (
                                  <Badge variant="outline">
                                    CPA involvement
                                  </Badge>
                                )}
                                <span>{taskSourceLabel(task.source)}</span>
                              </div>
                              <form
                                className="mb-3 grid gap-2 rounded-md border p-3 sm:grid-cols-3"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const form = new FormData(
                                    event.currentTarget,
                                  );
                                  manageMutation.mutate({
                                    task,
                                    priority: String(form.get("priority")),
                                    dueDate:
                                      String(form.get("dueDate") || "") || null,
                                    assignmentRole: String(
                                      form.get("assignmentRole"),
                                    ) as MonitoringTask["assignment_role"],
                                  });
                                }}
                              >
                                <label className="text-xs">
                                  Priority
                                  <select
                                    name="priority"
                                    defaultValue={task.priority}
                                    className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                                  >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                  </select>
                                </label>
                                <label className="text-xs">
                                  Due date
                                  <Input
                                    name="dueDate"
                                    type="date"
                                    defaultValue={task.due_date ?? ""}
                                    className="mt-1"
                                  />
                                </label>
                                <label className="text-xs">
                                  Assignment
                                  <select
                                    name="assignmentRole"
                                    defaultValue={task.assignment_role}
                                    className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                                  >
                                    <option value="owner">
                                      Business owner
                                    </option>
                                    <option value="cpa">CPA</option>
                                    <option value="booksmart">BookSmart</option>
                                  </select>
                                </label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="sm:col-start-3"
                                  disabled={manageMutation.isPending}
                                >
                                  Save details
                                </Button>
                              </form>
                              <div className="flex flex-wrap justify-end gap-2">
                                {actions(task).map(([label, status, Icon]) => (
                                  <Button
                                    key={label}
                                    size="sm"
                                    variant={
                                      status === "completed"
                                        ? "default"
                                        : "outline"
                                    }
                                    disabled={mutation.isPending}
                                    onClick={() =>
                                      mutation.mutate({ task, status })
                                    }
                                  >
                                    <Icon className="mr-1.5 h-4 w-4" />
                                    {label}
                                  </Button>
                                ))}
                                {task.cta_route && (
                                  <Button asChild size="sm" variant="ghost">
                                    <Link href={task.cta_route}>
                                      {task.cta_label ?? "Review"}
                                    </Link>
                                  </Button>
                                )}
                              </div>
                              <div className="mt-3 border-t pt-3">
                                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                                  <History className="h-3.5 w-3.5" />
                                  Activity history
                                </p>
                                {history.isLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : history.data?.events.length ? (
                                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                    {history.data.events.map((event) => (
                                      <div key={event.id} className="text-xs">
                                        <div className="flex justify-between gap-3">
                                          <span className="capitalize">
                                            {statusLabel(event.event_type)}
                                          </span>
                                          <span className="shrink-0 text-muted-foreground">
                                            {new Date(
                                              event.created_at,
                                            ).toLocaleString()}
                                          </span>
                                        </div>
                                        {event.note && (
                                          <p className="mt-1 whitespace-pre-wrap rounded bg-background/40 px-2 py-1.5 text-muted-foreground">
                                            {event.note}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No task history yet.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </section>
          );
        })
      )}
      <p className="text-center text-xs text-muted-foreground">
        Completed tasks remain available from the status menu.
      </p>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
            <DialogDescription>
              Add owner-managed work without changing accounting records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Task title"
              value={newTask.title}
              maxLength={160}
              onChange={(event) =>
                setNewTask((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Description"
              maxLength={2000}
              value={newTask.description}
              onChange={(event) =>
                setNewTask((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={newTask.priority}
                onChange={(event) =>
                  setNewTask((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="critical">Critical priority</option>
              </select>
              <Input
                type="date"
                value={newTask.dueDate}
                onChange={(event) =>
                  setNewTask((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newTask.title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
