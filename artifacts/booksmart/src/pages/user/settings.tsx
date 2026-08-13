import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { openPlaidLink } from "@/lib/plaid-link";
import { loadConnectionStatus, type ConnectionProviderStatus } from "@/lib/monitoring-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { Building2, CheckCircle2, ChevronRight, Landmark, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
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

type JobberStatus = {
  connected: boolean;
  health: {
    state: "not_connected" | "healthy" | "degraded" | "reauthorization_required";
    action: "connect" | "none" | "retry" | "reconnect";
    message: string | null;
  };
  connection: {
    jobber_account_id: string;
    jobber_account_name: string | null;
    access_mode: "read_only";
    granted_scopes: string[];
    api_version: string;
    api_version_warning: string | null;
    status: string;
    verified_at: string | null;
    last_successful_sync_at: string | null;
    last_full_sync_at: string | null;
    last_sync_error: string | null;
  } | null;
};

type JobberSyncStatus = {
  counts: Record<string, { active: number; archived: number }>;
  states: Array<{ object_type: string; status: string; sync_mode: "full" | "incremental"; completed_at: string | null; last_error: string | null; records_seen: number; records_changed: number; pages_processed: number }>;
};

type PlaidBalanceAccount = {
  account_id: string; name: string; mask: string | null; type: string | null;
  subtype: string | null; institution_name: string | null; current: number | null;
  available: number | null; currency: string;
};
type PlaidBalances = { accounts: PlaidBalanceAccount[]; refreshed_at: string };

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
  const [bankDisconnectTarget, setBankDisconnectTarget] = useState<ConnectionProviderStatus | null>(null);

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

  const bankConnections = useQuery({
    queryKey: ["settings-bank-connections", organizationId],
    enabled: organizationId != null,
    queryFn: () => loadConnectionStatus(organizationId!),
  });
  const plaidProviders = (bankConnections.data?.providers ?? []).filter((provider) => provider.type === "plaid");
  const plaidBalances = useQuery<PlaidBalances>({
    queryKey: ["settings-bank-balances", organizationId],
    enabled: organizationId != null && plaidProviders.length > 0,
    retry: false,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/plaid/balances?org_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await readApiError(response, "Could not load connected bank accounts.");
      return response.json() as Promise<PlaidBalances>;
    },
  });

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

  const jobberStatus = useQuery<JobberStatus>({
    queryKey: ["jobber-status", organizationId],
    enabled: organizationId != null,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/jobber/status?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not check Jobber status.");
      return response.json() as Promise<JobberStatus>;
    },
  });

  const jobberSyncStatus = useQuery<JobberSyncStatus>({
    queryKey: ["jobber-sync-status", organizationId],
    enabled: organizationId != null && jobberStatus.data?.connected === true,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/jobber/sync-status?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await readApiError(response, "Could not check Jobber sync status.");
      return response.json() as Promise<JobberSyncStatus>;
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
      return response.json() as Promise<{ revoked: boolean; warning: string | null }>;
    },
    onSuccess: async (result) => {
      setDisconnectOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quickbooks-status", organizationId] }),
        queryClient.removeQueries({ queryKey: ["quickbooks-sync-status", organizationId] }),
      ]);
      if (result.warning) toast.warning("QuickBooks disconnected locally. Intuit token revocation could not be confirmed.");
      else toast.success("QuickBooks disconnected.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectBankMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("Add an organization before connecting a bank.");
      const token = await accessToken();
      const tokenResponse = await fetch("/api/plaid/link-token", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ org_id: organizationId }),
      });
      if (!tokenResponse.ok) throw await readApiError(tokenResponse, "Could not start secure bank connection.");
      const { link_token } = await tokenResponse.json() as { link_token?: string };
      if (!link_token) throw new Error("Plaid did not return a connection token.");
      await openPlaidLink({
        token: link_token,
        onSuccess: async (publicToken, metadata) => {
          const exchange = await fetch("/api/plaid/exchange-public-token", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ public_token: publicToken, metadata, org_id: organizationId }),
          });
          if (!exchange.ok) throw await readApiError(exchange, "Could not connect bank.");
          const result = await exchange.json() as { item_id?: number };
          const sync = await fetch("/api/plaid/sync", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ org_id: organizationId, item_id: result.item_id }),
          });
          if (!sync.ok) throw await readApiError(sync, "Bank connected, but its first sync failed.");
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["settings-bank-connections", organizationId] }),
            queryClient.invalidateQueries({ queryKey: ["settings-bank-balances", organizationId] }),
            queryClient.invalidateQueries({ queryKey: ["normalized-connection-status", organizationId] }),
          ]);
          toast.success("Bank connected and synchronized.");
        },
        onExit: (error) => { if (error?.error_message) toast.error(error.error_message); },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const syncBankMutation = useMutation({
    mutationFn: async (provider: ConnectionProviderStatus) => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const itemId = Number(provider.id.replace("plaid:", ""));
      const token = await accessToken();
      const response = await fetch("/api/plaid/sync", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ org_id: organizationId, item_id: itemId }),
      });
      if (!response.ok) throw await readApiError(response, "Could not synchronize this bank.");
      return response.json() as Promise<{ added: number; modified: number; removed: number }>;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings-bank-connections", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["settings-bank-balances", organizationId] }),
      ]);
      toast.success(`Bank synchronized. ${result.added + result.modified} transaction changes imported.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectBankMutation = useMutation({
    mutationFn: async (provider: ConnectionProviderStatus) => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const itemId = Number(provider.id.replace("plaid:", ""));
      const token = await accessToken();
      const response = await fetch(`/api/plaid/items/${itemId}?org_id=${organizationId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not disconnect this bank.");
      return response.json() as Promise<{ deleted_transactions: number; plaid_remove_warning: string | null }>;
    },
    onSuccess: async (result) => {
      setBankDisconnectTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings-bank-connections", organizationId] }),
        queryClient.removeQueries({ queryKey: ["settings-bank-balances", organizationId] }),
      ]);
      if (result.plaid_remove_warning) toast.warning("Bank disconnected locally, but Plaid revocation could not be confirmed.");
      else toast.success(`Bank disconnected. ${result.deleted_transactions} linked transactions were removed.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const jobberConnectMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("Add an organization before connecting Jobber.");
      const token = await accessToken();
      const response = await fetch(`/api/integrations/jobber/connect?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not start the Jobber connection.");
      const body = await response.json() as { authorization_url?: string };
      if (!body.authorization_url) throw new Error("Jobber did not return an authorization link.");
      window.location.assign(body.authorization_url);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const jobberDisconnectMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/jobber/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (!response.ok) throw await readApiError(response, "Could not disconnect Jobber.");
      return response.json() as Promise<{ revoked: boolean; warning: string | null }>;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["jobber-status", organizationId] });
      if (result.warning) toast.warning(result.warning);
      else toast.success("Jobber disconnected successfully.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const jobberSyncMutation = useMutation({
    mutationFn: async (mode: "full" | "incremental") => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/jobber/sync", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ organization_id: organizationId, mode }) });
      if (!response.ok) throw await readApiError(response, "Could not synchronize Jobber.");
      return response.json() as Promise<{ counts: Record<string, number>; changed: Record<string, number>; mode: "full" | "incremental" }>;
    },
    onSuccess: async (result) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["jobber-status", organizationId] }), queryClient.invalidateQueries({ queryKey: ["jobber-sync-status", organizationId] })]);
      const scanned = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      const changed = Object.values(result.changed).reduce((sum, count) => sum + count, 0);
      toast.success(`${result.mode === "full" ? "Full refresh" : "Incremental sync"} completed. ${scanned} scanned, ${changed} changed.`);
    },
    onError: (error: Error) => { void queryClient.invalidateQueries({ queryKey: ["jobber-sync-status", organizationId] }); toast.error(error.message); },
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

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("jobber");
    if (!result) return;
    if (result === "connected") {
      toast.success("Jobber connected successfully.");
    } else {
      const reason = params.get("reason");
      toast.error(reason === "authorization_denied"
        ? "Jobber authorization was cancelled."
        : "Jobber could not be connected. Please try again.");
    }
    window.history.replaceState({}, "", "/user/settings");
  }, []);

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

        <section className="pb-5" aria-labelledby="jobber-integration-title">
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="jobber-integration-title" className="font-semibold">Jobber</h2>
                  <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">
                    Operational integration
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {jobberStatus.data?.connected
                    ? `Connected to ${jobberStatus.data.connection?.jobber_account_name || "your Jobber test account"}.`
                    : "Connect operational clients and work records. Jobber data never enters accounting reports."}
                </p>
                {jobberStatus.data?.connected && (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    Connected · Secure synchronization
                  </p>
                )}
                {jobberStatus.data?.health.message && (
                  <p className={`mt-2 text-sm ${jobberStatus.data.health.state === "reauthorization_required" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {jobberStatus.data.health.message}
                  </p>
                )}
                {jobberStatus.data?.connection?.last_successful_sync_at && (
                  <p className="mt-1 text-xs text-muted-foreground">Last synced {new Date(jobberStatus.data.connection.last_successful_sync_at).toLocaleString()} · {Object.values(jobberSyncStatus.data?.counts ?? {}).reduce((sum, count) => sum + count.active, 0)} active records</p>
                )}
                {jobberStatus.data?.connection?.api_version_warning && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{jobberStatus.data.connection.api_version_warning}</p>}
                {activeOrganization && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> BookSmart organization: {activeOrganization.name}
                  </p>
                )}
              </div>
              {jobberStatus.data?.connected ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button variant="secondary" disabled className="w-full sm:w-auto">
                    <CheckCircle2 /> Jobber Connected
                  </Button>
                  <Button className="w-full sm:w-auto" disabled={jobberSyncMutation.isPending} onClick={() => jobberSyncMutation.mutate("incremental")}>
                    {jobberSyncMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto" disabled={jobberSyncMutation.isPending} onClick={() => jobberSyncMutation.mutate("full")}>
                    Full refresh
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate("/user/jobber-records")}>
                    View records
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-destructive sm:w-auto"
                    disabled={jobberDisconnectMutation.isPending}
                    onClick={() => jobberDisconnectMutation.mutate()}
                  >
                    {jobberDisconnectMutation.isPending ? <Loader2 className="animate-spin" /> : <Unplug />}
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full sm:w-auto"
                  disabled={!organizationId || jobberConnectMutation.isPending || jobberStatus.isLoading}
                  onClick={() => jobberConnectMutation.mutate()}
                >
                  {jobberConnectMutation.isPending || jobberStatus.isLoading
                    ? <Loader2 className="animate-spin" />
                    : <Link2 />}
                  {jobberStatus.data?.health.action === "reconnect" ? "Reconnect Jobber" : "Connect Jobber"}
                </Button>
              )}
            </div>
            {jobberStatus.data?.connected && jobberSyncStatus.data && (
              <div className="mt-4 grid gap-2 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                {(["clients", "jobs", "scheduled_items", "quotes", "invoices", "payments"] as const).map((kind) => {
                  const counts = jobberSyncStatus.data?.counts[kind] ?? { active: 0, archived: 0 };
                  const state = jobberSyncStatus.data?.states.find((item) => item.object_type === kind);
                  return (
                    <div key={kind} className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <p className="text-xs font-medium capitalize">{kind.replace("_", " ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{counts.active} active · {counts.archived} archived</p>
                      <p className="mt-1 text-xs text-muted-foreground">{state ? `${state.sync_mode} · ${state.records_changed} changed · ${state.pages_processed} pages` : "Not synced yet"}</p>
                      {state?.last_error && <p className="mt-1 text-xs text-destructive">{state.last_error}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section id="connected-banks" className="pb-5" aria-labelledby="connected-banks-title">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="connected-banks-title" className="text-sm font-semibold">Connected banks</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage bank connections for {activeOrganization?.name ?? "your active organization"}.</p>
            </div>
            <Button
              size="sm"
              disabled={!organizationId || connectBankMutation.isPending}
              onClick={() => connectBankMutation.mutate()}
            >
              {connectBankMutation.isPending ? <Loader2 className="animate-spin" /> : <Landmark />}
              Connect bank
            </Button>
          </div>

          {bankConnections.isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : bankConnections.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-card p-5"><p className="font-medium text-destructive">Could not load connected banks</p><p className="mt-1 text-sm text-muted-foreground">Your existing connections were not changed.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void bankConnections.refetch()}>Try again</Button></div>
          ) : plaidProviders.length === 0 ? (
            <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Landmark className="h-5 w-5 text-primary" /></div><div><p className="font-medium">No bank connected</p><p className="text-sm text-muted-foreground">Connect securely through Plaid to synchronize transactions and verified balances.</p></div></div>
              <Button variant="outline" disabled={!organizationId || connectBankMutation.isPending} onClick={() => connectBankMutation.mutate()}>Connect bank</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {plaidProviders.map((provider) => {
                const accounts = (plaidBalances.data?.accounts ?? []).filter((account) => account.institution_name === provider.name || plaidProviders.length === 1);
                const healthy = provider.status === "healthy";
                return <div key={provider.id} className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10"><Landmark className="h-5 w-5 text-sky-400" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{provider.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthy ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{healthy ? "Connected" : "Needs attention"}</span></div><p className="mt-1 text-xs text-muted-foreground">{provider.lastDataRefresh ? `Last synchronized ${new Date(provider.lastDataRefresh).toLocaleString()}` : "Not synchronized yet"}</p>{provider.error && <p className="mt-1 text-xs text-destructive">{provider.error}</p>}{provider.stale && !provider.error && <p className="mt-1 text-xs text-amber-400">This connection has not refreshed recently.</p>}</div></div>
                    <div className="flex flex-wrap gap-2 sm:justify-end"><Button size="sm" variant="secondary" disabled={syncBankMutation.isPending} onClick={() => syncBankMutation.mutate(provider)}>{syncBankMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => setBankDisconnectTarget(provider)}><Unplug />Disconnect</Button></div>
                  </div>
                  {plaidBalances.isLoading ? <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading accounts</div> : accounts.length > 0 ? <div className="mt-4 grid gap-2 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-3">{accounts.map((account) => <div key={account.account_id} className="rounded-lg border border-border/60 bg-background/40 p-3"><p className="truncate text-sm font-medium">{account.name}{account.mask ? ` •••• ${account.mask}` : ""}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{account.subtype ?? account.type ?? "Bank account"}</p>{account.current != null && <p className="mt-2 text-sm font-semibold">{new Intl.NumberFormat("en-US", { style: "currency", currency: account.currency || "USD" }).format(account.current)}</p>}</div>)}</div> : plaidBalances.isError ? <p className="mt-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">Account balances could not be refreshed. The bank connection is still listed above.</p> : null}
                </div>;
              })}
            </div>
          )}
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
        <Row label="Financial Planning Inputs" onClick={() => navigate("/user/financial-inputs")} />
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

      <AlertDialog open={bankDisconnectTarget !== null} onOpenChange={(open) => { if (!open && !disconnectBankMutation.isPending) setBankDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {bankDisconnectTarget?.name ?? "this bank"}?</AlertDialogTitle>
            <AlertDialogDescription>
              BookSmart will revoke the bank connection and permanently remove transactions imported from its linked accounts. Manually entered transactions and other integrations will not be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectBankMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={disconnectBankMutation.isPending}
              onClick={(event) => { event.preventDefault(); if (bankDisconnectTarget) disconnectBankMutation.mutate(bankDisconnectTarget); }}
            >
              {disconnectBankMutation.isPending && <Loader2 className="animate-spin" />}
              Disconnect bank
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
