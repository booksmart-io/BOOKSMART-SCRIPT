export const CPA_MONITORING_ENGAGEMENT_STATUSES = ["active", "in_progress", "in-progress"] as const;

export function isCpaRelevantTask(task: { requires_cpa?: boolean | null; assignment_role?: string | null }) {
  return task.requires_cpa === true || task.assignment_role === "cpa";
}

export type CpaTaskCollaborationAction = "acknowledge" | "note";

export function validateCpaTaskCollaboration(action: unknown, note: unknown) {
  if (action !== "acknowledge" && action !== "note") return { valid: false as const, error: "invalid_action" };
  const normalizedNote = typeof note === "string" ? note.trim() : "";
  if (action === "note" && !normalizedNote) return { valid: false as const, error: "note_required" };
  if (normalizedNote.length > 1000) return { valid: false as const, error: "note_too_long" };
  return { valid: true as const, action, note: normalizedNote || null };
}
