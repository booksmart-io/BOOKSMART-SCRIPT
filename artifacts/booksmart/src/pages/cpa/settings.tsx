import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

function Row({
  label,
  onClick,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-3.5 hover:opacity-70 transition-opacity text-left"
    >
      <span className={`text-sm ${destructive ? "text-rose-500" : "text-foreground"}`}>
        {label}
      </span>
      <ChevronRight className={`h-4 w-4 ${destructive ? "text-rose-500" : "text-muted-foreground"}`} />
    </button>
  );
}

export default function CpaSettings() {
  const { profile, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");

  const firstName = (profile as { first_name?: string })?.first_name ?? "";
  const lastName  = (profile as { last_name?: string  })?.last_name  ?? "";
  const imgUrl    = (profile as { img_url?: string | null })?.img_url;
  const email     = profile?.email ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "CPA User";
  const initials  = (firstName[0] ?? "") + (lastName[0] ?? "") || fullName.slice(0, 2).toUpperCase();

  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  function toggleDark(val: boolean) {
    setIsDarkMode(val);
    document.documentElement.classList.toggle("dark", val);
    localStorage.setItem("theme", val ? "dark" : "light");
  }

  function soon() { toast.info("Coming soon"); }
  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Please sign in again to delete your account.");
      const response = await fetch("/api/account", { method: "DELETE", headers: {
        Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json",
      }, body: JSON.stringify({ email: deleteEmail, confirmation: deletePhrase }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        if (result.error === "recent_authentication_required") throw new Error("For security, sign out and sign in again before deleting your account.");
        if (["confirmation_mismatch", "confirmation_required"].includes(result.error ?? "")) throw new Error("Enter your account email and DELETE exactly as shown.");
        if (["account_cleanup_incomplete", "identity_cleanup_incomplete"].includes(result.error ?? "")) throw new Error("Deletion started but could not finish. Your account has been locked. Please contact support.");
        throw new Error("We couldn't delete the account. Please try again.");
      }
    },
    onSuccess: async () => {
      await supabase.auth.signOut({ scope: "local" });
      window.location.assign("/login?account=deleted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Account deletion failed."),
  });

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Profile ── */}
      <button
        onClick={() => navigate("/cpa/profile")}
        className="w-full flex items-center gap-4 py-4 hover:opacity-70 transition-opacity text-left"
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={fullName}
            className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-indigo-400/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 border-2 border-indigo-400/40 flex items-center justify-center text-indigo-400 font-bold text-lg shrink-0 uppercase">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold truncate">{fullName}</p>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
        </div>
      </button>

      <Separator className="bg-border/30" />

      {/* ── Settings list ── */}
      <div className="divide-y divide-border/30">
        <Row label="Services"       onClick={() => navigate("/cpa/orders")} />
        <Row label="Notifications"  onClick={soon} />

        {/* Dark Mode toggle */}
        <div className="flex items-center justify-between py-3.5">
          <span className="text-sm text-foreground">Dark Mode</span>
          <Switch checked={isDarkMode} onCheckedChange={toggleDark} />
        </div>

        <Row label="Stripe Account" onClick={soon} />
        <Row label="Delete Account" onClick={() => setDeleteOpen(true)} destructive />
        <Row label="Logout"         onClick={signOut} destructive />
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteAccount.isPending) { setDeleteOpen(open); if (!open) { setDeleteEmail(""); setDeletePhrase(""); } } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your CPA account permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your CPA profile, client engagements, financial-access permissions, stored files, and login. Client businesses and client financial records will remain with their owners. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <label className="block space-y-2 text-sm"><span>Enter your account email: <strong>{email}</strong></span>
              <input className="w-full rounded-md border border-border bg-background px-3 py-2" autoComplete="off" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} />
            </label>
            <label className="block space-y-2 text-sm"><span>Type <strong>DELETE</strong> to confirm</span>
              <input className="w-full rounded-md border border-border bg-background px-3 py-2" autoComplete="off" value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Keep account</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" disabled={deleteAccount.isPending || deleteEmail.trim().toLowerCase() !== email.trim().toLowerCase() || deletePhrase !== "DELETE"}
              onClick={(event) => { event.preventDefault(); deleteAccount.mutate(); }}>
              {deleteAccount.isPending && <Loader2 className="animate-spin" />} Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
