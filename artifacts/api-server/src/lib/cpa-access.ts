export type CpaAccessRow = {
  id: number;
  role: string | null;
  verification_status: string | null;
};

export const ORDER_STATUSES = ["pending", "active", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["pending", "active", "cancelled"],
  active: ["active", "completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

export function isApprovedCpa(row: CpaAccessRow | null | undefined): row is CpaAccessRow {
  return row?.role === "cpa" && row.verification_status?.trim().toLowerCase() === "approved";
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from].includes(to);
}
