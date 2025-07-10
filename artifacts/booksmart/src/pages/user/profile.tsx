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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

type UserRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  img_url: string | null;
};

type OrgRow = {
  id: number;
  ein_tin: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
} | null;

export default function Profile() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const qc = useQueryClient();

  const { data: userRow, isLoading: userLoading } = useQuery<UserRow | null>({
    queryKey: ["profile_user", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, phone_number, img_url")
        .eq("id", numericId!)
        .single();
      if (error) {
        console.error("[profile] users lookup failed:", error.message, error.code);
        throw error;
      }
      return data as UserRow;
    },
  });

  const { data: orgRow, isLoading: orgLoading } = useQuery<OrgRow>({
    queryKey: ["profile_org", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, ein_tin, street, city, zip")
        .eq("owner_id", numericId!)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[profile] organizations lookup failed:", error.message, error.code);
        throw error;
      }
      return (data as OrgRow) ?? null;
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [einTin, setEinTin] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    if (userRow) {
      setFirstName(userRow.first_name ?? "");
      setLastName(userRow.last_name ?? "");
      setPhone(userRow.phone_number ?? "");
    }
  }, [userRow]);

  useEffect(() => {
    setEinTin(orgRow?.ein_tin ?? "");
    setStreet(orgRow?.street ?? "");
    setCity(orgRow?.city ?? "");
    setZip(orgRow?.zip ?? "");
  }, [orgRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (numericId === null) throw new Error("No user ID available");

      const { error: userError } = await supabase
        .from("users")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
        })
        .eq("id", numericId);
      if (userError) throw userError;

      // Only touch the org row if the user already has one (created during
      // onboarding). We don't create a brand-new org from this form since it
      // requires many more required fields than are shown here.
      if (orgRow?.id) {
        const { error: orgError } = await supabase
          .from("organizations")
          .update({
            ein_tin: einTin,
            street,
            city,
            zip,
          })
          .eq("id", orgRow.id);
        if (orgError) throw orgError;
      }
    },
    onSuccess: () => {
      toast.success("Profile updated successfully.");
      qc.invalidateQueries({ queryKey: ["profile_user", numericId] });
      qc.invalidateQueries({ queryKey: ["profile_org", numericId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });

  const isLoading = userLoading || orgLoading;
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Manage your personal and business details.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 border-border/50 h-fit">
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
              {userRow?.img_url && <AvatarImage src={userRow.img_url} />}
              <AvatarFallback className="text-4xl bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <p className="text-xs text-muted-foreground text-center">Photo upload isn't available yet.</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border/50">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>This information will be shared with your CPA.</CardDescription>
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
                <Skeleton className="h-24 w-full" />
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
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Business Tax ID (EIN)</Label>
                  <Input
                    id="taxId"
                    value={einTin}
                    onChange={(e) => setEinTin(e.target.value)}
                    disabled={!orgRow?.id}
                    placeholder={orgRow?.id ? "" : "Set up during onboarding"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Business Address</Label>
                  <Textarea
                    id="address"
                    value={[street, [city, zip].filter(Boolean).join(", ")].filter(Boolean).join("\n")}
                    onChange={(e) => {
                      const lines = e.target.value.split("\n");
                      setStreet(lines[0] ?? "");
                      const [c, z] = (lines[1] ?? "").split(",").map((s) => s.trim());
                      setCity(c ?? "");
                      setZip(z ?? "");
                    }}
                    disabled={!orgRow?.id}
                    placeholder={orgRow?.id ? "" : "Set up during onboarding"}
                  />
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
