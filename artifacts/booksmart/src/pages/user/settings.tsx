import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { openPlaidLink } from "@/lib/plaid-link";
import { categorizeUncategorizedTransactions } from "@/lib/ai-categorization";
import { loadConnectionStatus, notifyFinancialDataChanged, type ConnectionProviderStatus } from "@/lib/monitoring-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, ExternalLink, Eye, Landmark, Link2, Loader2, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { SiChase, SiQuickbooks } from "react-icons/si";
import { toast } from "sonner";

type Organization = { id: number; name: string };
type GmailStatus = { enabled: boolean; configured: boolean; connected: boolean; connection: null | { google_account_email: string | null; status: string; last_scan_at: string | null; last_scan_status: string | null; last_scan_error: string | null; connected_at: string; updated_at: string } };
type GmailScanSummary = { emails_reviewed: number; possible_receipts: number; processed_receipts: number; matched: number; needs_review: number; unmatched: number; duplicates_skipped: number; failures: number; status: "completed" | "partial"; accountingEffect: "none" };
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

type JobberMonitoringCandidate = {
  signalKey: string;
  severity: "info" | "positive" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  currentValue: number;
  comparisonValue: number | null;
  percentage: number | null;
  recommendedAction: string;
  sourceIds?: Array<number | string>;
  directUrl?: string | null;
  sourceRecordType?: string;
};

type JobberMonitoringPreview = {
  dry_run: true;
  persisted: false;
  organization_id: number;
  last_successful_sync_at: string | null;
  calculation_version: string;
  candidate_count: number;
  candidates: JobberMonitoringCandidate[];
};

type JobberCpaSharing = {
  organization_id: number;
  enabled: boolean;
  consented_at: string | null;
  updated_at: string | null;
};

type ContractorFinancialSettings = {
  targetGrossMargin: number | null;
  targetMarginSource: "organization" | "industry" | null;
  updatedAt: string | null;
};

const previewSeverityClass: Record<JobberMonitoringCandidate["severity"], string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  low: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const PLAID_CATEGORIZATION_BATCH_LIMIT = 100;

