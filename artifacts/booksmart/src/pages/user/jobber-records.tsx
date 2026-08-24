import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const objectTypes = ["clients", "jobs", "scheduled_items", "quotes", "invoices", "payments"] as const;
type ObjectType = typeof objectTypes[number];
type JobberRecord = {
  external_id: string; object_type: ObjectType; related_client_id: string | null; parent_id: string | null;
  record_number: string | null; status: string | null; title: string | null; starts_at: string | null;
  ends_at: string | null; source_created_at: string | null; source_updated_at: string | null;
  direct_url: string | null; amount: number | null; is_archived: boolean; archived_at: string | null; last_seen_at: string;
};
type RecordsResponse = { records: JobberRecord[]; page: number; page_size: number; total: number; object_type: ObjectType };

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return data.session.access_token;
}

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
const displayDate = (value: string | null) => value ? new Date(value).toLocaleString() : "—";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function JobberRecords() {
  const [, navigate] = useLocation();
  const { profile } = useAuth();
  const [activeOrganizationId] = useActiveOrganizationId(profile?.numericId ?? null);
  const initialParams = new URLSearchParams(window.location.search);
  const requestedType = initialParams.get("object_type") as ObjectType | null;
  const requestedRecordId = initialParams.get("record_id");
  const [objectType, setObjectType] = useState<ObjectType>(requestedType && objectTypes.includes(requestedType) ? requestedType : "clients");
  const [page, setPage] = useState(1);
  const organization = useQuery({
    queryKey: ["jobber-records-organization", profile?.numericId, activeOrganizationId], enabled: profile?.numericId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id,name").eq("owner_id", profile!.numericId!).order("id");
      if (error) throw error;
      return pickActiveOrganization(data, activeOrganizationId);
    },
  });
  const records = useQuery<RecordsResponse>({
    queryKey: ["jobber-records", organization.data?.id, objectType, page], enabled: organization.data?.id != null,
    queryFn: async () => {
      const token = await accessToken();
      const params = new URLSearchParams({ organization_id: String(organization.data!.id), object_type: objectType, page: String(page), page_size: "50" });
      if (requestedRecordId && objectType === requestedType) params.set("record_id", requestedRecordId);
      const response = await fetch(`/api/integrations/jobber/records?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || "Could not load Jobber records."); }
      return response.json();
    },
  });
  const pages = Math.max(1, Math.ceil((records.data?.total ?? 0) / (records.data?.page_size ?? 50)));

  return <div className="w-full space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><Button variant="ghost" size="sm" className="-ml-3 mb-1" onClick={() => navigate("/user/settings")}><ArrowLeft /> Settings</Button><h1 className="text-2xl font-bold">Jobber records</h1><p className="text-sm text-muted-foreground">Read-only operational data for {organization.data?.name ?? "your organization"}. These records do not affect accounting totals.</p></div>
      {records.data && <Badge variant="outline" className="w-fit">{records.data.total} {label(objectType)}</Badge>}
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Jobber record types">
      {objectTypes.map(type => <Button key={type} size="sm" variant={type === objectType ? "default" : "outline"} className="shrink-0" onClick={() => { setObjectType(type); setPage(1); }}>{label(type)}</Button>)}
    </div>
    {organization.isLoading || records.isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : records.isError ? <Card><CardContent className="p-6 text-sm text-destructive">{records.error.message}</CardContent></Card> : records.data?.records.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No {label(objectType).toLowerCase()} have been synchronized.</CardContent></Card> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{records.data?.records.map(record => <RecordCard key={record.external_id} record={record} highlighted={record.external_id === requestedRecordId} />)}</div>
      <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Page {page} of {pages}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>
    </>}
  </div>;
}

function Status({ record }: { record: JobberRecord }) {
  return <Badge variant="outline" className={record.is_archived ? "border-muted-foreground/40 text-muted-foreground" : "border-emerald-500/30 text-emerald-400"}>{record.is_archived ? "Archived" : record.status ? label(record.status) : "Active"}</Badge>;
}

function RecordCard({ record, highlighted }: { record: JobberRecord; highlighted: boolean }) {
  return <Card className={highlighted ? "border-primary ring-1 ring-primary/40" : undefined}><CardContent className="space-y-3 p-4">{highlighted && <Badge className="w-fit">Source record</Badge>}<div className="flex items-start justify-between gap-3"><div><p className="font-medium">{record.title || record.record_number || label(record.object_type)}</p><p className="break-all text-xs text-muted-foreground">{record.record_number ? `#${record.record_number}` : record.external_id}</p></div><Status record={record} /></div><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Amount</p><p>{record.amount == null ? "—" : money.format(record.amount)}</p></div><div><p className="text-muted-foreground">Relevant date</p><p>{displayDate(record.starts_at)}</p></div><div className="col-span-2"><p className="text-muted-foreground">Updated</p><p>{displayDate(record.source_updated_at)}</p></div></div>{record.direct_url && <Button asChild variant="outline" size="sm" className="w-full"><a href={record.direct_url} target="_blank" rel="noreferrer">Open in Jobber <ExternalLink /></a></Button>}</CardContent></Card>;
}
