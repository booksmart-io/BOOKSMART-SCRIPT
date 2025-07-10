import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

type CpaRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  img_url: string | null;
  license_number: string | null;
  specialties: string[] | null;
  professional_bio: string | null;
  verification_status: string | null;
};

const statusBadge: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20",
  rejected: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20",
};

const statusLabel: Record<string, string> = {
  approved: "Verified Professional",
  pending: "Pending Verification",
  rejected: "Verification Rejected",
};

export default function CpaProfile() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const qc = useQueryClient();

  const { data: cpaRow, isLoading } = useQuery<CpaRow | null>({
    queryKey: ["cpa_profile", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, phone_number, img_url, license_number, specialties, professional_bio, verification_status")
        .eq("id", numericId!)
        .single();
      if (error) {
        console.error("[cpa-profile] users lookup failed:", error.message, error.code);
        throw error;
      }
      return data as CpaRow;
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (cpaRow) {
      setFirstName(cpaRow.first_name ?? "");
      setLastName(cpaRow.last_name ?? "");
      setLicenseNumber(cpaRow.license_number ?? "");
      setSpecialties((cpaRow.specialties ?? []).join(", "));
      setBio(cpaRow.professional_bio ?? "");
    }
  }, [cpaRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (numericId === null) throw new Error("No user ID available");
      const specialtiesArray = specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("users")
        .update({
          first_name: firstName,
          last_name: lastName,
          license_number: licenseNumber,
          specialties: specialtiesArray,
          professional_bio: bio,
        })
        .eq("id", numericId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("CPA Profile updated successfully.");
      qc.invalidateQueries({ queryKey: ["cpa_profile", numericId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });

  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
  const status = cpaRow?.verification_status ?? "pending";

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CPA Profile</h1>
          <p className="text-muted-foreground">Manage your public profile and firm details.</p>
        </div>
        <Badge className={statusBadge[status] ?? ""}>{statusLabel[status] ?? status}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 border-border/50 h-fit">
          <CardHeader>
            <CardTitle>Profile Photo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
              {cpaRow?.img_url && <AvatarImage src={cpaRow.img_url} />}
              <AvatarFallback className="text-4xl bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <p className="text-xs text-muted-foreground text-center">Photo upload isn't available yet.</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border/50">
          <CardHeader>
            <CardTitle>Professional Details</CardTitle>
            <CardDescription>This information is visible to potential clients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license">License Number</Label>
                  <Input id="license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialties">Specialties (comma separated)</Label>
                  <Input id="specialties" value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Professional Bio</Label>
                  <Textarea id="bio" className="min-h-[120px]" value={bio} onChange={(e) => setBio(e.target.value)} />
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="bg-secondary/5 border-t border-border/20 pt-4">
            <Button onClick={() => saveMutation.mutate()} disabled={isLoading || saveMutation.isPending} className="ml-auto">
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
