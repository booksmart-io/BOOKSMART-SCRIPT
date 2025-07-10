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
import { Plus, Edit, Trash2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Category = { id: number; name: string; added_by: number | null; created_at: string; is_deleted: boolean };
type SubCategory = { id: number; category_id: number; name: string; is_deleted: boolean };

export default function AdminCategories() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // expanded state for parent rows
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // category form
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");

  // sub-category form
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubCategory | null>(null);
  const [subName, setSubName] = useState("");
  const [subParentId, setSubParentId] = useState<string>("");

  // delete
  const [toDeleteCat, setToDeleteCat] = useState<Category | null>(null);
  const [toDeleteSub, setToDeleteSub] = useState<SubCategory | null>(null);

  const { data: categories = [], isLoading: loadingCats } = useQuery<Category[]>({
    queryKey: ["admin_category"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category").select("*").eq("is_deleted", false).order("id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories = [], isLoading: loadingSubs } = useQuery<SubCategory[]>({
    queryKey: ["admin_sub_category"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sub_category").select("*").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin_category"] });
    qc.invalidateQueries({ queryKey: ["admin_sub_category"] });
    qc.invalidateQueries({ queryKey: ["category"] });
    qc.invalidateQueries({ queryKey: ["sub_category"] });
  };

  // --- Category mutations ---
  const saveCat = useMutation({
    mutationFn: async ({ id, name }: { id?: number; name: string }) => {
      if (id) {
        const { error } = await supabase.from("category").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("category").insert({ name, is_deleted: false });
        if (error) throw error;
      }
    },
    onSuccess: (_, { id }) => { invalidate(); toast({ title: id ? "Category updated" : "Category added" }); closeCatForm(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCat = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("category").update({ is_deleted: true, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Category removed" }); setToDeleteCat(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // --- Sub-category mutations ---
  const saveSub = useMutation({
    mutationFn: async ({ id, name, category_id }: { id?: number; name: string; category_id: number }) => {
      if (id) {
        const { error } = await supabase.from("sub_category").update({ name, category_id, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sub_category").insert({ name, category_id, is_deleted: false });
        if (error) throw error;
      }
    },
    onSuccess: (_, { id }) => { invalidate(); toast({ title: id ? "Sub-category updated" : "Sub-category added" }); closeSubForm(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSub = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("sub_category").update({ is_deleted: true, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sub-category removed" }); setToDeleteSub(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAddCat() { setEditingCat(null); setCatName(""); setCatFormOpen(true); }
  function openEditCat(cat: Category) { setEditingCat(cat); setCatName(cat.name); setCatFormOpen(true); }
  function closeCatForm() { setCatFormOpen(false); setEditingCat(null); setCatName(""); }

  function openAddSub(parentId?: number) {
    setEditingSub(null); setSubName(""); setSubParentId(parentId ? String(parentId) : ""); setSubFormOpen(true);
  }
  function openEditSub(sub: SubCategory) {
    setEditingSub(sub); setSubName(sub.name); setSubParentId(String(sub.category_id)); setSubFormOpen(true);
  }
  function closeSubForm() { setSubFormOpen(false); setEditingSub(null); setSubName(""); setSubParentId(""); }

  function toggleExpand(id: number) {
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  const isLoading = loadingCats || loadingSubs;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Manage parent categories and sub-categories available to all users.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => openAddSub()}>
            <Plus className="h-4 w-4" /> Add Sub-category
          </Button>
          <Button className="gap-2" onClick={openAddCat}>
            <Plus className="h-4 w-4" /> Add Category
          </Button>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Categories & Sub-categories</CardTitle>
          <CardDescription>
            Click a row to expand its sub-categories. Users reference these when creating auto-categorization rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md border-border/50">
            <Table>
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Sub-categories</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No categories found.</TableCell>
                  </TableRow>
                ) : categories.map((cat) => {
                  const subs = subCategories.filter((s) => s.category_id === cat.id);
                  const isOpen = expanded.has(cat.id);
                  return [
                    <TableRow key={`cat-${cat.id}`} className="cursor-pointer hover:bg-secondary/10" onClick={() => toggleExpand(cat.id)}>
                      <TableCell className="text-muted-foreground">
                        {isOpen
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-semibold">{cat.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{subs.length} sub-categories</Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditCat(cat)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setToDeleteCat(cat)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>,
                    ...(isOpen ? [
                      ...subs.map((sub) => (
                        <TableRow key={`sub-${sub.id}`} className="bg-secondary/5">
                          <TableCell></TableCell>
                          <TableCell className="pl-8 text-sm text-muted-foreground">↳ {sub.name}</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEditSub(sub)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setToDeleteSub(sub)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )),
                      <TableRow key={`add-sub-${cat.id}`} className="bg-secondary/5">
                        <TableCell colSpan={4} className="pl-8 py-2">
                          <Button variant="ghost" size="sm" className="h-7 text-primary gap-1.5 text-xs" onClick={() => openAddSub(cat.id)}>
                            <Plus className="h-3 w-3" /> Add sub-category to {cat.name}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ] : [])
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Category add/edit */}
      <Dialog open={catFormOpen} onOpenChange={(o) => { if (!o) closeCatForm(); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader><DialogTitle>{editingCat ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input placeholder="e.g. Liability" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && catName.trim() && saveCat.mutate({ id: editingCat?.id, name: catName.trim() })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeCatForm} disabled={saveCat.isPending}>Cancel</Button>
            <Button onClick={() => saveCat.mutate({ id: editingCat?.id, name: catName.trim() })} disabled={!catName.trim() || saveCat.isPending}>
              {saveCat.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCat ? "Save Changes" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-category add/edit */}
      <Dialog open={subFormOpen} onOpenChange={(o) => { if (!o) closeSubForm(); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader><DialogTitle>{editingSub ? "Edit Sub-category" : "Add Sub-category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Parent Category</Label>
              <Select value={subParentId} onValueChange={setSubParentId}>
                <SelectTrigger><SelectValue placeholder="Select parent…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-category Name</Label>
              <Input placeholder="e.g. Software/SaaS" value={subName} onChange={(e) => setSubName(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeSubForm} disabled={saveSub.isPending}>Cancel</Button>
            <Button onClick={() => saveSub.mutate({ id: editingSub?.id, name: subName.trim(), category_id: parseInt(subParentId) })} disabled={!subName.trim() || !subParentId || saveSub.isPending}>
              {saveSub.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingSub ? "Save Changes" : "Add Sub-category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete category */}
      <AlertDialog open={!!toDeleteCat} onOpenChange={(o) => { if (!o) setToDeleteCat(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete <strong>"{toDeleteCat?.name}"</strong> and all its sub-categories will lose their parent reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDeleteCat && deleteCat.mutate(toDeleteCat.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteCat.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete sub-category */}
      <AlertDialog open={!!toDeleteSub} onOpenChange={(o) => { if (!o) setToDeleteSub(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove sub-category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete <strong>"{toDeleteSub?.name}"</strong>. Category rules referencing it will lose their sub-category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDeleteSub && deleteSub.mutate(toDeleteSub.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteSub.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
