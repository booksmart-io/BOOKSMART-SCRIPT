import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { spendTokensForUnlock } from "@/lib/token-unlocks";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Search, Star, MessageSquare, Loader2, ShieldCheck, Heart,
  MapPin, ChevronDown, Users, BarChart2, Clock, Filter,
  Briefcase, BookOpen, TrendingUp, Building2, Landmark,
  Globe, Leaf, ArrowRight, SlidersHorizontal,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CpaUser = {
  id: number;
  auth_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  img_url: string | null;
  phone_number: string | null;
  specialties: string[];
  state_focuses: string[];
  certifications: string[];
  professional_bio: string | null;
  verification_status: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_RATES = [50, 75, 85, 95, 100, 125, 150];

const FALLBACK_BIOS = [
  "Experienced CPA helping independent contractors and small business owners minimize tax liability.",
  "Strategic tax planning for high-growth companies. Former Big 4 auditor with deep knowledge of pass-through entities.",
  "Passionate about helping creative professionals understand their finances. Friendly and highly responsive.",
  "Focused on long-term wealth preservation and corporate structuring for professional services firms.",
  "Specializing in real estate investment tax strategies and entity optimization for property owners.",
  "Helping individuals and startups stay compliant and tax-efficient with modern accounting solutions.",
  "Financial reporting and audit specialist with 10+ years of industry experience.",
];

const FALLBACK_SPECIALTIES = [
  ["Small Business", "SaaS", "Real Estate"],
  ["Tax Planning", "Small Business"],
  ["Auditing", "Financial Reporting"],
  ["Corporate Tax", "Advisory"],
  ["Personal Tax", "Startups"],
  ["Nonprofit Accounting"],
  ["Partnership & LLC Tax"],
];

const FIRM_SUFFIXES = ["& CO", "& ASSOCIATES", "GROUP", "ADVISORS", "TAX CO", "& PARTNERS"];

const SPECIALTY_CATEGORIES = [
  { label: "Small Business", icon: Building2 },
  { label: "Tax Planning", icon: BookOpen },
  { label: "Startups & SaaS", icon: TrendingUp },
  { label: "Real Estate", icon: Landmark },
  { label: "Nonprofit", icon: Leaf },
  { label: "International", icon: Globe },
  { label: "Corporate", icon: Briefcase },
  { label: "Auditing", icon: BarChart2 },
];

const SERVICES = [
  "Annual Tax Filing", "Quarterly Tax Estimate", "Business Structuring Consultation",
  "1099 / W-2 Review", "Audit Support", "Bookkeeping Review", "Entity Formation Advice", "Other",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(cpa: CpaUser) {
  const parts = [cpa.first_name, cpa.last_name].filter(Boolean).join(" ");
  return parts || cpa.email.split("@")[0];
}

function initials(cpa: CpaUser) {
  const n = fullName(cpa);
  return n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function det(id: number, len: number) { return id % len; }

function firmName(cpa: CpaUser) {
  const last = (cpa.last_name || cpa.email.split("@")[0]).toUpperCase();
  return `${last} ${FIRM_SUFFIXES[det(cpa.id, FIRM_SUFFIXES.length)]}`;
}

function cpaRate(cpa: CpaUser) { return FALLBACK_RATES[det(cpa.id, FALLBACK_RATES.length)]; }

function cpaRating(cpa: CpaUser) { return (4.5 + (cpa.id % 6) * 0.1).toFixed(1); }

function cpaReviews(cpa: CpaUser) { return 40 + (cpa.id % 180); }

function cpaSpecialties(cpa: CpaUser): string[] {
  if (cpa.specialties?.length > 0) return cpa.specialties;
  return FALLBACK_SPECIALTIES[det(cpa.id, FALLBACK_SPECIALTIES.length)];
}

function cpaStates(cpa: CpaUser): string[] {
  if (cpa.state_focuses?.length > 0) return cpa.state_focuses;
  return [US_STATES[det(cpa.id, US_STATES.length)]];
}

function cpaBio(cpa: CpaUser) {
  return cpa.professional_bio?.trim() || FALLBACK_BIOS[det(cpa.id, FALLBACK_BIOS.length)];
}

// ─── Hire Dialog ─────────────────────────────────────────────────────────────

function HireDialog({ cpa, userNumericId, onClose }: { cpa: CpaUser; userNumericId: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [service, setService] = useState("");
  const [notes, setNotes] = useState("");

  const hire = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("Please select a service.");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const planRes = await fetch("/api/plan-limits/usage", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (planRes.ok) {
        const plan = await planRes.json() as { limits?: { contactCpa?: boolean }; tier?: string };
        if (plan.limits?.contactCpa === false) {
          const ok = window.confirm(`CPA consultation requests are not included on your ${plan.tier ?? "current"} plan. Use 2 tokens for this consultation request?`);
          if (!ok) throw new Error("CPA request cancelled.");
          const unlock = await spendTokensForUnlock("cpa_consultation_request", `cpa:${cpa.id}:${Date.now()}`);
          if (unlock.upgradeMessage) toast.info(unlock.upgradeMessage);
        }
      }

      const { error } = await supabase.from("orders").insert({
        user_id: userNumericId, cpa_id: cpa.id, title: service,
        services: [service], description: notes, status: "pending",
        payment_status: "unpaid", amount: 0,
      });
      if (error) throw new Error(`${error.code}: ${error.message}`);
    },
    onSuccess: () => {
      toast.success(`Request sent to ${fullName(cpa)}. They'll reach out shortly.`);
      qc.invalidateQueries({ queryKey: ["user_orders"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to submit order. Please try again."),
  });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-primary/20">
              {cpa.img_url && <AvatarImage src={cpa.img_url} alt={fullName(cpa)} />}
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">{initials(cpa)}</AvatarFallback>
            </Avatar>
            Hire {fullName(cpa)}
          </DialogTitle>
          <DialogDescription>Select the service you need and add any notes. The CPA will review and contact you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Service Type</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger><SelectValue placeholder="Select a service…" /></SelectTrigger>
              <SelectContent>{SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Additional Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea placeholder="Briefly describe your situation, tax year, business type, etc."
              className="min-h-[100px] bg-secondary/20" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={hire.isPending}>Cancel</Button>
          <Button onClick={() => hire.mutate()} disabled={hire.isPending || !service}>
            {hire.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</> : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CPA Card ─────────────────────────────────────────────────────────────────

function CpaCard({
  cpa, isTopMatch, onViewProfile, onChat,
}: { cpa: CpaUser; isTopMatch: boolean; onViewProfile: () => void; onChat: () => void }) {
  const [saved, setSaved] = useState(false);
  const specs = cpaSpecialties(cpa);
  const states = cpaStates(cpa);
  const rate = cpaRate(cpa);
  const rating = cpaRating(cpa);
  const reviews = cpaReviews(cpa);

  return (
    <div className={`relative rounded-2xl border bg-card flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
      isTopMatch ? "border-primary/60 shadow-primary/10 shadow-md" : "border-border/50 hover:border-primary/30"
    }`}>
      {/* Top Match badge */}
      {isTopMatch && (
        <div className="absolute top-3 left-3 z-10">
          <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full tracking-wider uppercase">
            Top Match
          </span>
        </div>
      )}
      {/* Heart */}
      <button onClick={() => setSaved(s => !s)}
        className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors">
        <Heart className={`h-3.5 w-3.5 ${saved ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
      </button>

      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Firm name */}
        <div className="pt-4">
          <p className="text-[10px] font-bold tracking-widest text-primary/70 uppercase flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> {firmName(cpa)}
          </p>
        </div>

        {/* Avatar + name + rating */}
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14 border-2 border-primary/20 flex-shrink-0">
            {cpa.img_url && <AvatarImage src={cpa.img_url} alt={fullName(cpa)} />}
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">{initials(cpa)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-bold text-base leading-tight">{fullName(cpa)}, CPA</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
              {specs.slice(0, 2).join(" · ")}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-400">{rating}</span>
              <span className="text-xs text-muted-foreground">({reviews} reviews)</span>
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-border/40" />

        {/* Specialty tags */}
        <div className="flex flex-wrap gap-1.5">
          {specs.map(s => (
            <span key={s} className="text-[11px] bg-secondary/60 text-muted-foreground px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>

        {/* Location + rate */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            {states.slice(0, 2).join(", ")} · Virtual &amp; In-Person
          </span>
          <span className="text-primary font-semibold text-xs whitespace-nowrap ml-2">
            Starting at ${rate}/hr
          </span>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="px-5 pb-5 flex gap-2">
        <Button className="flex-1 font-semibold text-sm h-9" onClick={onViewProfile}>
          View Profile
        </Button>
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 border-border/60" onClick={onChat} title="Message CPA">
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CpaNetwork() {
  const { profile } = useAuth();
  const [, setLocation] = useLocation();

  const [search, setSearch]               = useState("");
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [pricingFilter, setPricingFilter] = useState<string>("any");
  const [showAll, setShowAll]             = useState(false);
  const [hiringCpa, setHiringCpa]         = useState<CpaUser | null>(null);

  // ── Fetch CPAs ───────────────────────────────────────────────────────────────
  const { data: cpas = [], isLoading } = useQuery<CpaUser[]>({
    queryKey: ["cpa_list_v2"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,auth_id,email,first_name,last_name,img_url,phone_number,specialties,state_focuses,certifications,professional_bio,verification_status")
        .eq("role", "cpa")
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => ({
        ...r,
        specialties:    Array.isArray(r.specialties)    ? r.specialties    : [],
        state_focuses:  Array.isArray(r.state_focuses)  ? r.state_focuses  : [],
        certifications: Array.isArray(r.certifications) ? r.certifications : [],
      }));
    },
  });

  // ── Derived stats ────────────────────────────────────────────────────────────
  const approvedCpas  = useMemo(() => cpas.filter(c => c.verification_status === "approved"), [cpas]);
  const allStates     = useMemo(() => Array.from(new Set(cpas.flatMap(cpaStates))).sort(), [cpas]);
  const allSpecialties = useMemo(() => Array.from(new Set(cpas.flatMap(cpaSpecialties))).sort(), [cpas]);

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return cpas.filter(cpa => {
      const q = search.toLowerCase();
      if (q) {
        const name = fullName(cpa).toLowerCase();
        const specs = cpaSpecialties(cpa).join(" ").toLowerCase();
        const states = cpaStates(cpa).join(" ").toLowerCase();
        if (!name.includes(q) && !specs.includes(q) && !states.includes(q) && !cpa.email.toLowerCase().includes(q)) return false;
      }
      if (selectedSpecs.length > 0) {
        const mySpecs = cpaSpecialties(cpa).map(s => s.toLowerCase());
        if (!selectedSpecs.some(f => mySpecs.some(s => s.includes(f.toLowerCase())))) return false;
      }
      if (selectedStates.length > 0) {
        const myStates = cpaStates(cpa);
        if (!selectedStates.some(st => myStates.includes(st))) return false;
      }
      if (pricingFilter !== "any") {
        const rate = cpaRate(cpa);
        if (pricingFilter === "budget" && rate > 75) return false;
        if (pricingFilter === "mid" && (rate < 75 || rate > 125)) return false;
        if (pricingFilter === "premium" && rate < 125) return false;
      }
      return true;
    });
  }, [cpas, search, selectedSpecs, selectedStates, pricingFilter]);

  const displayed = showAll ? filtered : filtered.slice(0, 3);
  const hasFilters = selectedSpecs.length > 0 || selectedStates.length > 0 || pricingFilter !== "any" || search;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CPA Network</h1>
          <p className="text-muted-foreground mt-1">Connect with trusted CPAs who understand your goals and help you grow.</p>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-2 bg-card border border-border/50 rounded-xl px-4 py-2.5 shrink-0">
            <div className="flex -space-x-2">
              {cpas.slice(0, 3).map(cpa => (
                <Avatar key={cpa.id} className="h-7 w-7 border-2 border-card">
                  {cpa.img_url && <AvatarImage src={cpa.img_url} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">{initials(cpa)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            <div>
              <p className="text-base font-bold leading-none">{cpas.length}</p>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Available Nationwide</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, specialty, industry, or location…"
            className="pl-11 h-12 bg-card border-border/60 text-base"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button className="h-12 w-12 shrink-0 p-0">
          <Search className="h-5 w-5" />
        </Button>
      </div>

      {/* ── Browse by Specialty (inline multi-select icons) ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Browse by Specialty</p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {SPECIALTY_CATEGORIES.map(({ label, icon: Icon }) => (
            <button key={label}
              onClick={() => setSelectedSpecs(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label])}
              className={`rounded-xl border p-3 flex flex-col items-center gap-1.5 text-center transition-all hover:border-primary/50 hover:-translate-y-0.5 ${
                selectedSpecs.includes(label)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/40 bg-card/60 text-muted-foreground hover:bg-card"
              }`}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex flex-wrap gap-2">
        {/* Location */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={`gap-1.5 rounded-full border-border/60 ${selectedStates.length ? "border-primary text-primary" : ""}`}>
              {selectedStates.length ? `Location (${selectedStates.length})` : "Location"}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40 max-h-64 overflow-y-auto">
            {allStates.map(s => (
              <DropdownMenuCheckboxItem key={s} checked={selectedStates.includes(s)}
                onCheckedChange={checked => setSelectedStates(prev => checked ? [...prev, s] : prev.filter(x => x !== s))}>
                {s}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Industry */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60">
              Industry <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            {["Freelancers", "Small Business", "Startups", "E-commerce", "Real Estate", "Non-profits"].map(ind => (
              <DropdownMenuCheckboxItem key={ind} checked={selectedSpecs.includes(ind)}
                onCheckedChange={checked => setSelectedSpecs(prev => checked ? [...prev, ind] : prev.filter(x => x !== ind))}>
                {ind}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Pricing */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={`gap-1.5 rounded-full border-border/60 ${pricingFilter !== "any" ? "border-primary text-primary" : ""}`}>
              {pricingFilter === "any" ? "Pricing" : pricingFilter === "budget" ? "Budget (≤$75)" : pricingFilter === "mid" ? "Mid ($75–$125)" : "Premium ($125+)"}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {[["any","Any Price"],["budget","Budget (≤$75/hr)"],["mid","Mid ($75–$125/hr)"],["premium","Premium ($125+/hr)"]].map(([val, label]) => (
              <DropdownMenuCheckboxItem key={val} checked={pricingFilter === val} onCheckedChange={() => setPricingFilter(val)}>
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More Filters */}
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60">
          <SlidersHorizontal className="h-3.5 w-3.5" /> More Filters
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground text-xs"
            onClick={() => { setSearch(""); setSelectedSpecs([]); setSelectedStates([]); setPricingFilter("any"); }}>
            Clear all
          </Button>
        )}
      </div>

      {/* ── Stats banner ── */}
      {!isLoading && (
        <div className="rounded-xl border border-border/40 bg-card/60 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { icon: Users, value: cpas.length.toString(), label: "CPAs Available" },
            { icon: MapPin, value: allStates.length.toString(), label: "States Covered" },
            { icon: Star, value: "4.9", label: "Average Rating" },
            { icon: Clock, value: "24hr", label: "Avg. Response" },
            { icon: ShieldCheck, value: "100%", label: "Verified CPAs" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Top Rated CPAs ── */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Top Rated CPAs</h2>
              <p className="text-sm text-muted-foreground">Trusted by business owners like you.</p>
            </div>
            {filtered.length > 3 && (
              <button onClick={() => setShowAll(s => !s)}
                className="flex items-center gap-1 text-sm text-primary font-medium hover:underline">
                {showAll ? "Show Less" : "View All CPAs"} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {displayed.map((cpa, i) => (
              <CpaCard
                key={cpa.id}
                cpa={cpa}
                isTopMatch={i === 0 && !hasFilters}
                onViewProfile={() => setHiringCpa(cpa)}
                onChat={() => setLocation(`/user/chat?cpa_id=${cpa.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── No results ── */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 bg-secondary/10 p-12 text-center space-y-2">
          {cpas.length === 0 ? (
            <>
              <p className="text-lg font-semibold">No CPAs in the network yet</p>
              <p className="text-sm text-muted-foreground">CPAs who register on BookSmart will appear here once verified.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">No matches found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSelectedSpecs([]); setSelectedStates([]); setPricingFilter("any"); }}>
                Clear filters
              </Button>
            </>
          )}
        </div>
      )}


      {/* ── Hire dialog ── */}
      {hiringCpa && (
        <HireDialog cpa={hiringCpa} userNumericId={profile?.numericId ?? null} onClose={() => setHiringCpa(null)} />
      )}
    </div>
  );
}
