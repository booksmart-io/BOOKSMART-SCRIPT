import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Edit, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";

type Category = { id: number; name: string };
type SubCategory = { id: number; category_id: number; name: string };
type CategoryRule = {
  id: number;
  memo: string;
  category_id: number;
  sub_category_id: number | null;
  user_id: string;
  status: boolean;
  created_at: string;
  updated_at: string;
};

export default function RulesManagement() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRule | null>(null);
  const [toDelete, setToDelete] = useState<CategoryRule | null>(null);
  const [memo, setMemo] = useState("");
  const [catId, setCatId] = useState<string>("");
  const [subCatId, setSubCatId] = useState<string>("");

  // ── Data fetching ──────────────────────────────────────────────
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category").select("id,name").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories = [] } = useQuery<SubCategory[]>({
    queryKey: ["sub_category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sub_category").select("id,category_id,name").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch ALL rules for the user — plain select, no join (no FK in schema).
  // Names resolved client-side from categories/subCategories arrays, matching Flutter.
  const { data: rules = [], isLoading } = useQuery<CategoryRule[]>({
    queryKey: ["category_rules", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_rules")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CategoryRule[];
    },
  });

  // Client-side name resolution — mirrors Flutter's getCategoryName / getSubCategoryName
  function getCategoryName(id: number) {
    return categories.find((c) => c.id === id)?.name ?? "-";
  }
  function getSubCategoryName(id: number | null) {
    if (!id) return null;
    return subCategories.find((s) => s.id === id)?.name ?? null;
  }

  // ── Mutations ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({
      id, memo, category_id, sub_category_id,
    }: { id?: number; memo: string; category_id: number; sub_category_id: number | null }) => {
      const payload = { user_id: user!.id, memo, category_id, sub_category_id, status: true };
      if (id) {
        const { error } = await supabase
          .from("category_rules")
          .update({ memo, category_id, sub_category_id, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("category_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["category_rules", user?.id] });
      toast.success(id ? "Rule updated" : "Rule created",
        { description: "Transactions matching this keyword will be auto-categorised." });
      closeForm();
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  // Toggle rule active/inactive — matches Flutter toggleRule
  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: boolean }) => {
      const { error } = await supabase
        .from("category_rules")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["category_rules", user?.id] }),
    onError: (e: Error) => toast.error("Toggle failed", { description: e.message }),
  });

  // Hard delete
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category_rules", user?.id] });
      toast.success("Rule deleted");
      setToDelete(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  // ── Form helpers ───────────────────────────────────────────────
  function openAdd() {
    setEditing(null); setMemo(""); setCatId(""); setSubCatId(""); setFormOpen(true);
  }
  function openEdit(rule: CategoryRule) {
    setEditing(rule);
    setMemo(rule.memo);
    setCatId(String(rule.category_id));
    setSubCatId(rule.sub_category_id ? String(rule.sub_category_id) : "");
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false); setEditing(null); setMemo(""); setCatId(""); setSubCatId("");
  }
  function handleSave() {
    if (!memo.trim() || !catId) return;
    saveMutation.mutate({
      id: editing?.id,
      memo: memo.trim().toLowerCase(),
      category_id: parseInt(catId),
      sub_category_id: subCatId ? parseInt(subCatId) : null,
    });
  }

  const filteredSubs = catId
    ? subCategories.filter((s) => s.category_id === parseInt(catId))
    : subCategories;

  // ── UI ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Category Rules</h1>
          <p className="text-muted-foreground">
            Automate your bookkeeping — transactions matching a keyword get tagged automatically.
          </p>
        </div>
        <Button className="gap-2" onClick={openAdd} disabled={!user?.id}>
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rules.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center gap-3 py-14">
              <Tag className="h-10 w-10 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-sm font-medium">No rules yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a rule to auto-tag transactions — e.g. keyword "uber" → Travel.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={openAdd}
                className="border-primary/40 text-primary gap-1.5 mt-1">
                <Plus className="h-3.5 w-3.5" /> Create your first rule
              </Button>
            </CardContent>
          </Card>
        ) : (
          rules.map((rule) => (
            <Card
              key={rule.id}
              className={`border-border/50 transition-opacity ${rule.status ? "" : "opacity-50"}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Rule info — click to edit */}
                  <button
                    onClick={() => openEdit(rule)}
                    className="flex-1 text-left min-w-0 hover:opacity-70 transition-opacity"
                  >
                    <p className="text-sm font-semibold">
                      If memo contains{" "}
                      <code className="bg-secondary/50 px-1.5 py-0.5 rounded text-xs font-mono">
                        {rule.memo}
                      </code>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <Badge variant="outline" className="text-xs">
                        {getCategoryName(rule.category_id)}
                      </Badge>
                      {getSubCategoryName(rule.sub_category_id) && (
                        <Badge variant="secondary" className="text-xs">
                          {getSubCategoryName(rule.sub_category_id)}
                        </Badge>
                      )}
                    </div>
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle active/inactive — matches Flutter toggleRule */}
                    <Switch
                      checked={rule.status}
                      onCheckedChange={(val) =>
                        toggleMutation.mutate({ id: rule.id, status: val })
                      }
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setToDelete(rule)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Rule" : "Add Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="memo">Memo contains</Label>
              <Input
                id="memo"
                placeholder="e.g. uber, aws, starbucks"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Case-insensitive. If a transaction description contains this keyword, the rule applies.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={catId} onValueChange={(v) => { setCatId(v); setSubCatId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {catId && (
              <div className="space-y-2">
                <Label>
                  Sub-category{" "}
                  <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Select value={subCatId} onValueChange={setSubCatId}>
                  <SelectTrigger><SelectValue placeholder="Select sub-category…" /></SelectTrigger>
                  <SelectContent>
                    {filteredSubs.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                        No sub-categories for this category
                      </div>
                    ) : (
                      filteredSubs.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeForm} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!memo.trim() || !catId || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Update Rule" : "Save Rule"}
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
              The rule for keyword{" "}
              <strong>"{toDelete?.memo}"</strong> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
