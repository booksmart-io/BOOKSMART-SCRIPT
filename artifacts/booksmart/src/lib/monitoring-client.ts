import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import type { InsightCalculation, InsightEvidenceReference } from "@/components/monitoring/insight-evidence-map";

export type MonitoringSignal = {
  id: number; signal_key: string; title: string; description: string; severity: string; category: string;
  status: "active" | "resolved" | "dismissed" | "expired"; percentage: number | null; current_value: number | null;
  cta_label: string | null; cta_route: string | null; recommended_action: string | null;
  requires_cpa_review: boolean; cpa_review_level: string; detected_at: string; updated_at: string;
  period_start: string | null; period_end: string | null; comparison_start: string | null; comparison_end: string | null;
  source_ids: Array<number | string>; exclusions: string[]; calculation_version: string; confidence: number | null;
  metadata?: { provider?: string; direct_url?: string | null; source_record_type?: string | null; accounting_effect?: string; evidence?: InsightEvidenceReference[]; calculation?: InsightCalculation | null };
};
export type MonitoringTask = {
  id: number; title: string; description: string; category: string; priority: string;
  status: "open" | "in_progress" | "waiting" | "completed" | "dismissed";
  due_date: string | null; cta_label: string | null; cta_route: string | null; requires_cpa: boolean;
  source: string; source_id: string | null; assigned_user_id: number | null;
  assignment_role: "owner" | "cpa" | "booksmart";
  created_at: string; updated_at: string;
};
export type TaskEvent = { id: number; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string };
export type MonitoringData = { signals: MonitoringSignal[]; tasks: MonitoringTask[]; generated_at: string };
export type ConnectionProviderStatus = {
  id: string; type: "plaid" | "quickbooks" | "uploaded_statement"; name: string;
  status: "healthy" | "attention" | "disconnected" | "available";
  lastDataRefresh: string | null; error: string | null; stale: boolean;
};
export type ConnectionStatus = {
  organizationId: number; status: "connected" | "attention" | "not_connected";
  providers: ConnectionProviderStatus[]; totalConnections: number; healthyConnections: number;
  attentionRequired: number; lastDataRefresh: string | null; calculatedAt: string;
};
export type FinancialDataChangeEvent =
  | "transaction_categorized"
  | "bulk_categorization_completed"
  | "transactions_approved"
  | "transaction_created"
  | "transaction_updated"
  | "transaction_deleted"
  | "document_transactions_approved";

const recentFinancialEvents = new Map<string, number>();

export async function notifyFinancialDataChanged(organizationId: number, eventType: FinancialDataChangeEvent) {
  const key = `${organizationId}:${eventType}`;
  const now = Date.now();
  if (now - (recentFinancialEvents.get(key) ?? 0) < 2_000) return { accepted: true, debounced: true };
  recentFinancialEvents.set(key, now);
  const response = await authenticatedApi("/api/monitoring/financial-data-changed", {
    method: "POST",
    body: JSON.stringify({ organization_id: organizationId, event_type: eventType }),
  });
  if (!response.ok) {
    recentFinancialEvents.delete(key);
    throw new Error(await apiErrorMessage(response, "Financial monitoring could not be refreshed."));
  }
  return response.json();
}

export async function loadMonitoring(organizationId: number) {
  const response = await authenticatedApi(`/api/monitoring?organization_id=${organizationId}`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not load monitoring data."));
  return response.json() as Promise<MonitoringData>;
}

export async function loadConnectionStatus(organizationId: number) {
  const response = await authenticatedApi(`/api/connections/status?organization_id=${organizationId}`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not load connection status."));
  return response.json() as Promise<ConnectionStatus>;
}

export async function updateTask(organizationId: number, taskId: number, status: MonitoringTask["status"], note?: string) {
  const response = await authenticatedApi(`/api/monitoring/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ organization_id: organizationId, status, note }) });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update task."));
  return response.json();
}

export async function createTask(organizationId: number, input: { requestId: string; title: string; description: string; priority: string; dueDate: string | null }) {
  const response = await authenticatedApi("/api/monitoring/tasks", { method: "POST", body: JSON.stringify({
    organization_id: organizationId, request_id: input.requestId, title: input.title,
    description: input.description, priority: input.priority, due_date: input.dueDate,
  }) });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not create task."));
  return response.json();
}

export async function manageTask(organizationId: number, taskId: number, input: { priority: string; dueDate: string | null; assignmentRole: MonitoringTask["assignment_role"] }) {
  const response = await authenticatedApi(`/api/monitoring/tasks/${taskId}/manage`, { method: "PATCH", body: JSON.stringify({
    organization_id: organizationId, priority: input.priority, due_date: input.dueDate, assignment_role: input.assignmentRole,
  }) });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update task details."));
  return response.json();
}

export async function updateSignal(organizationId: number, signalId: number, action: "dismiss" | "resolve" | "reopen") {
  const response = await authenticatedApi(`/api/monitoring/signals/${signalId}`, { method: "PATCH", body: JSON.stringify({ organization_id: organizationId, action }) });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update insight."));
  return response.json();
}

export async function loadTaskEvents(organizationId: number, taskId: number) {
  const response = await authenticatedApi(`/api/monitoring/tasks/${taskId}/events?organization_id=${organizationId}`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not load task history."));
  return response.json() as Promise<{ events: TaskEvent[] }>;
}
