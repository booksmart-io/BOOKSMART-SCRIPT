import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
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
        <Row label="Delete Account" onClick={soon} />
        <Row label="Logout"         onClick={signOut} destructive />
      </div>
    </div>
  );
}
