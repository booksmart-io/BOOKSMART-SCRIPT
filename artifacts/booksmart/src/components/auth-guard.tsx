import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "user" | "cpa" | "admin";
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { session, profile, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      setLocation("/login");
      return;
    }
    if (requiredRole && profile && profile.role !== requiredRole) {
      if (profile.role === "cpa") setLocation("/cpa");
      else if (profile.role === "admin") setLocation("/admin");
      else setLocation("/user");
    }
  }, [isLoading, session, profile, requiredRole, setLocation]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
