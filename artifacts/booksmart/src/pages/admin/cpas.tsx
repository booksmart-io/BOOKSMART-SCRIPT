import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, ShieldCheck, Eye, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CPA = {
  id: number;
  email: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  img_url: string | null;
  license_number: string | null;
  career_start_date: string | null;
  professional_bio: string | null;
  state_focuses: string[] | null;
  specialties: string[] | null;
  certifications: string[] | null;
  certification_proof_url: string | null;
  license_copy_url: string | null;
  terms_agreed: boolean | null;
  created_at: string;
  verification_status: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function normalizeStatus(status: string | null | undefined) {
  const value = (status ?? "pending").toLowerCase().trim().replace(/\s+/g, "_");
  if (value === "approved" || value === "verified") return "approved";
  if (value === "rejected" || value === "denied") return "rejected";
  return "pending";
}

function yearsFromCareerStart(value: string | null | undefined) {
  if (!value) return "Not provided";
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "Not provided";
  const years = Math.max(1, new Date().getFullYear() - start.getFullYear());
  return `${years} year${years === 1 ? "" : "s"}`;
}

function fullName(cpa: CPA) {
  return [cpa.first_name, cpa.middle_name, cpa.last_name].filter(Boolean).join(" ").trim() || "Unnamed CPA";
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border/50 bg-secondary/10 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value || <span className="text-muted-foreground">Not provided</span>}</div>
    </div>
  );
}

function DetailBadges({ items }: { items: string[] | null | undefined }) {
  if (!items?.length) return <span className="text-muted-foreground">Not provided</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="outline" className="text-xs">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function DocumentLink({ href }: { href: string | null | undefined }) {
  if (!href) return <span className="text-muted-foreground">Not uploaded</span>;
  return (
    <a className="inline-flex items-center gap-1 text-primary hover:underline" href={href} target="_blank" rel="noreferrer">
      View document <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export default function AdminCpas() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selectedCpa, setSelectedCpa] = useState<CPA | null>(null);

  const { data: cpas = [], isLoading } = useQuery<CPA[]>({
    queryKey: ["admin_cpas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,email,first_name,middle_name,last_name,phone_number,img_url,license_number,career_start_date,professional_bio,state_focuses,specialties,certifications,certification_proof_url,license_copy_url,terms_agreed,created_at,verification_status")
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
      if (selectedCpa) {
        setSelectedCpa({ ...selectedCpa, verification_status: status });
      }
      toast({ title: status === "approved" ? "CPA Approved" : "CPA Rejected", description: "Status updated successfully." });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const filtered = cpas.filter((c) => {
    const matchesSearch =
      !search ||
      `${fullName(c)} ${c.email} ${c.license_number ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || normalizeStatus(c.verification_status) === filter;
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
                placeholder="Search CPAs..."
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
                      {cpas.filter((c) => normalizeStatus(c.verification_status) === o.value).length}
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
                      <div className="font-medium">{fullName(cpa)}</div>
                      <div className="text-xs text-muted-foreground">{cpa.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{cpa.license_number || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cpa.state_focuses ?? []).slice(0, 3).map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
                        ))}
                        {(cpa.state_focuses ?? []).length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{(cpa.state_focuses ?? []).length - 3}</Badge>
                        )}
                        {!(cpa.state_focuses ?? []).length && <span className="text-muted-foreground text-xs">-</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cpa.specialties ?? []).slice(0, 2).map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">{s}</Badge>
                        ))}
                        {(cpa.specialties ?? []).length > 2 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{(cpa.specialties ?? []).length - 2}</Badge>
                        )}
                        {!(cpa.specialties ?? []).length && <span className="text-muted-foreground text-xs">-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(cpa.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor[normalizeStatus(cpa.verification_status)] ?? ""}>
                        {normalizeStatus(cpa.verification_status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setSelectedCpa(cpa)}>
                          <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                        </Button>
                        {normalizeStatus(cpa.verification_status) === "pending" ? (
                          <>
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
                          </>
                        ) : normalizeStatus(cpa.verification_status) === "rejected" ? (
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedCpa} onOpenChange={(open) => !open && setSelectedCpa(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-card border-border/60">
          {selectedCpa && (
            <>
              <DialogHeader>
                <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <DialogTitle className="text-2xl">{fullName(selectedCpa)}</DialogTitle>
                    <DialogDescription>{selectedCpa.email}</DialogDescription>
                  </div>
                  <Badge variant="outline" className={statusColor[normalizeStatus(selectedCpa.verification_status)] ?? ""}>
                    {normalizeStatus(selectedCpa.verification_status)}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal Information</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <DetailItem label="First Name" value={selectedCpa.first_name} />
                    <DetailItem label="Middle Name" value={selectedCpa.middle_name} />
                    <DetailItem label="Last Name" value={selectedCpa.last_name} />
                    <DetailItem label="Email" value={selectedCpa.email} />
                    <DetailItem label="Phone Number" value={selectedCpa.phone_number} />
                    <DetailItem label="Applied" value={formatDate(selectedCpa.created_at)} />
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Professional Details</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailItem label="Certifications" value={<DetailBadges items={selectedCpa.certifications} />} />
                    <DetailItem label="License Number" value={selectedCpa.license_number} />
                    <DetailItem label="Years of Experience" value={yearsFromCareerStart(selectedCpa.career_start_date)} />
                    <DetailItem label="State Focuses" value={<DetailBadges items={selectedCpa.state_focuses} />} />
                    <DetailItem label="Specialties" value={<DetailBadges items={selectedCpa.specialties} />} />
                    <DetailItem label="Terms Agreement" value={selectedCpa.terms_agreed ? "Agreed" : "Not agreed"} />
                    <div className="md:col-span-2">
                      <DetailItem label="Professional Bio" value={selectedCpa.professional_bio} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Verification Documents</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailItem label="Certification Proof" value={<DocumentLink href={selectedCpa.certification_proof_url} />} />
                    <DetailItem label="License Copy" value={<DocumentLink href={selectedCpa.license_copy_url} />} />
                  </div>
                </section>

                {normalizeStatus(selectedCpa.verification_status) !== "approved" && (
                  <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => verifyMutation.mutate({ id: selectedCpa.id, status: "rejected" })}
                      disabled={verifyMutation.isPending || normalizeStatus(selectedCpa.verification_status) === "rejected"}
                    >
                      Reject
                    </Button>
                    <Button
                      onClick={() => verifyMutation.mutate({ id: selectedCpa.id, status: "approved" })}
                      disabled={verifyMutation.isPending}
                    >
                      {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve CPA"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
