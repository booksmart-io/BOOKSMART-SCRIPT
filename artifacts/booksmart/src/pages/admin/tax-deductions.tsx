import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Edit, Loader2, MoreVertical, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATE_OPTIONS = [
  { id: 1, name: "Alabama" },
  { id: 2, name: "Alaska" },
  { id: 4, name: "Arizona" },
  { id: 5, name: "Arkansas" },
  { id: 6, name: "California" },
  { id: 8, name: "Colorado" },
  { id: 9, name: "Connecticut" },
  { id: 10, name: "Delaware" },
  { id: 11, name: "District of Columbia" },
  { id: 12, name: "Florida" },
  { id: 13, name: "Georgia" },
  { id: 15, name: "Hawaii" },
  { id: 16, name: "Idaho" },
  { id: 17, name: "Illinois" },
  { id: 18, name: "Indiana" },
  { id: 19, name: "Iowa" },
  { id: 20, name: "Kansas" },
  { id: 21, name: "Kentucky" },
  { id: 22, name: "Louisiana" },
  { id: 23, name: "Maine" },
  { id: 24, name: "Maryland" },
  { id: 25, name: "Massachusetts" },
  { id: 26, name: "Michigan" },
  { id: 27, name: "Minnesota" },
  { id: 28, name: "Mississippi" },
  { id: 29, name: "Missouri" },
  { id: 30, name: "Montana" },
  { id: 31, name: "Nebraska" },
  { id: 32, name: "New York" },
  { id: 33, name: "New Hampshire" },
  { id: 34, name: "New Jersey" },
  { id: 35, name: "New Mexico" },
  { id: 36, name: "Nevada" },
  { id: 37, name: "North Carolina" },
  { id: 38, name: "North Dakota" },
  { id: 39, name: "Ohio" },
  { id: 40, name: "Oklahoma" },
  { id: 41, name: "Oregon" },
  { id: 42, name: "Pennsylvania" },
  { id: 44, name: "Rhode Island" },
  { id: 45, name: "South Carolina" },
  { id: 46, name: "South Dakota" },
  { id: 47, name: "Tennessee" },
  { id: 48, name: "Texas" },
  { id: 49, name: "Utah" },
  { id: 50, name: "Vermont" },
  { id: 51, name: "Virginia" },
  { id: 53, name: "Washington" },
  { id: 54, name: "West Virginia" },
  { id: 55, name: "Wisconsin" },
  { id: 56, name: "Wyoming" },
];

type Category = { id: number; name: string };
type SubCategory = { id: number; name: string; category_id: number };
type RuleGroup = { id: number; state_id: number | null; valid_from: string; valid_to: string | null; description: string | null };
type DeductionRule = {
  id: number;
  deduction_rule_group_id: number;
  sub_category_id: number;
  organization_column_name: string | null;
  calculation_type: "percentage" | "fixed";
  value: number;
  is_per_transaction: boolean;
  max_deduction_per_transaction: number | null;
};

