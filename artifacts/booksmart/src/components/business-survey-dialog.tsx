import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, Gavel, MapPin, Globe2, Map, Wallet, Briefcase, TrendingUp, Users,
  Calculator, Wrench, Car, Route, Truck, Home, Building2, Laptop, Building,
  Handshake, HeartPulse, PiggyBank, GraduationCap, Target, Landmark, ShieldCheck,
  Ruler, Lightbulb, Utensils, DollarSign, CreditCard, Receipt, Trophy, Sparkles,
  Check, ChevronLeft, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import houseIcon from "@/assets/survey-icons/house.png";
import buildingIcon from "@/assets/survey-icons/building.png";
import carIcon from "@/assets/survey-icons/car.png";
import phoneIcon from "@/assets/survey-icons/phone.png";
import wifiIcon from "@/assets/survey-icons/wifi.png";
import lightbulbIcon from "@/assets/survey-icons/lightbulb.png";
import equipmentIcon from "@/assets/survey-icons/equipment.png";
import invoiceIcon from "@/assets/survey-icons/invoice.png";
import packageIcon from "@/assets/survey-icons/package.png";
import creditCardsIcon from "@/assets/survey-icons/creditcards.png";
import walletIcon from "@/assets/survey-icons/wallet.png";
import trophyIcon from "@/assets/survey-icons/trophy.png";

// ─── Options ─────────────────────────────────────────────────────────────────
const FILING_STATUS = ["Single","Married Filing Jointly","Married Filing Separately","Head of Household","Qualifying Surviving Spouse"];
const RESIDENCY_STATUS = ["US Citizen","Resident Alien","Non-Resident Alien","Dual-Status Alien"];
const INCOME_TYPES = ["W2 Employee","1099 Contractor (Freelance)","Single-Member LLC","Multi-Member LLC","S-Corp Owner","C-Corp Owner","Trust/Estate"];
const PASSIVE_INCOME = ["Dividend Income","Capital Gains (Stocks)","Cryptocurrency/Defi","Rental Income","Royalties","Oil/Gas Rights"];
const TEAM_STRUCTURE = ["Solo Operator","Hire 1099 Contractors","W2 Employees","Employ Spouse","Employ Children (under 18)","No Help"];
const ACCOUNTING_METHOD = ["Cash Basis (Standard)","Accrual Basis","Not Sure"];
const VEHICLE_OWNERSHIP = ["Own Personally","Lease Personally","Company Owned","Company Leased","No Business Vehicle"];
const VEHICLE_USAGE = ["Standard Mileage Rate","Actual Expenses (Gas, Repairs, Insurance)","Commuting Only (Non-Deductible)"];
const HOME_OFFICE_TYPE = ["No Home Office","Dedicated Room (Exclusive Use)","Shared Space (Non-Exclusive)","Short-term/Coworking Space"];
const HOME_STATUS = ["Own (Mortgage)","Own (Paid Off)","Rent","Live with Family"];
const TECH_USAGE = ["Personal Phone for Business","Home Internet for Business","Premium Software Subscriptions","Home Security (if home office)","High-End Hardware/Server"];
const REAL_ESTATE_INTERESTS = ["Primary Residence","Second Home/Vacation Home","Short-Term Rental (Airbnb/VRBO)","Long-Term Rental","Commercial Property","Raw Land"];
const HEALTH_INSURANCE = ["Employer Provided","Marketplace (ACA) Plan","High Deductible Plan (HDHP)","Medicare","Private/Self-Funded"];
const HEALTH_SAVINGS = ["HSA Contributor","FSA Participant","HRA (Health Reimbursement)","None"];
const FAMILY_EDUCATION = ["Paying Student Loans","Child in Daycare","K-12 Private Tuition","College Tuition (Form 1098-T)","Supporting Elderly Parents"];
const TAX_GOALS = ["Immediate Cash Flow (Pay less now)","Long-term Wealth (Retirement focus)","Audit Protection (Play it safe)","Business Growth (Reinvestment focus)"];
const RETIREMENT_CURRENT = ["No Plan","Maxing out 401k","Backdoor Roth IRA","Solo 401k/SEP IRA","Pension/Defined Benefit"];
const AUDIT_APPETITE = ["Conservative (Low Risk)","Moderate (Standard)","Aggressive (Maximized Savings)"];

