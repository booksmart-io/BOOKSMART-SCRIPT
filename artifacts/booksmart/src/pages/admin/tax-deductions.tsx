import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const [groupId, setGroupId] = useState<string>("");
  const [subCatId, setSubCatId] = useState<string>("");
  const [calcType, setCalcType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState<string>("");
  const [isPerTx, setIsPerTx] = useState(false);
  const [maxPerTx, setMaxPerTx] = useState<string>("");
  const [filterGroupId, setFilterGroupId] = useState<string>("all");

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

  function openAdd() {
    setEditing(null);
    setGroupId(groups[0] ? String(groups[0].id) : "");
    setSubCatId(""); setCalcType("percentage"); setValue(""); setIsPerTx(false); setMaxPerTx("");
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
    setFormOpen(false); setEditing(null);
    setGroupId(""); setSubCatId(""); setCalcType("percentage"); setValue(""); setIsPerTx(false); setMaxPerTx("");
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

  function groupLabel(g: RuleGroup) {
    return g.state_id ? `State ${g.state_id} (from ${g.valid_from})` : `Federal (from ${g.valid_from})`;
  }

  const filtered = filterGroupId === "all" ? rules : rules.filter((r) => String(r.deduction_rule_group_id) === filterGroupId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tax Deductions</h1>
          <p className="text-muted-foreground">Manage deduction rules applied to sub-categories for tax calculations.</p>
        </div>
        <Button className="gap-2 bg-primary" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Deduction Rules</CardTitle>
            <CardDescription>Each rule defines how much of a sub-category expense can be deducted (percentage or fixed amount).</CardDescription>
          </div>
          <Select value={filterGroupId} onValueChange={setFilterGroupId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{groupLabel(g)}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md border-border/50">
            <Table>
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead>Sub-category</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Calc Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Per Transaction</TableHead>
                  <TableHead>Max / Tx</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No deduction rules found.</TableCell></TableRow>
                ) : filtered.map((rule) => {
                  const sub = subCategories.find((s) => s.id === rule.sub_category_id);
                  const group = groups.find((g) => g.id === rule.deduction_rule_group_id);
                  return (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{sub?.name ?? `Sub #${rule.sub_category_id}`}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {group?.state_id ? `State ${group.state_id}` : "Federal"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={rule.calculation_type === "percentage" ? "text-blue-400" : "text-emerald-400"}>
                          {rule.calculation_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {rule.calculation_type === "percentage" ? `${rule.value}%` : `$${rule.value}`}
                      </TableCell>
                      <TableCell>
                        {rule.is_per_transaction
                          ? <Badge variant="secondary" className="text-amber-400">Yes</Badge>
                          : <span className="text-xs text-muted-foreground">No</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rule.max_deduction_per_transaction != null ? `$${rule.max_deduction_per_transaction}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(rule)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setToDelete(rule)}>
                            <Trash2 className="h-4 w-4" />
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
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader><DialogTitle>{editing ? "Edit Deduction Rule" : "Add Deduction Rule"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rule Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{groupLabel(g)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-category</Label>
              <Select value={subCatId} onValueChange={setSubCatId}>
                <SelectTrigger><SelectValue placeholder="Select sub-category…" /></SelectTrigger>
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

      {/* Delete confirm */}
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
    </div>
  );
}
