import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "user" | "cpa" | "admin";
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { session, profile, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const numericId = profile?.numericId ?? null;
  const shouldRequireOrganization = requiredRole === "user" && location !== "/user/profile";
  const waitingForProfile = !!session && !profile;
  const waitingForNumericUserId = shouldRequireOrganization && !!profile && numericId === null;

  const { data: organizationCount, isLoading: organizationLoading } = useQuery<number>({
    queryKey: ["auth_guard_organization_count", numericId],
    enabled: !isLoading && !!session && shouldRequireOrganization && numericId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", numericId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      setLocation("/login");
      return;
    }
    if (waitingForProfile) return;
    if (!session.user.email_confirmed_at) {
      setLocation("/verify-email");
      return;
    }
    if (requiredRole && profile && profile.role !== requiredRole) {
      if (profile.role === "cpa") setLocation("/cpa");
      else if (profile.role === "admin") setLocation("/admin");
      else setLocation("/user");
      return;
    }
    if (requiredRole === "cpa" && profile?.role === "cpa") {
      const status = (profile.verification_status ?? "pending").toLowerCase();
      const allowedWhileReviewing = location === "/cpa/profile" || location === "/cpa/under-review";
      if (status !== "approved" && !allowedWhileReviewing) {
        setLocation("/cpa/under-review");
        return;
      }
    }
    if (shouldRequireOrganization) {
      if (waitingForNumericUserId) return;
      if (organizationLoading) return;
      if ((organizationCount ?? 0) === 0) {
        setLocation("/user/profile");
        return;
      }
    }
  }, [isLoading, session, profile, requiredRole, location, setLocation, shouldRequireOrganization, waitingForProfile, waitingForNumericUserId, organizationLoading, organizationCount]);

  if (isLoading || waitingForProfile || waitingForNumericUserId || (shouldRequireOrganization && organizationLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;
  if (!session.user.email_confirmed_at) return null;
  if (waitingForProfile || waitingForNumericUserId) return null;
  if (shouldRequireOrganization && (organizationCount ?? 0) === 0) return null;

  return <>{children}</>;
}