const DEBT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "credit_cards", label: "Credit Cards" },
  { key: "sba_loans", label: "SBA Loans" },
  { key: "vehicle_loans", label: "Vehicle Loans" },
  { key: "equipment_loans", label: "Equipment Loans" },
  { key: "taxes_owed", label: "Taxes Owed" },
  { key: "payroll_liabilities", label: "Payroll Liabilities" },
  { key: "other", label: "Other" },
];

// Rotating badge colors so each question card gets a distinct, colorful icon
// chip — mirrors the gamified, one-question-per-screen reference design.
const BADGE_COLORS = [
  "bg-blue-500/15 text-blue-400",
  "bg-emerald-500/15 text-emerald-400",
  "bg-amber-500/15 text-amber-400",
  "bg-purple-500/15 text-purple-400",
  "bg-rose-500/15 text-rose-400",
  "bg-cyan-500/15 text-cyan-400",
  "bg-indigo-500/15 text-indigo-400",
  "bg-lime-500/15 text-lime-400",
];

// ─── Types ────────────────────────────────────────────────────────────────────
type SurveyData = {
  filing_status: string | null;
  primary_state: string | null;
  residency_status: string | null;
  multi_state_activity: boolean | null;
  primary_income_types: string[] | null;
  industry_niche: string | null;
  passive_income: string[] | null;
  team_structure: string[] | null;
  accounting_method: string | null;
  major_equipment: boolean | null;
  vehicle_ownership: string | null;
  vehicle_usage: string | null;
  vehicle_over_6k_lbs: boolean | null;
  home_office_type: string | null;
  home_status: string | null;
  tech_usage: string[] | null;
  real_estate_interests: string[] | null;
  hosts_business_meetings: boolean | null;
  health_insurance: string | null;
  health_savings: string[] | null;
  family_education: string[] | null;
  tax_goal: string | null;
  retirement_current: string[] | null;
  audit_appetite: string | null;
  total_house_area_sqft: number | null;
  dedicated_office_area_sqft: number | null;
  business_vehicle_percent: number | null;
  business_utility_percent: number | null;
  business_meal_percent: number | null;
  equipment_cost: number | null;
  debts: Record<string, number> | null;
};

interface BusinessSurveyDialogProps {
  orgId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: number;
}

// ─── Shared question controls ────────────────────────────────────────────────
function ChoicePill({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-muted-foreground border-border hover:border-primary/50"
      )}
    >
      {selected && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

function OptionRow({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
        selected
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-border/60 hover:border-border"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full border flex items-center justify-center shrink-0",
          selected ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/40"
        )}
      >
        {selected && <Check className="h-3 w-3 text-white" />}
      </span>
      <span className={cn("text-sm font-medium", selected ? "text-emerald-400" : "text-foreground")}>
        {label}
      </span>
    </button>
  );
}

