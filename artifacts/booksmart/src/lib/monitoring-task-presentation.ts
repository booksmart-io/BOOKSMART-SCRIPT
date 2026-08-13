export type TaskAssignmentRole = "owner" | "cpa" | "booksmart";

export function taskAssignmentLabel(role: TaskAssignmentRole) {
  return role === "cpa" ? "Assigned to CPA" : role === "booksmart" ? "Managed by BookSmart" : "Assigned to you";
}

export function taskSourceLabel(source: string) {
  if (source === "signal") return "Created from a monitored change";
  if (source === "bookkeeping") return "Created from bookkeeping review";
  if (source === "tax_calendar") return "Created from the tax calendar";
  return "Created by BookSmart";
}
