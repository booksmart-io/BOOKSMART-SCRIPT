import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Loader2, ClipboardList, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { checkAddBusiness } from "@/lib/plan-limits";
import BusinessSurveyDialog from "@/components/business-survey-dialog";
import BusinessSetupDialog from "@/components/business-setup-dialog";
import { useActiveOrganizationId, clearStoredActiveOrganizationId } from "@/lib/active-organization";

type StateRow = { id: number; name: string; code: string };

type OrgRow = {
  id: number;
  name: string;
  org_type: string;
  industry: string;
  ein_tin: string;
  state: number;
  street: string;
  city: string;
  zip: string;
  phone: string;
  email: string;
  website: string | null;
};

const ORG_TYPES = [
  "Sole Proprietorship",
  "LLC (Single-member)",
  "LLC (Multi-member)",
  "Partnership",
  "S-Corporation",
  "C-Corporation",
  "Nonprofit",
];

const EMPTY_FORM = {
  name: "",
  org_type: "",
  industry: "",
  ein_tin: "",
  state: "",
  street: "",
  city: "",
  zip: "",
  phone: "",
  email: "",
  website: "",
};

export default function Organizations() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const qc = useQueryClient();
  const [activeOrgId, setActiveOrgId] = useActiveOrganizationId(numericId);

  const [formOpen, setFormOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [surveyOrgId, setSurveyOrgId] = useState<number | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);

  const { data: orgs = [], isLoading: orgsLoading } = useQuery<OrgRow[]>({
    queryKey: ["organizations_list", numericId],
    enabled: numericId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, org_type, industry, ein_tin, state, street, city, zip, phone, email, website")
        .eq("owner_id", numericId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data as OrgRow[]) ?? [];
    },
  });

  const { data: states = [] } = useQuery<StateRow[]>({
    queryKey: ["states"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("states").select("id, name, code").order("name");
      if (error) throw error;
      return (data as StateRow[]) ?? [];
    },
  });

  function openCreateDialog() {
    setEditingOrg(null);
    setSetupOpen(true);
  }

  function openEditDialog(org: OrgRow) {
    setEditingOrg(org);
    setForm({
      name: org.name ?? "",
      org_type: org.org_type ?? "",
      industry: org.industry ?? "",
      ein_tin: org.ein_tin ?? "",
      state: org.state ? String(org.state) : "",
      street: org.street ?? "",
      city: org.city ?? "",
      zip: org.zip ?? "",
      phone: org.phone ?? "",
      email: org.email ?? "",
      website: org.website ?? "",
    });
    setFormOpen(true);
  }

  function openSurvey(orgId: number) {
    setSurveyOrgId(orgId);
    setSurveyOpen(true);
  }

  function switchOrganization(org: OrgRow) {
    setActiveOrgId(org.id);
    qc.invalidateQueries();
    toast.success(`Switched to ${org.name}.`);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (numericId === null) throw new Error("No user ID available");
      if (!form.name.trim()) throw new Error("Business name is required");
      if (!form.org_type) throw new Error("Business type is required");
      if (!form.ein_tin.trim()) throw new Error("EIN / TIN is required");
      if (!form.state) throw new Error("State is required");

      const payload = {
        name: form.name.trim(),
        org_type: form.org_type,
        industry: form.industry.trim(),
        ein_tin: form.ein_tin.trim(),
        state: Number(form.state),
        street: form.street.trim(),
        city: form.city.trim(),
        zip: form.zip.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim() || null,
      };

      if (editingOrg) {
        const { error } = await supabase.from("organizations").update(payload).eq("id", editingOrg.id);
        if (error) throw error;
        return null;
      } else {
        await checkAddBusiness();
        const { data, error } = await supabase
          .from("organizations")
          .insert({ ...payload, owner_id: numericId })
          .select("id")
          .single();
        if (error) throw error;
        return (data as { id: number }).id;
      }
    },
    onSuccess: (newId) => {
      toast.success(editingOrg ? "Business updated." : "Business added.");
      qc.invalidateQueries({ queryKey: ["organizations_list", numericId] });
      qc.invalidateQueries({ queryKey: ["dashboard_org", numericId] });
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save business");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (orgId: number) => {
      const { error } = await supabase.from("organizations").delete().eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization deleted.");
      if (deleteTarget?.id === activeOrgId) {
        clearStoredActiveOrganizationId(numericId);
      }
      qc.invalidateQueries({ queryKey: ["organizations_list", numericId] });
      qc.invalidateQueries({ queryKey: ["dashboard_org", numericId] });
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete organization");
      setDeleteTarget(null);
    },
  });

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">Manage your businesses, LLCs, and freelance entities.</p>
        </div>
      </div>

      {orgsLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center rounded-xl border border-dashed border-border/60">
          <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">No organizations yet</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
              Add your first business or freelance entity to start tracking transactions, reports, and tax strategies.
            </p>
          </div>
          <Button className="gap-2 mt-1" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" /> Add Business
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{org.name}</p>
                <p className="text-xs text-muted-foreground truncate">{org.ein_tin || "No EIN/TIN"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant={activeOrgId === org.id ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => switchOrganization(org)}
                  disabled={activeOrgId === org.id}
                >
                  {activeOrgId === org.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {activeOrgId === org.id ? "Current" : "Switch"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  title="Business Survey"
                  onClick={() => openSurvey(org.id)}
                >
                  <ClipboardList className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Edit Organization"
                  onClick={() => openEditDialog(org)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Delete Organization"
                  onClick={() => setDeleteTarget(org)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating add button */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg shadow-primary/30"
          onClick={openCreateDialog}
          title="Add Organization"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrg ? "Edit Business" : "Add a Business"}</DialogTitle>
            <DialogDescription>
              This entity is used to track your transactions, reports, and tax strategies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="org-name">Business Name *</Label>
                <Input id="org-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Acme LLC" />
              </div>
              <div className="space-y-2">
                <Label>Business Type *</Label>
                <Select value={form.org_type} onValueChange={(v) => setForm((f) => ({ ...f, org_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ORG_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-industry">Industry</Label>
                <Input id="org-industry" value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Consulting" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-ein">EIN / TIN *</Label>
                <Input id="org-ein" value={form.ein_tin} onChange={(e) => setForm((f) => ({ ...f, ein_tin: e.target.value }))} placeholder="12-3456789" />
              </div>
              <div className="space-y-2">
                <Label>State *</Label>
                <Select value={form.state} onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {states.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="org-street">Street Address</Label>
                <Input id="org-street" value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} placeholder="123 Main St" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-city">City</Label>
                <Input id="org-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Austin" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-zip">ZIP Code</Label>
                <Input id="org-zip" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} placeholder="78701" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-phone">Phone</Label>
                <Input id="org-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-email">Business Email</Label>
                <Input id="org-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="hello@acme.com" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="org-website">Website (optional)</Label>
                <Input id="org-website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://acme.com" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingOrg ? "Save Changes" : "Add Business"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Business Survey dialog */}
      <BusinessSurveyDialog
        orgId={surveyOrgId}
        open={surveyOpen}
        onOpenChange={setSurveyOpen}
      />

      <BusinessSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        ownerId={numericId}
        states={states}
        defaultEmail={profile?.email ?? ""}
        onSaved={(newId) => {
          toast.success("Business added. Now complete the business survey.");
          qc.invalidateQueries({ queryKey: ["organizations_list", numericId] });
          qc.invalidateQueries({ queryKey: ["dashboard_org", numericId] });
          setSetupOpen(false);
          setActiveOrgId(newId);
          openSurvey(newId);
        }}
        onError={(message) => toast.error(message)}
      />
    </div>
  );
}
