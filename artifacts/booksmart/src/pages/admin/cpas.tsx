import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CPA = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  license_number: string | null;
  state_focuses: string[];
  specialties: string[];
  certifications: string[];
  created_at: string;
  verification_status: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminCpas() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const { data: cpas = [], isLoading } = useQuery<CPA[]>({
    queryKey: ["admin_cpas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,email,first_name,last_name,license_number,state_focuses,specialties,certifications,created_at,verification_status")
        .eq("role", "cpa")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { error } = await supabase
        .from("users")
        .update({ verification_status: status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ["admin_cpas"] });
      qc.invalidateQueries({ queryKey: ["admin_all_users"] });
      toast({ title: status === "approved" ? "CPA Approved" : "CPA Rejected", description: "Status updated successfully." });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const filtered = cpas.filter((c) => {
    const matchesSearch =
      !search ||
      `${c.first_name} ${c.last_name} ${c.email} ${c.license_number ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || c.verification_status === filter;
    return matchesSearch && matchesFilter;
  });

  const statusColor: Record<string, string> = {
    approved: "text-emerald-500 border-emerald-500/30",
    pending: "text-yellow-500 border-yellow-500/30",
    rejected: "text-destructive border-destructive/30",
  };

  const filterOptions: Array<{ label: string; value: typeof filter }> = [
    { label: "All", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CPA Directory</h1>
        <p className="text-muted-foreground">Review and verify CPA applications.</p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>CPA Verification</CardTitle>
          <CardDescription>Approve or reject CPAs to grant or revoke access to the platform network.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search CPAs…"
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {filterOptions.map((o) => (
                <Button
                  key={o.value}
                  size="sm"
                  variant={filter === o.value ? "default" : "outline"}
                  className="h-9 text-xs"
                  onClick={() => setFilter(o.value)}
                >
                  {o.label}
                  {o.value !== "all" && (
                    <span className="ml-1.5 rounded-full bg-secondary/60 px-1.5 text-[10px]">
                      {cpas.filter((c) => c.verification_status === o.value).length}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          <div className="border rounded-md border-border/50">
            <Table>
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead>CPA Name</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>States</TableHead>
                  <TableHead>Specialties</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <div className="flex flex-col items-center gap-2">
                        <ShieldCheck className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No CPAs match your filter.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((cpa) => (
                  <TableRow key={cpa.id}>
                    <TableCell>
                      <div className="font-medium">{`${cpa.first_name} ${cpa.last_name}`.trim() || "—"}</div>
                      <div className="text-xs text-muted-foreground">{cpa.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{cpa.license_number || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cpa.state_focuses ?? []).slice(0, 3).map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
                        ))}
                        {(cpa.state_focuses ?? []).length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{cpa.state_focuses.length - 3}</Badge>
                        )}
                        {!(cpa.state_focuses ?? []).length && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cpa.specialties ?? []).slice(0, 2).map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">{s}</Badge>
                        ))}
                        {(cpa.specialties ?? []).length > 2 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{cpa.specialties.length - 2}</Badge>
                        )}
                        {!(cpa.specialties ?? []).length && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(cpa.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor[cpa.verification_status] ?? ""}>
                        {cpa.verification_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {cpa.verification_status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm" variant="outline"
                            className="h-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30"
                            onClick={() => verifyMutation.mutate({ id: cpa.id, status: "approved" })}
                            disabled={verifyMutation.isPending}
                          >
                            {verifyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={() => verifyMutation.mutate({ id: cpa.id, status: "rejected" })}
                            disabled={verifyMutation.isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : cpa.verification_status === "rejected" ? (
                        <Button
                          size="sm" variant="outline"
                          className="h-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30"
                          onClick={() => verifyMutation.mutate({ id: cpa.id, status: "approved" })}
                          disabled={verifyMutation.isPending}
                        >
                          Re-approve
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled className="h-8">
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> Verified
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
