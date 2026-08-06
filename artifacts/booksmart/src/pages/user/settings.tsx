import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { Building2, CheckCircle2, ChevronRight, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

type Organization = { id: number; name: string };
type QuickBooksConnection = {
  realm_id: string;
  company_name: string | null;
  country: string | null;
  status: string;
  verified_at: string | null;
  connected_at: string;
  updated_at: string;
  last_synced_at: string | null;
  last_sync_status: "running" | "completed" | "failed" | null;
  last_sync_error: string | null;
};

type QuickBooksStatus = {
  connected: boolean;
  connection: QuickBooksConnection | null;
};

type QuickBooksSyncStatus = {
  enabled: boolean;
  connected: boolean;
  last_synced_at: string | null;
  last_sync_status: "running" | "completed" | "failed" | null;
  last_sync_error: string | null;
  staged_total: number;
  counts: Record<string, number>;
};

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  return token;
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return new Error(body.message || fallback);
}

function Row({
  label,
  onClick,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-0 py-3.5 hover:opacity-70 transition-opacity"
    >
      <span className={`text-sm ${destructive ? "text-rose-500" : "text-foreground"}`}>
        {label}
      </span>
      <ChevronRight className={`h-4 w-4 ${destructive ? "text-rose-500" : "text-muted-foreground"}`} />
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function Settings() {
  const { profile, signOut } = useAuth();
  const numericId = profile?.numericId ?? null;
  const [activeOrgId] = useActiveOrganizationId(numericId);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const firstName = (profile as { first_name?: string })?.first_name ?? "";
  const lastName  = (profile as { last_name?: string  })?.last_name  ?? "";
  const imgUrl    = (profile as { img_url?: string | null })?.img_url;
  const email     = profile?.email ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "User";
  const initials  = (firstName[0] ?? "") + (lastName[0] ?? "") || fullName.slice(0, 2).toUpperCase();

  const [autoReview, setAutoReview] = useState(true);
  const [proTips,    setProTips]    = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  function toggleDark(val: boolean) {
    setIsDarkMode(val);
    document.documentElement.classList.toggle("dark", val);
    localStorage.setItem("theme", val ? "dark" : "light");
  }

  function soon() { toast.info("Coming soon"); }

  const { data: organizations = [], isLoading: organizationsLoading } = useQuery<Organization[]>({
    queryKey: ["settings-organizations", numericId],
    enabled: numericId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name")
        .eq("owner_id", numericId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data as Organization[]) ?? [];
    },
  });
  const activeOrganization = pickActiveOrganization(organizations, activeOrgId);
  const organizationId = activeOrganization?.id ?? null;

  const quickBooksStatus = useQuery<QuickBooksStatus>({
    queryKey: ["quickbooks-status", organizationId],
    enabled: organizationId != null,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/quickbooks/status?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not check QuickBooks status.");
      return response.json() as Promise<QuickBooksStatus>;
    },
  });

  const quickBooksSyncStatus = useQuery<QuickBooksSyncStatus>({
    queryKey: ["quickbooks-sync-status", organizationId],
    enabled: organizationId != null && quickBooksStatus.data?.connected === true,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/quickbooks/sync-status?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not check QuickBooks synchronization status.");
      return response.json() as Promise<QuickBooksSyncStatus>;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/quickbooks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (!response.ok) throw await readApiError(response, "Could not synchronize QuickBooks.");
      return response.json() as Promise<{ counts: Record<string, number> }>;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quickbooks-status", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["quickbooks-sync-status", organizationId] }),
      ]);
      const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      toast.success(`QuickBooks sync completed. ${total} records are staged for review.`);
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["quickbooks-sync-status", organizationId] });
      toast.error(error.message);
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("Add an organization before connecting QuickBooks.");
      const token = await accessToken();
      const response = await fetch(`/api/integrations/quickbooks/connect?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not start the QuickBooks connection.");
      const body = await response.json() as { authorization_url?: string };
      if (!body.authorization_url) throw new Error("QuickBooks did not return an authorization link.");
      window.location.assign(body.authorization_url);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/quickbooks/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (!response.ok) throw await readApiError(response, "Could not disconnect QuickBooks.");
    },
    onSuccess: async () => {
      setDisconnectOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quickbooks-status", organizationId] }),
        queryClient.removeQueries({ queryKey: ["quickbooks-sync-status", organizationId] }),
      ]);
      toast.success("QuickBooks disconnected.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("quickbooks");
    if (!result) return;
    if (result === "connected") {
      toast.success("QuickBooks connected successfully.");
      void queryClient.invalidateQueries({ queryKey: ["quickbooks-status"] });
    } else {
      const reason = params.get("reason");
      toast.error(reason === "authorization_denied"
        ? "QuickBooks authorization was cancelled."
        : "QuickBooks could not be connected. Please try again.");
    }
    // Normalize legacy QuickBooks callback URLs used by older API deployments.
    window.history.replaceState({}, "", "/user/settings");
  }, [queryClient]);

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Profile ── */}
      <button
        onClick={() => navigate("/user/profile")}
        className="w-full flex items-center gap-4 py-4 hover:opacity-70 transition-opacity text-left"
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={fullName}
            className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-primary/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary font-bold text-lg shrink-0 uppercase">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold truncate">{fullName}</p>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
        </div>
      </button>

      <Separator className="bg-border/30" />

      <section className="py-5" aria-labelledby="accounting-integrations-title">
        <div className="mb-4">
          <h2 id="accounting-integrations-title" className="text-sm font-semibold">Accounting integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your accounting platform to keep financial data in sync.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Link2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">QuickBooks Online</h3>
                  {quickBooksStatus.data?.connected && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {quickBooksStatus.data?.connected
                    ? `Connected to ${quickBooksStatus.data.connection?.company_name || "your QuickBooks company"}.`
                    : "Import accounting data securely from your QuickBooks company."}
                </p>
                {activeOrganization && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> BookSmart organization: {activeOrganization.name}
                  </p>
                )}
                {quickBooksStatus.isError && (
                  <p className="mt-2 text-xs text-destructive">QuickBooks status is temporarily unavailable.</p>
                )}
                {quickBooksStatus.data?.connected && quickBooksSyncStatus.data && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>
                      {quickBooksSyncStatus.data.last_synced_at
                        ? `Last staged sync: ${new Date(quickBooksSyncStatus.data.last_synced_at).toLocaleString()}`
                        : "No QuickBooks data has been staged yet."}
                    </p>
                    {quickBooksSyncStatus.data.staged_total > 0 && (
                      <button className="text-left text-primary underline-offset-2 hover:underline" onClick={() => navigate("/user/quickbooks-review")}>
                        {quickBooksSyncStatus.data.staged_total.toLocaleString()} records staged — review safely
                      </button>
                    )}
                    {quickBooksSyncStatus.data.last_sync_status === "failed" && (
                      <p className="text-destructive">Last sync failed. Existing BookSmart data was not changed.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {organizationsLoading || quickBooksStatus.isLoading ? (
              <Button variant="outline" disabled className="w-full sm:w-auto">
                <Loader2 className="animate-spin" /> Checking status
              </Button>
            ) : quickBooksStatus.data?.connected ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={syncMutation.isPending || quickBooksSyncStatus.isLoading || quickBooksSyncStatus.data?.enabled === false}
                  onClick={() => syncMutation.mutate()}
                  title={quickBooksSyncStatus.data?.enabled === false ? "QuickBooks sync is disabled by configuration" : undefined}
                >
                  {syncMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {syncMutation.isPending ? "Syncing safely" : "Sync now"}
                </Button>
                <Button variant="outline" className="w-full text-destructive sm:w-auto" onClick={() => setDisconnectOpen(true)}>
                  <Unplug /> Disconnect
                </Button>
              </div>
            ) : (
              <Button
                className="w-full sm:w-auto"
                disabled={!organizationId || connectMutation.isPending}
                onClick={() => connectMutation.mutate()}
              >
                {connectMutation.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
                Connect QuickBooks
              </Button>
            )}
          </div>
          {!organizationsLoading && organizations.length === 0 && (
            <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
              Add an organization before connecting QuickBooks.
            </p>
          )}
        </div>
      </section>

      <Separator className="bg-border/30" />

      {/* ── Settings list ── */}
      <div className="divide-y divide-border/30">
        <Row label="Notifications" onClick={soon} />
        <ToggleRow label="Auto Review Results" checked={autoReview} onCheckedChange={setAutoReview} />
        <ToggleRow label="Pro Tips"            checked={proTips}    onCheckedChange={setProTips} />
        <ToggleRow label="Dark Mode"           checked={isDarkMode} onCheckedChange={toggleDark} />
        <Row label="Category Rules"       onClick={() => navigate("/user/rules-management")} />
        <Row label="Documents Repository" onClick={() => navigate("/user/reports")} />
        <Row label="Sponsored Offers"     onClick={soon} />
        <Row label="Organizations"        onClick={() => navigate("/user/organizations")} />
        <Row label="Banks"                onClick={soon} />
        <Row label="Cards"                onClick={soon} />
        <Row label="Subscription"         onClick={() => navigate("/user/subscription")} />
        <Row label="Purchase Tokens"      onClick={() => navigate("/user/token")} />
        <Row label="Delete Account"       onClick={soon} />
        <Row label="Logout"               onClick={signOut} destructive />
      </div>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription>
              BookSmart will revoke access to {quickBooksStatus.data?.connection?.company_name || "this QuickBooks company"}.
              Previously imported BookSmart data will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={disconnectMutation.isPending}
              onClick={(event) => { event.preventDefault(); disconnectMutation.mutate(); }}
            >
              {disconnectMutation.isPending && <Loader2 className="animate-spin" />}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