function PillGroup({
  options,
  selected,
  multi,
  onChange,
}: {
  options: string[];
  selected: string | string[] | null;
  multi: boolean;
  onChange: (val: string | string[]) => void;
}) {
  const isSelected = (opt: string) =>
    multi ? Array.isArray(selected) && selected.includes(opt) : selected === opt;

  function toggle(opt: string) {
    if (multi) {
      const arr = Array.isArray(selected) ? [...selected] : [];
      if (arr.includes(opt)) {
        onChange(arr.filter((v) => v !== opt));
      } else {
        onChange([...arr, opt]);
      }
    } else {
      onChange(opt === selected ? "" : opt);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {options.map((opt) => (
        <OptionRow key={opt} label={opt} selected={isSelected(opt)} onToggle={() => toggle(opt)} />
      ))}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <OptionRow label="Yes" selected={value === true} onToggle={() => onChange(true)} />
      <OptionRow label="No" selected={value === false} onToggle={() => onChange(false)} />
    </div>
  );
}

function PercentSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-center mb-3">
        <span className="text-3xl font-bold text-emerald-400">{Math.round(value)}%</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="[&_[data-radix-slider-range]]:bg-emerald-500 [&_[data-radix-slider-track]]:bg-emerald-500/15 [&_[data-radix-slider-thumb]]:border-emerald-500 [&_[data-radix-slider-thumb]]:bg-emerald-400"
      />
      <div className="flex justify-between mt-1.5">
        <span className="text-[11px] text-muted-foreground">0%</span>
        <span className="text-[11px] text-muted-foreground">100%</span>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function BusinessSurveyDialog({ orgId, open, onOpenChange, initialStep }: BusinessSurveyDialogProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState(initialStep ?? 0);
  const [saving, setSaving] = useState(false);

  // Legal & Tax Identity
  const [filingStatus, setFilingStatus] = useState<string | null>(null);
  const [primaryState, setPrimaryState] = useState("");
  const [residencyStatus, setResidencyStatus] = useState<string | null>(null);
  const [multiState, setMultiState] = useState<boolean | null>(null);

  // Income
  const [incomeTypes, setIncomeTypes] = useState<string[]>([]);
  const [industryNiche, setIndustryNiche] = useState("");
  const [passiveIncome, setPassiveIncome] = useState<string[]>([]);

  // Operations
  const [teamStructure, setTeamStructure] = useState<string[]>([]);
  const [accountingMethod, setAccountingMethod] = useState<string | null>(null);
  const [majorEquipment, setMajorEquipment] = useState<boolean | null>(null);

  // Vehicle
  const [vehicleOwnership, setVehicleOwnership] = useState<string | null>(null);
  const [vehicleUsage, setVehicleUsage] = useState<string | null>(null);
  const [vehicleOver6k, setVehicleOver6k] = useState<boolean | null>(null);
  const [vehiclePct, setVehiclePct] = useState(100);

  // Workspace
  const [homeOfficeType, setHomeOfficeType] = useState<string | null>(null);
  const [homeStatus, setHomeStatus] = useState<string | null>(null);
  const [techUsage, setTechUsage] = useState<string[]>([]);

  // Real Estate
  const [realEstate, setRealEstate] = useState<string[]>([]);
  const [hostsMeetings, setHostsMeetings] = useState<boolean | null>(null);

  // Health & Family
  const [healthInsurance, setHealthInsurance] = useState<string | null>(null);
  const [healthSavings, setHealthSavings] = useState<string[]>([]);
  const [familyEducation, setFamilyEducation] = useState<string[]>([]);

  // Strategy Goals
  const [taxGoal, setTaxGoal] = useState<string | null>(null);
  const [retirementCurrent, setRetirementCurrent] = useState<string[]>([]);
  const [auditAppetite, setAuditAppetite] = useState<string | null>(null);

  // Deduction Percentages
  const [totalHouseArea, setTotalHouseArea] = useState("");
  const [dedicatedOfficeArea, setDedicatedOfficeArea] = useState("");
  const [utilityPct, setUtilityPct] = useState(100);
  const [mealPct, setMealPct] = useState(100);

  // Equipment & Debt
  const [equipmentCost, setEquipmentCost] = useState("0");
  const [debts, setDebts] = useState<Record<string, string>>({});

  // Fetch existing org data to pre-fill
  const { data: orgData } = useQuery<SurveyData | null>({
    queryKey: ["org_survey_data", orgId],
    enabled: orgId != null && open,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select([
          "filing_status","primary_state","residency_status","multi_state_activity",
          "primary_income_types","industry_niche","passive_income",
          "team_structure","accounting_method","major_equipment",
          "vehicle_ownership","vehicle_usage","vehicle_over_6k_lbs",
          "home_office_type","home_status","tech_usage",
          "real_estate_interests","hosts_business_meetings",
          "health_insurance","health_savings","family_education",
          "tax_goal","retirement_current","audit_appetite",
          "total_house_area_sqft","dedicated_office_area_sqft",
          "business_vehicle_percent","business_utility_percent","business_meal_percent",
          "equipment_cost","debts",
        ].join(","))
        .eq("id", orgId!)
        .single();
      if (error) throw error;
      return data as SurveyData;
    },
  });

  // Pre-fill state when org data loads
  useEffect(() => {
    if (!orgData) return;
    setFilingStatus(orgData.filing_status);
    setPrimaryState(orgData.primary_state ?? "");
    setResidencyStatus(orgData.residency_status);
    setMultiState(orgData.multi_state_activity);
    setIncomeTypes(orgData.primary_income_types ?? []);
    setIndustryNiche(orgData.industry_niche ?? "");
    setPassiveIncome(orgData.passive_income ?? []);
    setTeamStructure(orgData.team_structure ?? []);
    setAccountingMethod(orgData.accounting_method);
    setMajorEquipment(orgData.major_equipment);
    setVehicleOwnership(orgData.vehicle_ownership);
    setVehicleUsage(orgData.vehicle_usage);
    setVehicleOver6k(orgData.vehicle_over_6k_lbs);
    setHomeOfficeType(orgData.home_office_type);
    setHomeStatus(orgData.home_status);
    setTechUsage(orgData.tech_usage ?? []);
    setRealEstate(orgData.real_estate_interests ?? []);
    setHostsMeetings(orgData.hosts_business_meetings);
    setHealthInsurance(orgData.health_insurance);
    setHealthSavings(orgData.health_savings ?? []);
    setFamilyEducation(orgData.family_education ?? []);
    setTaxGoal(orgData.tax_goal);
    setRetirementCurrent(orgData.retirement_current ?? []);
    setAuditAppetite(orgData.audit_appetite);
    setTotalHouseArea(orgData.total_house_area_sqft?.toString() ?? "");
    setDedicatedOfficeArea(orgData.dedicated_office_area_sqft?.toString() ?? "");
    setVehiclePct(orgData.business_vehicle_percent ?? 100);
    setUtilityPct(orgData.business_utility_percent ?? 100);
    setMealPct(orgData.business_meal_percent ?? 100);
    setEquipmentCost(orgData.equipment_cost?.toString() ?? "0");
    const rawDebts = orgData.debts ?? {};
    const strDebts: Record<string, string> = {};
    for (const k of DEBT_CATEGORIES.map((d) => d.key)) {
      strDebts[k] = rawDebts[k]?.toString() ?? "";
    }
    setDebts(strDebts);
  }, [orgData]);

  // Reset step when dialog opens
  useEffect(() => {
    if (open) setStep(initialStep ?? 0);
  }, [open, initialStep]);

  // ─── One-question-per-screen step definitions ──────────────────────────────
  type StepDef = {
    icon: React.ElementType;
    image?: string;
    title: string;
    description: string;
    example?: string;
    visual?: () => React.ReactNode;
    render: () => React.ReactNode;
    payload: () => Record<string, unknown>;
    skip?: () => boolean;
  };

  const STEPS: StepDef[] = useMemo(() => [
    {
      icon: Gavel,
      title: "How do you file your personal tax return?",
      description: "This helps match your business income to the right filing context.",
      example: "Example: Married Filing Jointly if you file one return with your spouse.",
      render: () => <PillGroup options={FILING_STATUS} selected={filingStatus} multi={false} onChange={(v) => setFilingStatus(v as string)} />,
      payload: () => ({ filing_status: filingStatus || null }),
    },
    {
      icon: MapPin,
      title: "What is your primary business state?",
      description: "Use the state where the business mainly operates or files taxes.",
      example: "Example: California if most revenue and operations are there.",
      render: () => (
        <Input value={primaryState} onChange={(e) => setPrimaryState(e.target.value)} placeholder="e.g. California, Texas" className="bg-background" />
      ),
      payload: () => ({ primary_state: primaryState.trim() || null }),
    },
    {
      icon: Globe2,
      title: "What is your U.S. residency status?",
      description: "Residency affects which income and deductions apply.",
      example: "Example: Resident Alien if you meet the IRS substantial presence test.",
      render: () => <PillGroup options={RESIDENCY_STATUS} selected={residencyStatus} multi={false} onChange={(v) => setResidencyStatus(v as string)} />,
      payload: () => ({ residency_status: residencyStatus || null }),
    },
    {
      icon: Map,
      title: "Do you operate, work, or own property in multiple states?",
      description: "Multi-state activity can create extra filing and deduction rules.",
      example: "Example: You live in Texas but earn client revenue in California.",
      render: () => <YesNoToggle value={multiState} onChange={setMultiState} />,
      payload: () => ({ multi_state_activity: multiState }),
    },
    {
      icon: Wallet,
      image: walletIcon,
      title: "Which income types describe you?",
      description: "Select every source that materially contributes to your income.",
      example: "Example: 1099 Contractor plus Single-Member LLC.",
      render: () => <PillGroup options={INCOME_TYPES} selected={incomeTypes} multi={true} onChange={(v) => setIncomeTypes(v as string[])} />,
      payload: () => ({ primary_income_types: incomeTypes.length ? incomeTypes : null }),
    },
    {
      icon: Briefcase,
      title: "What industry or niche best describes the business?",
      description: "Specific niches help us tailor deduction examples and benchmarks.",
      example: "Example: Mobile detailing, bookkeeping, SaaS consulting, or real estate.",
      render: () => <Input value={industryNiche} onChange={(e) => setIndustryNiche(e.target.value)} placeholder="e.g. Bookkeeping services" className="bg-background" />,
      payload: () => ({ industry_niche: industryNiche.trim() || null }),
    },
    {
      icon: TrendingUp,
      title: "Do you have any passive or investment income?",
      description: "Passive income is taxed differently than active business income.",
      example: "Example: Dividend Income if you hold a brokerage account.",
      render: () => <PillGroup options={PASSIVE_INCOME} selected={passiveIncome} multi={true} onChange={(v) => setPassiveIncome(v as string[])} />,
      payload: () => ({ passive_income: passiveIncome.length ? passiveIncome : null }),
    },
    {
      icon: Users,
      title: "How is your team structured?",
      description: "Payroll and family-employment setups unlock different deductions.",
      example: "Example: Solo Operator if you don't pay anyone else yet.",
      render: () => <PillGroup options={TEAM_STRUCTURE} selected={teamStructure} multi={true} onChange={(v) => setTeamStructure(v as string[])} />,
      payload: () => ({ team_structure: teamStructure.length ? teamStructure : null }),
    },
    {
      icon: Calculator,
      title: "What accounting method do you use?",
      description: "This determines when income and expenses are recognized.",
      example: "Example: Cash Basis if you record income when it's received.",
      render: () => <PillGroup options={ACCOUNTING_METHOD} selected={accountingMethod} multi={false} onChange={(v) => setAccountingMethod(v as string)} />,
      payload: () => ({ accounting_method: accountingMethod || null }),
    },
    {
      icon: Wrench,
      image: equipmentIcon,
      title: "Do you own any business equipment?",
      description: "Examples: Computers, machinery, tools, furniture.",
      render: () => <YesNoToggle value={majorEquipment} onChange={setMajorEquipment} />,
      payload: () => ({ major_equipment: majorEquipment }),
    },
    {
      icon: DollarSign,
      title: "What is the estimated value of your equipment?",
      description: "Enter the total current value of all equipment.",
      example: "Upload receipt/proof optional.",
      render: () => (
        <div className="relative max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input value={equipmentCost} onChange={(e) => setEquipmentCost(e.target.value)} type="number" min="0" className="bg-background pl-7" />
        </div>
      ),
      payload: () => ({ equipment_cost: parseFloat(equipmentCost) || 0 }),
      skip: () => majorEquipment === false,
    },
    {
      icon: Car,
      image: carIcon,
      title: "How is your business vehicle owned or leased?",
      description: "This affects which vehicle deduction rules apply.",
      example: "Example: Company Owned if the vehicle is titled to the business.",
      render: () => <PillGroup options={VEHICLE_OWNERSHIP} selected={vehicleOwnership} multi={false} onChange={(v) => setVehicleOwnership(v as string)} />,
      payload: () => ({ vehicle_ownership: vehicleOwnership || null }),
    },
    {
      icon: Route,
      title: "How do you usually deduct vehicle use?",
      description: "Choose the method that matches how you track vehicle expenses.",
      render: () => <PillGroup options={VEHICLE_USAGE} selected={vehicleUsage} multi={false} onChange={(v) => setVehicleUsage(v as string)} />,
      payload: () => ({ vehicle_usage: vehicleUsage || null }),
      skip: () => vehicleOwnership === "No Business Vehicle",
    },
    {
      icon: Truck,
      title: "Is the vehicle over 6,000 pounds?",
      description: "Heavy vehicles can qualify for larger depreciation deductions.",
      render: () => <YesNoToggle value={vehicleOver6k} onChange={setVehicleOver6k} />,
      payload: () => ({ vehicle_over_6k_lbs: vehicleOver6k }),
      skip: () => vehicleOwnership === "No Business Vehicle",
    },
    {
      icon: Car,
      image: carIcon,
      title: "What percentage of your vehicle use is for business?",
      description: "Include trips to customers, job sites, suppliers, and meetings.",
      render: () => <PercentSlider value={vehiclePct} onChange={setVehiclePct} />,
      payload: () => ({ business_vehicle_percent: Math.round(vehiclePct) }),
      skip: () => vehicleOwnership === "No Business Vehicle",
    },
    {
      icon: Home,
      title: "Where do you primarily work from?",
      description: "This determines which home-office deductions may apply.",
      visual: () => (
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src={houseIcon} alt="" className="h-16 w-16 object-contain" />
          <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
          <img src={buildingIcon} alt="" className="h-16 w-16 object-contain" />
          <div className="flex flex-col items-center gap-1 ml-2">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
              <Plus className="h-6 w-6 text-amber-400" />
            </div>
            <span className="text-xs text-muted-foreground">both</span>
          </div>
        </div>
      ),
      render: () => <PillGroup options={HOME_OFFICE_TYPE} selected={homeOfficeType} multi={false} onChange={(v) => setHomeOfficeType(v as string)} />,
      payload: () => ({ home_office_type: homeOfficeType || null }),
    },
    {
      icon: Building2,
      image: buildingIcon,
      title: "What is your home ownership status?",
      description: "Owning vs. renting changes which home costs are deductible.",
      render: () => <PillGroup options={HOME_STATUS} selected={homeStatus} multi={false} onChange={(v) => setHomeStatus(v as string)} />,
      payload: () => ({ home_status: homeStatus || null }),
      skip: () => homeOfficeType === "No Home Office",
    },
    {
      icon: Ruler,
      title: "What is the total square footage of your home?",
      description: "Include the whole home, not just the office area.",
      example: "Example: If your home is 2,000 sq ft, enter 2,000.",
      render: () => (
        <div className="relative max-w-xs">
          <Input value={totalHouseArea} onChange={(e) => setTotalHouseArea(e.target.value)} type="number" min="0" className="bg-background pr-14" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">sq ft</span>
        </div>
      ),
      payload: () => {
        const totalArea = parseFloat(totalHouseArea) || 0;
        const officeArea = parseFloat(dedicatedOfficeArea) || 0;
        const businessArea = totalArea > 0 ? (officeArea / totalArea) * 100 : 0;
        return { total_house_area_sqft: totalArea || null, business_area_sqft: businessArea || null };
      },
      skip: () => homeOfficeType === "No Home Office",
    },
    {
      icon: Ruler,
      title: "What percentage of your home is used regularly for business?",
      description: "Only include areas used regularly for business.",
      render: () => (
        <div className="max-w-xs">
          <Input
            value={dedicatedOfficeArea}
            onChange={(e) => setDedicatedOfficeArea(e.target.value)}
            type="number" min="0" className="bg-background"
            placeholder="Dedicated office area (sq ft)"
          />
        </div>
      ),
      payload: () => {
        const totalArea = parseFloat(totalHouseArea) || 0;
        const officeArea = parseFloat(dedicatedOfficeArea) || 0;
        const businessArea = totalArea > 0 ? (officeArea / totalArea) * 100 : 0;
        return { dedicated_office_area_sqft: officeArea || null, business_area_sqft: businessArea || null };
      },
      skip: () => homeOfficeType === "No Home Office",
    },
    {
      icon: Laptop,
      image: phoneIcon,
      title: "Which tech and digital tools support the business?",
      description: "Select every tool or service you regularly pay for.",
      render: () => <PillGroup options={TECH_USAGE} selected={techUsage} multi={true} onChange={(v) => setTechUsage(v as string[])} />,
      payload: () => ({ tech_usage: techUsage.length ? techUsage : null }),
    },
    {
      icon: Lightbulb,
      image: lightbulbIcon,
      title: "What percentage of your household utilities support your business activities?",
      description: "Includes electricity, gas, trash, and other household utilities.",
      render: () => <PercentSlider value={utilityPct} onChange={setUtilityPct} />,
      payload: () => ({ business_utility_percent: Math.round(utilityPct) }),
      skip: () => homeOfficeType === "No Home Office",
    },
    {
      icon: Utensils,
      title: "What percentage of your meals are business-related?",
      description: "Client meetings, business travel meals, and similar expenses.",
      render: () => <PercentSlider value={mealPct} onChange={setMealPct} />,
      payload: () => ({ business_meal_percent: Math.round(mealPct) }),
    },
    {
      icon: Building,
      image: buildingIcon,
      title: "Which real estate interests apply to you?",
      description: "Select every property type you hold an interest in.",
      render: () => <PillGroup options={REAL_ESTATE_INTERESTS} selected={realEstate} multi={true} onChange={(v) => setRealEstate(v as string[])} />,
      payload: () => ({ real_estate_interests: realEstate.length ? realEstate : null }),
    },
    {
      icon: Handshake,
      title: "Do you host business meetings at home?",
      description: "This can unlock the Augusta Rule for tax-free rental income from your business.",
      render: () => <YesNoToggle value={hostsMeetings} onChange={setHostsMeetings} />,
      payload: () => ({ hosts_business_meetings: hostsMeetings }),
    },
    {
      icon: HeartPulse,
      title: "How is your health insurance set up?",
      description: "This affects self-employed health insurance deductions.",
      render: () => <PillGroup options={HEALTH_INSURANCE} selected={healthInsurance} multi={false} onChange={(v) => setHealthInsurance(v as string)} />,
      payload: () => ({ health_insurance: healthInsurance || null }),
    },
    {
      icon: PiggyBank,
      title: "Do you use any health savings accounts?",
      description: "Select all that apply.",
      render: () => <PillGroup options={HEALTH_SAVINGS} selected={healthSavings} multi={true} onChange={(v) => setHealthSavings(v as string[])} />,
      payload: () => ({ health_savings: healthSavings.length ? healthSavings : null }),
    },
    {
      icon: GraduationCap,
      title: "Do any family or education costs apply to you?",
      description: "Select all that apply.",
      render: () => <PillGroup options={FAMILY_EDUCATION} selected={familyEducation} multi={true} onChange={(v) => setFamilyEducation(v as string[])} />,
      payload: () => ({ family_education: familyEducation.length ? familyEducation : null }),
    },
    {
      icon: Target,
      title: "What's your primary tax goal?",
      description: "This shapes which strategies we recommend first.",
      render: () => <PillGroup options={TAX_GOALS} selected={taxGoal} multi={false} onChange={(v) => setTaxGoal(v as string)} />,
      payload: () => ({ tax_goal: taxGoal || null }),
    },
    {
      icon: Landmark,
      title: "Which retirement strategies are already in place?",
      description: "Select every plan you currently contribute to.",
      example: "Example: Solo 401k/SEP IRA if you have a self-employed retirement plan.",
      render: () => <PillGroup options={RETIREMENT_CURRENT} selected={retirementCurrent} multi={true} onChange={(v) => setRetirementCurrent(v as string[])} />,
      payload: () => ({ retirement_current: retirementCurrent.length ? retirementCurrent : null }),
    },
    {
      icon: ShieldCheck,
      title: "How much audit risk are you comfortable with?",
      description: "This tunes how aggressive our recommended deductions are.",
      render: () => <PillGroup options={AUDIT_APPETITE} selected={auditAppetite} multi={false} onChange={(v) => setAuditAppetite(v as string)} />,
      payload: () => ({ audit_appetite: auditAppetite || null }),
    },
    {
      icon: CreditCard,
      image: creditCardsIcon,
      title: "Does your business owe money to anyone?",
      description: "Select all that apply.",
      render: () => (
        <div className="flex flex-wrap gap-2">
          {DEBT_CATEGORIES.map(({ key, label }) => (
            <ChoicePill
              key={key}
              label={label}
              selected={(debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1"}
              onToggle={() => {
                setDebts((d) => {
                  const has = (d[key] ?? "") !== "" || d[`__${key}_selected`] === "1";
                  const next = { ...d };
                  if (has) {
                    delete next[`__${key}_selected`];
                  } else {
                    next[`__${key}_selected`] = "1";
                  }
                  return next;
                });
              }}
            />
          ))}
        </div>
      ),
      payload: () => ({}),
    },
    {
      icon: Receipt,
      image: invoiceIcon,
      title: "Enter the current balances for the selected items.",
      description: "Enter the total amount owed for each item selected.",
      render: () => (
        <div className="space-y-2 max-w-sm">
          {DEBT_CATEGORIES.filter(({ key }) => (debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1").map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <div className="relative w-32">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <Input
                  value={debts[key] ?? ""}
                  onChange={(e) => setDebts((d) => ({ ...d, [key]: e.target.value }))}
                  type="number" min="0" className="bg-background pl-6 h-8 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      ),
      payload: () => {
        const debtPayload: Record<string, number> = {};
        for (const { key } of DEBT_CATEGORIES) {
          const val = parseFloat(debts[key] ?? "");
          if (!isNaN(val) && val > 0) debtPayload[key] = val;
        }
        return { debts: Object.keys(debtPayload).length ? debtPayload : null };
      },
      skip: () => !DEBT_CATEGORIES.some(({ key }) => (debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1"),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [
    filingStatus, primaryState, residencyStatus, multiState,
    incomeTypes, industryNiche, passiveIncome,
    teamStructure, accountingMethod, majorEquipment,
    vehicleOwnership, vehicleUsage, vehicleOver6k, vehiclePct,
    homeOfficeType, homeStatus, techUsage,
    realEstate, hostsMeetings,
    healthInsurance, healthSavings, familyEducation,
    taxGoal, retirementCurrent, auditAppetite,
    totalHouseArea, dedicatedOfficeArea, utilityPct, mealPct,
    equipmentCost, debts,
  ]);

  const TOTAL_STEPS = STEPS.length;

  function firstNonSkipped(from: number): number {
    let i = from;
    while (i < TOTAL_STEPS && STEPS[i]?.skip?.()) i++;
    return i;
  }

  async function saveAndAdvance() {
    if (!orgId) { advance(); return; }
    setSaving(true);
    try {
      const payload = STEPS[step].payload();
      if (Object.keys(payload).length > 0) {
        const { error } = await supabase.from("organizations").update(payload).eq("id", orgId);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["org_survey_data", orgId] });
        qc.invalidateQueries({ queryKey: ["organizations_list"] });
      }
      advance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function advance() {
    const next = firstNonSkipped(step + 1);
    if (next < TOTAL_STEPS) {
      setStep(next);
    } else {
      setStep(TOTAL_STEPS);
      toast.success("Business survey saved. Your AI strategy is being tailored.");
    }
  }

  function goBack() {
    if (step === 0) { onOpenChange(false); return; }
    let i = step - 1;
    while (i > 0 && STEPS[i]?.skip?.()) i--;
    setStep(i);
  }

  const current = step < TOTAL_STEPS ? STEPS[step] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border/60 gap-0">
        <div className="p-6 pb-4 max-h-[70vh] overflow-y-auto">
          {current ? (
            <>
              <div className="flex items-start gap-3 mb-5">
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {step + 1}
                </div>
                <p className="text-xl font-bold leading-snug pt-0.5">{current.title}</p>
              </div>

              {current.visual ? (
                current.visual()
              ) : current.image ? (
                <div className="flex items-center justify-center mb-6">
                  <img src={current.image} alt="" className="h-20 w-20 object-contain" />
                </div>
              ) : (
                <div className="flex items-center justify-center mb-6">
                  <div className="h-20 w-20 rounded-2xl bg-blue-500/15 flex items-center justify-center">
                    <current.icon className="h-10 w-10 text-blue-400" />
                  </div>
                </div>
              )}

              {current.example && (
                <div className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2 mb-4">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">{current.example}</p>
                </div>
              )}
              <div>{current.render()}</div>

              <div className="mt-6">
                <span className="text-xs text-muted-foreground">{step + 1} of {TOTAL_STEPS}</span>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-6">
              <div className="h-24 w-24 flex items-center justify-center mb-4">
                <img src={trophyIcon} alt="" className="h-24 w-24 object-contain drop-shadow-lg" />
              </div>
              <p className="text-xl font-bold mb-1 flex items-center gap-2">
                Great Job! <Sparkles className="h-5 w-5 text-amber-400" />
              </p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Your business profile is saved. This helps our AI generate personalized tax
                strategies, accurate deductions, and a more complete financial picture.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-4 bg-muted/20">
          <Button variant="ghost" onClick={goBack} className="gap-1">
            {step === 0 ? "Cancel" : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </Button>
          <div className="flex gap-2">
            {current && (
              <Button variant="outline" onClick={advance}>Skip</Button>
            )}
            <Button onClick={current ? saveAndAdvance : () => onOpenChange(false)} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {current ? (step === TOTAL_STEPS - 1 ? "Save & Finish" : "Save & Next") : "Done"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
