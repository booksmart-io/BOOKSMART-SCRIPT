import { useEffect } from "react";
import { Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import NotFound from "@/pages/not-found";

// Auth
import Login from "@/pages/auth/login";
import SignUp from "@/pages/auth/sign-up";
import ForgotReset from "@/pages/auth/forgot-reset";
import VerifyEmail from "@/pages/auth/verify-email";

// User Pages
import UserDashboard from "@/pages/user/dashboard";
import AiStrategy from "@/pages/user/ai-strategy";
import AiChat from "@/pages/user/ai-chat";
import Chat from "@/pages/user/chat";
import CpaNetwork from "@/pages/user/cpa-network";
import Reports from "@/pages/user/reports";
import Tax from "@/pages/user/tax";
import Orders from "@/pages/user/orders";
import Token from "@/pages/user/token";
import Settings from "@/pages/user/settings";
import Profile from "@/pages/user/profile";
import Organizations from "@/pages/user/organizations";
import Subscription from "@/pages/user/subscription";
import BulkReview from "@/pages/user/bulk-review";
import RulesManagement from "@/pages/user/rules-management";

// CPA Pages
import CpaDashboard from "@/pages/cpa/dashboard";
import CpaLeads from "@/pages/cpa/leads";
import CpaOrders from "@/pages/cpa/orders";
import CpaEarnings from "@/pages/cpa/earnings";
import CpaChat from "@/pages/cpa/chat";
import CpaSettings from "@/pages/cpa/settings";
import CpaProfile from "@/pages/cpa/profile";
import CpaClients from "@/pages/cpa/clients";
import CpaReferrals from "@/pages/cpa/referrals";
import CpaDocuments from "@/pages/cpa/documents";
import CpaInsights from "@/pages/cpa/insights";
import CpaTemplates from "@/pages/cpa/templates";

// Admin Pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminCpas from "@/pages/admin/cpas";
import AdminCategories from "@/pages/admin/categories";
import AdminTaxDeductions from "@/pages/admin/tax-deductions";
import AdminSettings from "@/pages/admin/settings";
import AdminChat from "@/pages/admin/chat";

const queryClient = new QueryClient();

type Role = "user" | "cpa" | "admin";

// Route table: path → { role, component }
type RouteEntry = { role: Role; component: React.ComponentType };
const USER_ROUTES: Record<string, RouteEntry> = {
  "/user": { role: "user", component: UserDashboard },
  "/user/ai-strategy": { role: "user", component: AiStrategy },
  "/user/ai-chat": { role: "user", component: AiChat },
  "/user/chat": { role: "user", component: Chat },
  "/user/cpa-network": { role: "user", component: CpaNetwork },
  "/user/reports": { role: "user", component: Reports },
  "/user/tax": { role: "user", component: Tax },
  "/user/orders": { role: "user", component: Orders },
  "/user/token": { role: "user", component: Token },
  "/user/settings": { role: "user", component: Settings },
  "/user/profile": { role: "user", component: Profile },
  "/user/organizations": { role: "user", component: Organizations },
  "/user/subscription": { role: "user", component: Subscription },
  "/user/bulk-review": { role: "user", component: BulkReview },
  "/user/rules-management": { role: "user", component: RulesManagement },
};
const CPA_ROUTES: Record<string, RouteEntry> = {
  "/cpa": { role: "cpa", component: CpaDashboard },
  "/cpa/clients": { role: "cpa", component: CpaClients },
  "/cpa/leads": { role: "cpa", component: CpaLeads },
  "/cpa/orders": { role: "cpa", component: CpaOrders },
  "/cpa/earnings": { role: "cpa", component: CpaEarnings },
  "/cpa/chat": { role: "cpa", component: CpaChat },
  "/cpa/settings": { role: "cpa", component: CpaSettings },
  "/cpa/profile": { role: "cpa", component: CpaProfile },
  "/cpa/referrals": { role: "cpa", component: CpaReferrals },
  "/cpa/documents": { role: "cpa", component: CpaDocuments },
  "/cpa/insights": { role: "cpa", component: CpaInsights },
  "/cpa/templates": { role: "cpa", component: CpaTemplates },
};
const ADMIN_ROUTES: Record<string, RouteEntry> = {
  "/admin": { role: "admin", component: AdminDashboard },
  "/admin/users": { role: "admin", component: AdminUsers },
  "/admin/cpas": { role: "admin", component: AdminCpas },
  "/admin/categories": { role: "admin", component: AdminCategories },
  "/admin/tax-deductions": { role: "admin", component: AdminTaxDeductions },
  "/admin/settings": { role: "admin", component: AdminSettings },
  "/admin/chat": { role: "admin", component: AdminChat },
};
const ALL_ROUTES = { ...USER_ROUTES, ...CPA_ROUTES, ...ADMIN_ROUTES };

function Router() {
  const { session, profile, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (session && location === "/") {
      if (profile?.role === "cpa") setLocation("/cpa");
      else if (profile?.role === "admin") setLocation("/admin");
      else setLocation("/user");
    } else if (!session && location === "/") {
      setLocation("/login");
    }
  }, [isLoading, session, profile, location, setLocation]);

  // Auth routes (no guard)
  if (location === "/login") return <Login />;
  if (location === "/sign-up") return <SignUp />;
  if (location === "/forgot-reset") return <ForgotReset />;
  if (location === "/verify-email") return <VerifyEmail />;

  // Dashboard routes
  const matched = ALL_ROUTES[location];
  if (matched) {
    const { role, component: Page } = matched;
    return (
      <AuthGuard requiredRole={role}>
        <DashboardLayout role={role}>
          <Page />
        </DashboardLayout>
      </AuthGuard>
    );
  }

  // Root redirect (loading state or unmatched during redirect)
  if (location === "/") return null;

  return <NotFound />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
            <SonnerToaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
