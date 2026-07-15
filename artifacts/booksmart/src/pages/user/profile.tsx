import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { Camera } from "lucide-react";

type UserRow = {
  id: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  img_url: string | null;
};

type OrgRow = {
  id: number;
};

export default function Profile() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [activeOrgId] = useActiveOrganizationId(numericId);

  const { data: userRow, isLoading: userLoading } = useQuery<UserRow | null>({
    queryKey: ["profile_user", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, middle_name, last_name, phone_number, img_url")
        .eq("id", numericId!)
        .single();
      if (error) {
        console.error("[profile] users lookup failed:", error.message, error.code);
        throw error;
      }
      return data as UserRow;
    },
  });

  const { data: orgRow, isLoading: orgLoading } = useQuery<OrgRow | null>({
    queryKey: ["profile_org", numericId, activeOrgId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("owner_id", numericId!)
        .order("id", { ascending: true });
      if (error) {
        console.error("[profile] organizations lookup failed:", error.message, error.code);
        throw error;
      }
      return pickActiveOrganization(data as OrgRow[] | null, activeOrgId);
    },
  });

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (userRow) {
      setFirstName(userRow.first_name ?? "");
      setMiddleName(userRow.middle_name ?? "");
      setLastName(userRow.last_name ?? "");
      setPhone(userRow.phone_number ?? "");
    }
  }, [userRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (numericId === null) throw new Error("No user ID available");
      if (!firstName.trim()) throw new Error("First name is required");
      if (!lastName.trim()) throw new Error("Last name is required");

      const { error: userError } = await supabase
        .from("users")
        .update({
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          last_name: lastName.trim(),
          phone_number: phone.trim(),
        })
        .eq("id", numericId);
      if (userError) throw userError;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully.");
      qc.invalidateQueries({ queryKey: ["profile_user", numericId] });
      qc.invalidateQueries({ queryKey: ["profile_org", numericId] });
      if (!orgRow?.id) {
        setLocation("/user");
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });

  const isLoading = userLoading || orgLoading;
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto flex w-full max-w-[500px] flex-col items-center px-4 pt-6">
        <h1 className="mb-12 text-center text-2xl font-bold tracking-tight">Set Up Your Profile</h1>

        <div className="relative mb-8">
          <Avatar className="h-28 w-28 bg-white text-muted-foreground">
            {userRow?.img_url && <AvatarImage src={userRow.img_url} />}
            <AvatarFallback className="bg-white text-muted-foreground">
              {initials === "?" ? <Camera className="h-8 w-8 text-muted-foreground/70" /> : <span className="text-3xl font-bold text-primary">{initials}</span>}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            className="absolute bottom-1 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            aria-label="Profile photo upload is not available yet"
            onClick={() => toast.info("Photo upload is not available yet.")}
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="w-full space-y-6">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : (
          <form
            className="w-full space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="firstName" className="sr-only">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name *"
                className="h-12 border-primary/80 bg-card text-base focus-visible:ring-primary"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName" className="sr-only">Middle Name</Label>
              <Input
                id="middleName"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Middle Name"
                className="h-12 bg-card text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="sr-only">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name *"
                className="h-12 bg-card text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="sr-only">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone Number"
                className="h-12 bg-card text-base"
              />
            </div>

            <Button type="submit" disabled={saveMutation.isPending} className="mt-10 h-12 w-full rounded-md text-base text-primary-foreground">
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