const jobberPreviewUiEnabled = import.meta.env.VITE_JOBBER_MONITORING_PREVIEW_UI === "true";

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
  const [gmailDisconnectOpen, setGmailDisconnectOpen] = useState(false);
  const [gmailScanDays, setGmailScanDays] = useState<30 | 60 | 90>(90);
  const [gmailScanSummary, setGmailScanSummary] = useState<GmailScanSummary | null>(null);
  const [jobberDisconnectOpen, setJobberDisconnectOpen] = useState(false);
  const [bankDisconnectTarget, setBankDisconnectTarget] = useState<ConnectionProviderStatus | null>(null);
  const [targetMarginPercent, setTargetMarginPercent] = useState("");
  const [plaidSyncStage, setPlaidSyncStage] = useState<"idle" | "connecting" | "syncing" | "categorizing" | "refreshing" | "complete" | "error">("idle");
  const [plaidSyncMessage, setPlaidSyncMessage] = useState("");

  const imgUrl = profile?.img_url;
  const email = profile?.email ?? "";
  const fullName = profile?.full_name?.trim() || email.split("@")[0] || "User";
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : fullName.slice(0, 2).toUpperCase();

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

  async function finishPlaidSynchronization(result: { added?: number; modified?: number; removed?: number }) {
    if (organizationId == null) return 0;
    const changed = (result.added ?? 0) + (result.modified ?? 0);
    const passes = Math.max(1, Math.ceil(Math.max(changed, 1) / PLAID_CATEGORIZATION_BATCH_LIMIT));
    let categorized = 0;
    setPlaidSyncStage("categorizing");
    setPlaidSyncMessage(changed > 0
      ? `${changed} transaction${changed === 1 ? "" : "s"} received. Categorizing transactions...`
      : "Transaction import complete. Checking categories...");
    for (let index = 0; index < passes; index += 1) {
      setPlaidSyncMessage(passes > 1
        ? `Categorizing transactions — batch ${index + 1} of ${passes}...`
        : "Categorizing imported transactions...");
      const categorization = await categorizeUncategorizedTransactions(
        Math.min(Math.max(changed, 30), PLAID_CATEGORIZATION_BATCH_LIMIT),
        organizationId,
      );
      categorized += categorization.updated;
      if (categorization.updated === 0) break;
    }
    if (categorized > 0) {
      void notifyFinancialDataChanged(organizationId, "bulk_categorization_completed").catch((error) => {
        console.warn("[monitoring/financial-data-changed]", error instanceof Error ? error.message : error);
      });
    }
    setPlaidSyncStage("refreshing");
    setPlaidSyncMessage("Updating your dashboard and financial reports...");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tx_period"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_prev_period"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_all_balance"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_all_full"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_month"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_recent"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_count"] }),
      queryClient.invalidateQueries({ queryKey: ["tx_deductions"] }),
      queryClient.invalidateQueries({ queryKey: ["plaid_accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard_connected_banks", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["normalized-connection-status", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["monitoring-projection", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["contractor-home-intelligence", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["contractor-money-intelligence", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["contractor-insights", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["contractor-transaction-job-queue", organizationId] }),
    ]);
    return categorized;
  }

  const contractorSettings = useQuery<ContractorFinancialSettings>({
    queryKey: ["contractor-financial-settings", organizationId],
    enabled: organizationId != null,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/organizations/${organizationId}/contractor-financial-settings`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await readApiError(response, "Could not load the target margin.");
      return response.json() as Promise<ContractorFinancialSettings>;
    },
  });

  useEffect(() => {
    const value = contractorSettings.data?.targetGrossMargin;
    setTargetMarginPercent(value == null ? "" : String(Number((value * 100).toFixed(2))));
  }, [contractorSettings.data?.targetGrossMargin, organizationId]);

  const contractorSettingsMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("Add an organization before setting a target margin.");
      const trimmed = targetMarginPercent.trim();
      const percentage = trimmed === "" ? null : Number(trimmed);
      if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) throw new Error("Enter a target between 0% and 100%, or leave it empty.");
      const token = await accessToken();
      const response = await fetch(`/api/organizations/${organizationId}/contractor-financial-settings`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetGrossMargin: percentage == null ? null : percentage / 100,
          targetMarginSource: percentage == null ? null : "organization" }),
      });
      if (!response.ok) throw await readApiError(response, "Could not save the target margin.");
      return response.json() as Promise<ContractorFinancialSettings>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contractor-financial-settings", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-home-intelligence", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-money-intelligence", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-insights", organizationId] }),
      ]);
      toast.success(targetMarginPercent.trim() ? "Job margin target saved." : "Job margin target cleared.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

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

  const gmailStatus = useQuery<GmailStatus>({
    queryKey: ["gmail-status", organizationId],
    enabled: organizationId != null,
    retry: false,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/gmail/status?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await readApiError(response, "Could not check Gmail status.");
      return response.json() as Promise<GmailStatus>;
    },
  });

  const gmailConnectMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("Add an organization before connecting Gmail.");
      const token = await accessToken();
      const response = await fetch(`/api/integrations/gmail/connect?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await readApiError(response, "Could not start Gmail connection.");
      return response.json() as Promise<{ authorization_url: string }>;
    },
    onSuccess: ({ authorization_url }) => { window.location.assign(authorization_url); },
    onError: (error: Error) => toast.error(error.message),
  });

  const gmailDisconnectMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (!response.ok) throw await readApiError(response, "Could not disconnect Gmail.");
      return response.json() as Promise<{ ok: true; connected: false; revoked: boolean }>;
    },
    onSuccess: async ({ revoked }) => {
      setGmailDisconnectOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["gmail-status", organizationId] });
      toast.success(revoked ? "Gmail disconnected." : "Gmail disconnected locally. Google revocation could not be confirmed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const gmailScanMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId, days: gmailScanDays }),
      });
      if (!response.ok) throw await readApiError(response, "Could not scan Gmail.");
      return response.json() as Promise<GmailScanSummary>;
    },
    onSuccess: async (summary) => {
      setGmailScanSummary(summary);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gmail-status", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-match-queue", organizationId] }),
      ]);
      toast.success(`Gmail scan complete: ${summary.processed_receipts} receipt${summary.processed_receipts === 1 ? "" : "s"} processed.`);
    },
    onError: (error: Error) => toast.error(error.message),
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

  const jobberCpaSharing = useQuery<JobberCpaSharing>({
    queryKey: ["jobber-cpa-sharing", organizationId],
    enabled: organizationId != null && jobberStatus.data?.connected === true,
    retry: false,
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/jobber/cpa-sharing?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await readApiError(response, "Could not load CPA sharing preferences.");
      return response.json() as Promise<JobberCpaSharing>;
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
      setPlaidSyncStage("connecting");
      setPlaidSyncMessage("Opening secure bank connection...");
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
          setPlaidSyncStage("syncing");
          setPlaidSyncMessage("Bank connected. Importing transactions from your bank...");
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
          const syncResult = await sync.json() as { added?: number; modified?: number; removed?: number };
          const categorized = await finishPlaidSynchronization(syncResult);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["settings-bank-connections", organizationId] }),
            queryClient.invalidateQueries({ queryKey: ["settings-bank-balances", organizationId] }),
          ]);
          setPlaidSyncStage("complete");
          setPlaidSyncMessage(`${syncResult.added ?? 0} new transaction${(syncResult.added ?? 0) === 1 ? "" : "s"} imported. ${categorized} categorized.`);
          toast.success(`Bank connected and synchronized. ${syncResult.added ?? 0} new transaction${(syncResult.added ?? 0) === 1 ? "" : "s"} imported. ${categorized} categorized.`);
        },
        onExit: (error) => {
          if (error?.error_message) {
            setPlaidSyncStage("error");
            setPlaidSyncMessage(error.error_message);
            toast.error(error.error_message);
          } else {
            setPlaidSyncStage("idle");
            setPlaidSyncMessage("");
          }
        },
      });
    },
    onError: (error: Error) => {
      setPlaidSyncStage("error");
      setPlaidSyncMessage(error.message);
      toast.error(error.message);
    },
  });

  const syncBankMutation = useMutation({
    mutationFn: async (provider: ConnectionProviderStatus) => {
      if (organizationId == null) throw new Error("No active organization is available.");
      setPlaidSyncStage("syncing");
      setPlaidSyncMessage(`Importing transactions from ${provider.name}...`);
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
      const categorized = await finishPlaidSynchronization(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings-bank-connections", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["settings-bank-balances", organizationId] }),
      ]);
      setPlaidSyncStage("complete");
      setPlaidSyncMessage(`${result.added} new and ${result.modified} updated transaction${result.added + result.modified === 1 ? "" : "s"} imported. ${categorized} categorized.`);
      toast.success(`Bank synchronized. ${result.added + result.modified} transaction changes imported. ${categorized} categorized.`);
    },
    onError: (error: Error) => {
      setPlaidSyncStage("error");
      setPlaidSyncMessage(error.message);
      toast.error(error.message);
    },
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
      return response.json() as Promise<{ revoked: boolean; warning: string | null; deleted?: { deleted_records?: number } }>;
    },
    onSuccess: async (result) => {
      setJobberDisconnectOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobber-status", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["jobber-sync-status", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-home-intelligence", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-money-intelligence", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-insights", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["contractor-match-queue", organizationId] }),
      ]);
      if (result.warning) toast.warning(result.warning);
      else toast.success(`Jobber disconnected. ${result.deleted?.deleted_records ?? 0} synchronized records were permanently deleted.`);
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

  const jobberPreviewMutation = useMutation({
    mutationFn: async () => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch(`/api/integrations/jobber/monitoring-preview?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await readApiError(response, "Could not generate the Jobber monitoring preview.");
      return response.json() as Promise<JobberMonitoringPreview>;
    },
  });

  const jobberCpaSharingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (organizationId == null) throw new Error("No active organization is available.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/jobber/cpa-sharing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId, enabled }),
      });
      if (!response.ok) throw await readApiError(response, "Could not update CPA sharing preferences.");
      return response.json() as Promise<JobberCpaSharing & { cpa_visibility_changed: false }>;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["jobber-cpa-sharing", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["jobber-cpa-escalation-preview", organizationId] });
      toast.success(result.enabled ? "CPA sharing consent saved. Nothing has been shared yet." : "CPA sharing consent revoked.");
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
    <div className="w-full max-w-none animate-in space-y-6 pb-16 fade-in slide-in-from-bottom-4 duration-500">

      <header className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Workspace settings</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Manage your business profile, financial connections, preferences, and account access.</p>
        </div>
        <nav aria-label="Settings sections" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { href: "#profile-business", label: "Profile & business", description: activeOrganization?.name ?? "Organization", icon: Building2 },
            { href: "#connections", label: "Connections", description: `${plaidProviders.length + (quickBooksStatus.data?.connected ? 1 : 0) + (jobberStatus.data?.connected ? 1 : 0) + (gmailStatus.data?.connected ? 1 : 0)} connected`, icon: Link2 },
            { href: "#financial-preferences", label: "Financial", description: "Margins and rules", icon: ShieldCheck },
            { href: "#account-preferences", label: "Account", description: "Preferences and plan", icon: ChevronRight },
          ].map((item) => {
            const Icon = item.icon;
            return <a key={item.href} href={item.href} className="group rounded-xl border border-border/60 bg-card/70 p-3 transition-colors hover:border-primary/40 hover:bg-card sm:p-4">
              <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">{item.label}</span></div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{item.description}</p>
            </a>;
          })}
        </nav>
      </header>

      {/* ── Profile ── */}
      <button
        id="profile-business"
        onClick={() => navigate("/user/profile")}
        className="flex w-full scroll-mt-6 items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/35 hover:bg-card/90 sm:p-5"
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{activeOrganization?.name ?? "No active organization"}</span>
            <span className="text-xs text-muted-foreground">Open profile and business details</span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      <section id="financial-preferences" className="scroll-mt-6" aria-labelledby="contractor-target-title">
        <div className="mb-4">
          <h2 id="contractor-target-title" className="text-sm font-semibold">Job profitability target</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set the gross margin target BookSmart should use when evaluating jobs for this business.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <label htmlFor="target-gross-margin" className="text-sm font-medium">Target gross margin</label>
          <div className="mt-2 flex max-w-sm items-center gap-2">
            <div className="relative flex-1">
              <input id="target-gross-margin" type="number" min="0" max="100" step="0.1" inputMode="decimal"
                value={targetMarginPercent} onChange={(event) => setTargetMarginPercent(event.target.value)}
                placeholder="Not configured" disabled={!organizationId || contractorSettings.isLoading || contractorSettingsMutation.isPending}
                className="h-10 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <Button onClick={() => contractorSettingsMutation.mutate()} disabled={!organizationId || contractorSettings.isLoading || contractorSettingsMutation.isPending}>
              {contractorSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            This is your organization’s target, not a universal recommendation. Leave it empty to avoid target-based margin warnings.
          </p>
          {contractorSettings.isError && <p className="mt-2 text-xs text-destructive">The current target could not be loaded. Nothing was changed.</p>}
        </div>
      </section>

      <section id="connections" className="scroll-mt-6 space-y-4" aria-labelledby="accounting-integrations-title">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Data sources</p>
          <h2 id="accounting-integrations-title" className="mt-1 text-xl font-semibold">Connections</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage where BookSmart receives accounting, banking, and operational information.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600" aria-label="Gmail"><Mail className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Gmail receipts</h3>{gmailStatus.data?.connected && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</span>}</div>
                <p className="mt-1 text-sm text-muted-foreground">{gmailStatus.data?.connected ? `Connected to ${gmailStatus.data.connection?.google_account_email ?? "Gmail"}. Receipt emails are supporting evidence only.` : "Find receipts and invoices using read-only Gmail access. Gmail never creates accounting transactions."}</p>
                {gmailStatus.data?.connected && gmailStatus.data.connection?.last_scan_at && <p className="mt-1 text-xs text-muted-foreground">Last scan {new Date(gmailStatus.data.connection.last_scan_at).toLocaleString()}</p>}
                {gmailScanSummary && <div className="mt-2"><p className="text-xs text-muted-foreground">Reviewed {gmailScanSummary.emails_reviewed} emails · found {gmailScanSummary.possible_receipts} possible receipts · processed {gmailScanSummary.processed_receipts} · matched {gmailScanSummary.matched} · needs review {gmailScanSummary.needs_review} · unmatched {gmailScanSummary.unmatched} · skipped {gmailScanSummary.duplicates_skipped} duplicates{gmailScanSummary.failures ? ` · ${gmailScanSummary.failures} could not be processed` : ""}. No accounting transactions were changed.</p>{(gmailScanSummary.processed_receipts > 0 || gmailScanSummary.duplicates_skipped > 0) && <Button className="mt-2 h-auto p-0 text-xs" variant="link" onClick={() => navigate("/user/tasks#receipt-review")}>Review receipt evidence</Button>}</div>}
                {gmailStatus.data && (!gmailStatus.data.enabled || !gmailStatus.data.configured) && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Google setup is not configured yet. BookSmart remains unchanged.</p>}
                {gmailStatus.isError && <p className="mt-2 text-xs text-destructive">Gmail status is temporarily unavailable. Existing connections were not changed.</p>}
              </div>
            </div>
            {gmailStatus.isLoading ? <Button variant="outline" disabled><Loader2 className="animate-spin" /> Checking status</Button> : gmailStatus.data?.connected ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end"><select aria-label="Gmail scan period" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={gmailScanDays} disabled={gmailScanMutation.isPending} onChange={(event) => setGmailScanDays(Number(event.target.value) as 30 | 60 | 90)}><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option></select><Button variant="outline" disabled={gmailScanMutation.isPending || gmailDisconnectMutation.isPending} onClick={() => gmailScanMutation.mutate()}>{gmailScanMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {gmailScanMutation.isPending ? "Scanning Gmail…" : "Scan for receipts"}</Button><Button variant="outline" onClick={() => navigate("/user/tasks#receipt-review")}><Eye /> Review receipts</Button><Button variant="outline" className="text-destructive hover:text-destructive" disabled={gmailDisconnectMutation.isPending || gmailScanMutation.isPending} onClick={() => setGmailDisconnectOpen(true)}>{gmailDisconnectMutation.isPending ? <Loader2 className="animate-spin" /> : <Unplug />} Disconnect</Button></div> : <Button disabled={!organizationId || !gmailStatus.data?.enabled || !gmailStatus.data?.configured || gmailConnectMutation.isPending} onClick={() => gmailConnectMutation.mutate()}>{gmailConnectMutation.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Connect Gmail</Button>}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2ca01c]/10 text-[#2ca01c]" aria-label="QuickBooks">
                <SiQuickbooks className="h-6 w-6" />
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
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#7db00e] text-xl font-bold text-white" aria-label="Jobber">J</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="jobber-integration-title" className="font-semibold">Jobber</h2>
                  {jobberStatus.data?.connected && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">Connected</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {jobberStatus.data?.connected
                    ? `Connected to ${jobberStatus.data.connection?.jobber_account_name || "your Jobber test account"}.`
                    : "Connect operational clients and work records. Jobber data never enters accounting reports."}
                </p>
                {jobberStatus.data?.health.message && (
                  <p className={`mt-2 text-sm ${jobberStatus.data.health.state === "reauthorization_required" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {jobberStatus.data.health.message}
                  </p>
                )}
                {jobberStatus.data?.connected && jobberStatus.data?.connection?.last_successful_sync_at && (
                  <p className="mt-1 text-xs text-muted-foreground">Last synced {new Date(jobberStatus.data.connection.last_successful_sync_at).toLocaleString()} · {Object.values(jobberSyncStatus.data?.counts ?? {}).reduce((sum, count) => sum + count.active, 0)} active records</p>
                )}
                {jobberStatus.data?.connection?.api_version_warning && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{jobberStatus.data.connection.api_version_warning}</p>}
              </div></div>
              {jobberStatus.data?.connected ? (
                <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
                  <Button size="sm" disabled={jobberSyncMutation.isPending} onClick={() => jobberSyncMutation.mutate("incremental")}>
                    {jobberSyncMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
                  </Button>
                  <Button size="sm" variant="outline" disabled={jobberSyncMutation.isPending} onClick={() => jobberSyncMutation.mutate("full")}>
                    Full refresh
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate("/user/jobber-records")}>
                    View records
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={jobberDisconnectMutation.isPending}
                    onClick={() => setJobberDisconnectOpen(true)}
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
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-3 lg:grid-cols-6">
                {(["clients", "jobs", "scheduled_items", "quotes", "invoices", "payments"] as const).map((kind) => {
                  const counts = jobberSyncStatus.data?.counts[kind] ?? { active: 0, archived: 0 };
                  const state = jobberSyncStatus.data?.states.find((item) => item.object_type === kind);
                  return (
                    <div key={kind} className="bg-card px-3 py-2.5">
                      <p className="text-[11px] capitalize text-muted-foreground">{kind.replace("_", " ")}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">{counts.active}<span className="ml-1 text-[11px] font-normal text-muted-foreground">active</span></p>
                      {counts.archived > 0 && <p className="text-[10px] text-muted-foreground">{counts.archived} archived</p>}
                      {state?.last_error && <p className="mt-1 text-xs text-destructive">{state.last_error}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {jobberStatus.data?.connected && (
              <div className="mt-3">
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        <p className="text-sm font-medium">CPA review preview</p>
                        <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">Nothing shared</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Flag qualifying uninvoiced Jobber work for your private review.</p>
                    </div>
                    {jobberCpaSharing.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : jobberCpaSharing.isError ? (
                      <Button size="sm" variant="outline" onClick={() => void jobberCpaSharing.refetch()}>Retry preferences</Button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-medium">{jobberCpaSharing.data?.enabled ? "On" : "Off"}</span>
                        <Switch
                          aria-label="Allow future CPA sharing of qualifying Jobber alerts"
                          checked={jobberCpaSharing.data?.enabled === true}
                          disabled={jobberCpaSharingMutation.isPending}
                          onCheckedChange={(enabled) => jobberCpaSharingMutation.mutate(enabled)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex justify-end">
                    <Button asChild size="sm" variant="ghost"><a href="/user/my-cpa">Review</a></Button>
                  </div>
                </div>
              </div>
            )}
            {jobberPreviewUiEnabled && jobberStatus.data?.connected && (
              <div className="mt-4 border-t border-border/60 pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      <p className="text-sm font-medium">Monitoring preview</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Dry run only. This reviews synchronized Jobber records and creates no signals, tasks, notifications, or accounting entries.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={jobberPreviewMutation.isPending}
                    onClick={() => jobberPreviewMutation.mutate()}
                  >
                    {jobberPreviewMutation.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
                    {jobberPreviewMutation.data ? "Refresh preview" : "Preview monitoring"}
                  </Button>
                </div>

                {jobberPreviewMutation.isPending && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" /> Evaluating synchronized records&hellip;
                  </div>
                )}

                {jobberPreviewMutation.isError && (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4" role="alert">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Preview unavailable</p>
                    <p className="mt-1 text-xs text-muted-foreground">{jobberPreviewMutation.error.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Your Jobber connection and synchronized records were not changed.</p>
                  </div>
                )}

                {jobberPreviewMutation.data?.organization_id === organizationId && !jobberPreviewMutation.isPending && (
                  <div className="mt-4 rounded-lg border border-border/60 bg-background/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {jobberPreviewMutation.data.candidate_count === 0
                            ? "No proposed signals"
                            : `${jobberPreviewMutation.data.candidate_count} proposed signal${jobberPreviewMutation.data.candidate_count === 1 ? "" : "s"}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Based on the latest synchronized Jobber data. Nothing shown here has been saved.
                        </p>
                      </div>
                      <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">Dry run</span>
                    </div>

                    {jobberPreviewMutation.data.candidates.length === 0 ? (
                      <p className="mt-4 rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                        The current records do not meet any preview thresholds. Sync Jobber and refresh the preview after operational data changes.
                      </p>
                    ) : (
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {jobberPreviewMutation.data.candidates.map((candidate) => (
                          <article key={candidate.signalKey} className="rounded-lg border border-border/60 bg-card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold">{candidate.title}</h3>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${previewSeverityClass[candidate.severity]}`}>
                                {candidate.severity}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{candidate.description}</p>
                            <div className="mt-3 rounded-md bg-muted/40 p-3">
                              <p className="text-xs font-medium">Suggested next step</p>
                              <p className="mt-1 text-xs text-muted-foreground">{candidate.recommendedAction}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{candidate.sourceIds?.length ?? 0} source record{candidate.sourceIds?.length === 1 ? "" : "s"}</span>
                              {candidate.directUrl?.startsWith("https://") && (
                                <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={candidate.directUrl} target="_blank" rel="noreferrer">
                                  Open in Jobber <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {plaidSyncStage !== "idle" && (
          <div className="fixed left-1/2 top-4 z-[9999] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2">
            <div className={`rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur ${
              plaidSyncStage === "complete" ? "border-emerald-500/30"
                : plaidSyncStage === "error" ? "border-destructive/30"
                  : "border-primary/30"
            }`}>
              <div className="flex items-start gap-3">
                {["connecting", "syncing", "categorizing", "refreshing"].includes(plaidSyncStage) && (
                  <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
                )}
                {plaidSyncStage === "complete" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
                {plaidSyncStage === "error" && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {plaidSyncStage === "connecting" && "Connecting your bank"}
                    {plaidSyncStage === "syncing" && "Importing bank transactions"}
                    {plaidSyncStage === "categorizing" && "Categorizing transactions"}
                    {plaidSyncStage === "refreshing" && "Updating BookSmart"}
                    {plaidSyncStage === "complete" && "Bank import complete"}
                    {plaidSyncStage === "error" && "Bank import failed"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{plaidSyncMessage}</p>
                  {["connecting", "syncing", "categorizing", "refreshing"].includes(plaidSyncStage) && (
                    <>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">Please keep this page open while BookSmart processes your bank data.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                return <div key={provider.id} className="overflow-hidden rounded-xl border border-border/60 bg-card">
                  <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10" aria-label={provider.name}>{provider.name.toLowerCase().includes("chase") ? <SiChase className="h-6 w-6 text-[#117aca]" /> : <Landmark className="h-5 w-5 text-sky-400" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{provider.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthy ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{healthy ? "Connected" : "Needs attention"}</span></div><p className="mt-1 text-xs text-muted-foreground">{provider.lastDataRefresh ? `Last synchronized ${new Date(provider.lastDataRefresh).toLocaleString()}` : "Not synchronized yet"}</p>{provider.error && <p className="mt-1 text-xs text-destructive">{provider.error}</p>}{provider.stale && !provider.error && <p className="mt-1 text-xs text-amber-400">This connection has not refreshed recently.</p>}</div></div>
                    <div className="flex flex-wrap gap-2 sm:justify-end"><Button size="sm" variant="secondary" disabled={syncBankMutation.isPending} onClick={() => syncBankMutation.mutate(provider)}>{syncBankMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setBankDisconnectTarget(provider)}><Unplug />Disconnect</Button></div>
                  </div>
                  </div>
                  {plaidBalances.isLoading ? <div className="flex items-center gap-2 border-t border-border/60 bg-background/25 px-4 py-4 text-xs text-muted-foreground sm:px-5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading accounts</div> : accounts.length > 0 ? <div className="grid gap-px border-t border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">{accounts.map((account) => {
                    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: account.currency || "USD" });
                    return <div key={account.account_id} className="bg-card px-4 py-4 sm:px-5"><p className="truncate text-sm font-medium">{account.name}{account.mask ? ` •••• ${account.mask}` : ""}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{account.subtype ?? account.type ?? "Bank account"}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><div><p className="text-[11px] text-muted-foreground">Current</p><p className="text-sm font-semibold tabular-nums">{account.current == null ? "Unavailable" : formatter.format(account.current)}</p></div>{account.available != null && <div><p className="text-[11px] text-muted-foreground">Available</p><p className="text-sm font-semibold tabular-nums">{formatter.format(account.available)}</p></div>}</div></div>;
                  })}</div> : plaidBalances.isError ? <p className="border-t border-border/60 px-4 py-4 text-xs text-muted-foreground sm:px-5">Account balances could not be refreshed. The bank connection is still listed above.</p> : null}
                </div>;
              })}
            </div>
          )}
        </section>

      <section id="account-preferences" className="scroll-mt-6" aria-labelledby="account-preferences-title">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Workspace</p>
          <h2 id="account-preferences-title" className="mt-1 text-xl font-semibold">Preferences and account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Customize BookSmart and manage business tools, plan, and access.</p>
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          <div className="h-full overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="border-b border-border/50 px-4 py-3"><h3 className="text-sm font-semibold">Experience</h3><p className="mt-0.5 text-xs text-muted-foreground">Alerts and display preferences</p></div>
            <div className="divide-y divide-border/40 px-4">
              <Row label="Notifications" onClick={soon} />
              <ToggleRow label="Auto Review Results" checked={autoReview} onCheckedChange={setAutoReview} />
              <ToggleRow label="Pro Tips" checked={proTips} onCheckedChange={setProTips} />
              <ToggleRow label="Dark Mode" checked={isDarkMode} onCheckedChange={toggleDark} />
            </div>
          </div>
          <div className="h-full overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="border-b border-border/50 px-4 py-3"><h3 className="text-sm font-semibold">Business tools</h3><p className="mt-0.5 text-xs text-muted-foreground">Rules, documents, and planning</p></div>
            <div className="divide-y divide-border/40 px-4">
              <Row label="Category Rules" onClick={() => navigate("/user/rules-management")} />
              <Row label="Documents Repository" onClick={() => navigate("/user/reports")} />
              <Row label="Organizations" onClick={() => navigate("/user/organizations")} />
              <Row label="Financial Planning Inputs" onClick={() => navigate("/user/financial-inputs")} />
            </div>
          </div>
          <div className="h-full overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="border-b border-border/50 px-4 py-3"><h3 className="text-sm font-semibold">Plan and access</h3><p className="mt-0.5 text-xs text-muted-foreground">Subscription, tokens, and security</p></div>
            <div className="divide-y divide-border/40 px-4">
              <Row label="Subscription" onClick={() => navigate("/user/subscription")} />
              <Row label="Purchase Tokens" onClick={() => navigate("/user/token")} />
              <Row label="Sponsored Offers" onClick={soon} />
              <Row label="Cards" onClick={soon} />
              <Row label="Delete Account" onClick={soon} destructive />
              <Row label="Logout" onClick={signOut} destructive />
            </div>
          </div>
        </div>
      </section>

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

      <AlertDialog open={gmailDisconnectOpen} onOpenChange={(open) => { if (!gmailDisconnectMutation.isPending) setGmailDisconnectOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
            <AlertDialogDescription>
              BookSmart will revoke Gmail access and remove the stored OAuth credentials for this organization. Previously found receipt evidence and accounting transactions will not be deleted or changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gmailDisconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={gmailDisconnectMutation.isPending}
              onClick={(event) => { event.preventDefault(); gmailDisconnectMutation.mutate(); }}
            >
              {gmailDisconnectMutation.isPending && <Loader2 className="animate-spin" />}
              Disconnect Gmail
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={jobberDisconnectOpen} onOpenChange={(open) => { if (!jobberDisconnectMutation.isPending) setJobberDisconnectOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Jobber and delete its data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all synchronized Jobber customers, jobs, quotes, invoices, payments, schedules, matching suggestions, tracked job-cost assignments, Jobber signals, and related tasks for this organization. Accounting transactions and uploaded documents will not be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={jobberDisconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={jobberDisconnectMutation.isPending}
              onClick={(event) => { event.preventDefault(); jobberDisconnectMutation.mutate(); }}
            >
              {jobberDisconnectMutation.isPending && <Loader2 className="animate-spin" />}
              Disconnect and delete Jobber data
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