export default function AdminTaxDeductions() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [toDelete, setToDelete] = useState<DeductionRule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeductionRule | null>(null);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RuleGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<RuleGroup | null>(null);

  const [groupId, setGroupId] = useState<string>("");
  const [subCatId, setSubCatId] = useState<string>("");
  const [calcType, setCalcType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState<string>("");
  const [isPerTx, setIsPerTx] = useState(false);
  const [maxPerTx, setMaxPerTx] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupJurisdiction, setGroupJurisdiction] = useState<string>("federal");
  const [groupValidFrom, setGroupValidFrom] = useState<string>(() => `${new Date().getFullYear()}-01-01`);
  const [groupValidTo, setGroupValidTo] = useState<string>("");
  const [groupDescription, setGroupDescription] = useState<string>("");

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["admin_category"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category").select("id,name").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories = [] } = useQuery<SubCategory[]>({
    queryKey: ["admin_sub_category"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sub_category").select("id,name,category_id").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: groups = [] } = useQuery<RuleGroup[]>({
    queryKey: ["admin_deduction_rule_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deduction_rule_groups").select("*").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [], isLoading } = useQuery<DeductionRule[]>({
    queryKey: ["admin_deduction_rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deduction_rules").select("*").order("deduction_rule_group_id").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin_deduction_rules"] });
    qc.invalidateQueries({ queryKey: ["admin_deduction_rule_groups"] });
  };

  useEffect(() => {
    if (!selectedGroupId && groups[0]) setSelectedGroupId(String(groups[0].id));
  }, [groups, selectedGroupId]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Omit<DeductionRule, "id"> & { id?: number }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase.from("deduction_rules").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("deduction_rules").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: (_, p) => { invalidate(); toast({ title: p.id ? "Rule updated" : "Rule added" }); closeForm(); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("deduction_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Rule deleted" }); setToDelete(null); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const saveGroupMutation = useMutation({
    mutationFn: async (payload: Omit<RuleGroup, "id"> & { id?: number }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase.from("deduction_rule_groups").update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("deduction_rule_groups").insert(rest).select("id").single();
      if (error) throw error;
      return data?.id as number | undefined;
    },
    onSuccess: (id, payload) => {
      invalidate();
      if (id) setSelectedGroupId(String(id));
      toast({ title: payload.id ? "Rule group updated" : "Rule group added" });
      closeGroupForm();
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (group: RuleGroup) => {
      const { error: rulesError } = await supabase.from("deduction_rules").delete().eq("deduction_rule_group_id", group.id);
      if (rulesError) throw rulesError;
      const { error: groupError } = await supabase.from("deduction_rule_groups").delete().eq("id", group.id);
      if (groupError) throw groupError;
      return group.id;
    },
    onSuccess: (deletedId) => {
      invalidate();
      setGroupToDelete(null);
      if (selectedGroupId === String(deletedId)) {
        const next = groups.find((group) => group.id !== deletedId);
        setSelectedGroupId(next ? String(next.id) : "");
      }
      toast({ title: "Rule group deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditing(null);
    setGroupId(selectedGroupId || (groups[0] ? String(groups[0].id) : ""));
    setSubCatId("");
    setCalcType("percentage");
    setValue("");
    setIsPerTx(false);
    setMaxPerTx("");
    setFormOpen(true);
  }

  function openEdit(rule: DeductionRule) {
    setEditing(rule);
    setGroupId(String(rule.deduction_rule_group_id));
    setSubCatId(String(rule.sub_category_id));
    setCalcType(rule.calculation_type);
    setValue(String(rule.value));
    setIsPerTx(rule.is_per_transaction);
    setMaxPerTx(rule.max_deduction_per_transaction != null ? String(rule.max_deduction_per_transaction) : "");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setGroupId("");
    setSubCatId("");
    setCalcType("percentage");
    setValue("");
    setIsPerTx(false);
    setMaxPerTx("");
  }

  function openAddGroup() {
    setEditingGroup(null);
    setGroupJurisdiction("federal");
    setGroupValidFrom(`${new Date().getFullYear()}-01-01`);
    setGroupValidTo("");
    setGroupDescription("");
    setGroupFormOpen(true);
  }

  function openEditGroup(group: RuleGroup) {
    setEditingGroup(group);
    setGroupJurisdiction(group.state_id == null ? "federal" : String(group.state_id));
    setGroupValidFrom(group.valid_from);
    setGroupValidTo(group.valid_to ?? "");
    setGroupDescription(group.description ?? "");
    setGroupFormOpen(true);
  }

  function closeGroupForm() {
    setGroupFormOpen(false);
    setEditingGroup(null);
    setGroupJurisdiction("federal");
    setGroupValidFrom(`${new Date().getFullYear()}-01-01`);
    setGroupValidTo("");
    setGroupDescription("");
  }

  function handleSave() {
    if (!groupId || !subCatId || !value) return;
    saveMutation.mutate({
      id: editing?.id,
      deduction_rule_group_id: parseInt(groupId),
      sub_category_id: parseInt(subCatId),
      organization_column_name: editing?.organization_column_name ?? null,
      calculation_type: calcType,
      value: parseFloat(value),
      is_per_transaction: isPerTx,
      max_deduction_per_transaction: maxPerTx ? parseFloat(maxPerTx) : null,
    });
  }

  function handleSaveGroup() {
    if (!groupValidFrom) return;
    const stateId = groupJurisdiction === "federal" ? null : parseInt(groupJurisdiction);
    saveGroupMutation.mutate({
      id: editingGroup?.id,
      state_id: stateId,
      valid_from: groupValidFrom,
      valid_to: groupValidTo || null,
      description: groupDescription.trim() || null,
    });
  }

  function groupLabel(g: RuleGroup) {
    if (g.state_id == null) return "Federal";
    return STATE_OPTIONS.find((state) => state.id === g.state_id)?.name || g.description?.trim() || `State ${g.state_id}`;
  }

  function groupDateLabel(g: RuleGroup) {
    return `${g.valid_from} - ${g.valid_to ?? "Current"}`;
  }

  function ruleSummary(rule: DeductionRule) {
    const parts: string[] = [];
    if (rule.organization_column_name) parts.push(`${rule.organization_column_name} first`);
    parts.push(rule.calculation_type === "percentage" ? `${rule.value}%` : `$${rule.value.toFixed(2)} fixed`);
    parts.push(rule.is_per_transaction ? "per transaction" : "bulk");
    if (rule.max_deduction_per_transaction != null) parts.push(`max $${rule.max_deduction_per_transaction.toFixed(2)}`);
    return parts.join(" • ");
  }

  const selectedGroup = groups.find((g) => String(g.id) === selectedGroupId) ?? groups[0] ?? null;
  const selectedGroupKey = selectedGroup ? String(selectedGroup.id) : "";
  const filtered = selectedGroupKey ? rules.filter((r) => String(r.deduction_rule_group_id) === selectedGroupKey) : [];

  return (
    <div className="min-h-[calc(100vh-4rem)] space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-5">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-foreground" onClick={() => window.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Tax Deduction Rules</h1>
      </div>

      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-[330px_1px_minmax(0,1fr)] gap-4">
        <Card className="rounded-lg border-border/60 bg-card/95">
          <CardHeader className="flex flex-row items-center justify-between pb-7">
            <CardTitle className="text-xl">Rule Groups</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground" onClick={invalidate}>
              <RefreshCw className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {groups.map((group) => {
              const active = String(group.id) === selectedGroupKey;
              return (
                <div
                  key={group.id}
                  className={`flex min-h-[64px] w-full items-center justify-between rounded-md px-4 text-left transition ${
                    active ? "bg-foreground text-primary" : "text-foreground hover:bg-secondary/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(String(group.id))}
                    className="min-w-0 flex-1 py-3 text-left"
                  >
                    <span className="block text-base font-semibold">{groupLabel(group)}</span>
                    <span className={`block text-sm ${active ? "text-primary" : "text-muted-foreground"}`}>{groupDateLabel(group)}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className={`h-8 w-8 ${active ? "text-primary" : "text-muted-foreground"}`}>
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditGroup(group)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setGroupToDelete(group)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="bg-border/80" />

        <Card className="relative rounded-lg border-border/60 bg-card/95">
          <CardHeader className="flex flex-row items-center justify-between pb-8">
            <CardTitle className="text-xl">Rules for {selectedGroup ? groupLabel(selectedGroup) : "Selected Group"}</CardTitle>
            <Button className="h-9 rounded-full px-5 font-semibold" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Rule
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-w-[880px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-foreground/80 hover:bg-transparent">
                    <TableHead className="h-12 px-6 text-sm font-medium text-foreground">Category</TableHead>
                    <TableHead className="h-12 px-6 text-sm font-medium text-foreground">Sub-category</TableHead>
                    <TableHead className="h-12 px-6 text-sm font-medium text-foreground">Rule</TableHead>
                    <TableHead className="h-12 px-6 text-sm font-medium text-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No deduction rules found.</TableCell>
                    </TableRow>
                  ) : filtered.map((rule) => {
                    const sub = subCategories.find((s) => s.id === rule.sub_category_id);
                    const category = categories.find((c) => c.id === sub?.category_id);
                    return (
                      <TableRow key={rule.id} className="border-b border-foreground/80 hover:bg-secondary/20">
                        <TableCell className="px-6 py-4 font-semibold">{category?.name ?? "Uncategorized"}</TableCell>
                        <TableCell className="px-6 py-4 font-semibold">{sub?.name ?? `Sub #${rule.sub_category_id}`}</TableCell>
                        <TableCell className="px-6 py-4 font-semibold">{ruleSummary(rule)}</TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:text-primary" onClick={() => openEdit(rule)}>
                              <Edit className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:text-destructive" onClick={() => setToDelete(rule)}>
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <Button
            className="absolute bottom-0 right-0 h-14 rounded-bl-lg rounded-br-lg rounded-tl-lg rounded-tr-none px-7 text-base font-semibold"
            onClick={openAddGroup}
          >
            <Plus className="h-5 w-5" /> Rule Group
          </Button>
        </Card>
      </div>

      <Dialog open={groupFormOpen} onOpenChange={(open) => { if (!open) closeGroupForm(); }}>
        <DialogContent className="sm:max-w-lg bg-card border-border/60">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Rule Group" : "Add Rule Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Jurisdiction</Label>
              <Select value={groupJurisdiction} onValueChange={setGroupJurisdiction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="federal">Federal</SelectItem>
                  {STATE_OPTIONS.map((state) => (
                    <SelectItem key={state.id} value={String(state.id)}>{state.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valid From</Label>
              <Input type="date" value={groupValidFrom} onChange={(event) => setGroupValidFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valid To</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={groupValidTo} onChange={(event) => setGroupValidTo(event.target.value)} />
                {groupValidTo && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setGroupValidTo("")}>
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
              {!groupValidTo && <p className="text-xs text-muted-foreground">Leave blank for Current.</p>}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Description" value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeGroupForm} disabled={saveGroupMutation.isPending}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={!groupValidFrom || saveGroupMutation.isPending}>
              {saveGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingGroup ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader><DialogTitle>{editing ? "Edit Deduction Rule" : "Add Deduction Rule"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rule Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="Select group..." /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{groupLabel(g)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-category</Label>
              <Select value={subCatId} onValueChange={setSubCatId}>
                <SelectTrigger><SelectValue placeholder="Select sub-category..." /></SelectTrigger>
                <SelectContent>
                  {subCategories.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Calculation Type</Label>
                <Select value={calcType} onValueChange={(v) => setCalcType(v as "percentage" | "fixed")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input type="number" placeholder={calcType === "percentage" ? "e.g. 100" : "e.g. 500"} value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input id="per-tx" type="checkbox" checked={isPerTx} onChange={(e) => setIsPerTx(e.target.checked)} className="h-4 w-4 accent-primary" />
              <Label htmlFor="per-tx" className="cursor-pointer">Applied per transaction</Label>
            </div>
            {isPerTx && (
              <div className="space-y-2">
                <Label>Max deduction per transaction ($)</Label>
                <Input type="number" placeholder="e.g. 250" value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeForm} disabled={saveMutation.isPending}>Cancel</Button>
            <Button onClick={handleSave} disabled={!groupId || !subCatId || !value || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Save Changes" : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the deduction rule for <strong>"{subCategories.find((s) => s.id === toDelete?.sub_category_id)?.name ?? "this sub-category"}"</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteMutation.mutate(toDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!groupToDelete} onOpenChange={(open) => { if (!open) setGroupToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete <strong>{groupToDelete ? groupLabel(groupToDelete) : "this rule group"}</strong> and all deduction rules inside it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => groupToDelete && deleteGroupMutation.mutate(groupToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
