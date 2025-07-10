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
      className="w-full flex items-center justify-between px-0 py-3.5 hover:opacity-70 transition-opacity"
    >
      <span className={`text-sm ${destructive ? "text-rose-500" : "text-foreground"}`}>
        {label}
      </span>
      <ChevronRight className={`h-4 w-4 ${destructive ? "text-rose-500" : "text-muted-foreground"}`} />
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function Settings() {
  const { profile, signOut } = useAuth();
  const [, navigate] = useLocation();

  const firstName = (profile as { first_name?: string })?.first_name ?? "";
  const lastName  = (profile as { last_name?: string  })?.last_name  ?? "";
  const imgUrl    = (profile as { img_url?: string | null })?.img_url;
  const email     = profile?.email ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "User";
  const initials  = (firstName[0] ?? "") + (lastName[0] ?? "") || fullName.slice(0, 2).toUpperCase();

  const [autoReview, setAutoReview] = useState(true);
  const [proTips,    setProTips]    = useState(true);
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
        onClick={() => navigate("/user/profile")}
        className="w-full flex items-center gap-4 py-4 hover:opacity-70 transition-opacity text-left"
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={fullName}
            className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-primary/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary font-bold text-lg shrink-0 uppercase">
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
        <Row label="Notifications" onClick={soon} />
        <ToggleRow label="Auto Review Results" checked={autoReview} onCheckedChange={setAutoReview} />
        <ToggleRow label="Pro Tips"            checked={proTips}    onCheckedChange={setProTips} />
        <ToggleRow label="Dark Mode"           checked={isDarkMode} onCheckedChange={toggleDark} />
        <Row label="Category Rules"       onClick={() => navigate("/user/rules-management")} />
        <Row label="Documents Repository" onClick={() => navigate("/user/reports")} />
        <Row label="Sponsored Offers"     onClick={soon} />
        <Row label="Organizations"        onClick={() => navigate("/user/organizations")} />
        <Row label="Banks"                onClick={soon} />
        <Row label="Cards"                onClick={soon} />
        <Row label="Subscription"         onClick={() => navigate("/user/subscription")} />
        <Row label="Purchase Tokens"      onClick={() => navigate("/user/token")} />
        <Row label="Delete Account"       onClick={soon} />
        <Row label="Logout"               onClick={signOut} destructive />
      </div>
    </div>
  );
}
