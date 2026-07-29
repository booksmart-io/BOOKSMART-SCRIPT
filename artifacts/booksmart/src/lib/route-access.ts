export type AppRole = "user" | "cpa" | "admin";

type RouteAccessInput = {
  requiredRole?: AppRole;
  profileRole?: AppRole;
  verificationStatus?: string | null;
  location: string;
};

export function homeRouteForRole(role?: AppRole): string {
  if (role === "cpa") return "/cpa";
  if (role === "admin") return "/admin";
  return "/user";
}

export function isActiveCpaEngagement(status: string): boolean {
  return status === "active" || status === "in_progress" || status === "in-progress";
}

export function canRenderProtectedRoute({
  requiredRole,
  profileRole,
  verificationStatus,
  location,
}: RouteAccessInput): boolean {
  if (requiredRole && profileRole !== requiredRole) return false;

  if (requiredRole === "cpa") {
    const status = (verificationStatus ?? "pending").toLowerCase();
    const allowedWhileReviewing = location === "/cpa/profile" || location === "/cpa/under-review";
    if (status !== "approved" && !allowedWhileReviewing) return false;
  }

  return true;
}
