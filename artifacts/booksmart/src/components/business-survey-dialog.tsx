import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Gavel, MapPin, Globe2, Map, Wallet, Briefcase, TrendingUp, Users,
  Calculator, Wrench, Car, Route, Truck, Home, Building2, Laptop, Building,
  Handshake, HeartPulse, PiggyBank, GraduationCap, Target, Landmark, ShieldCheck,
  Ruler, Lightbulb, Utensils, DollarSign, CreditCard, Receipt, Trophy, Sparkles,
  Check, ChevronLeft, Plus, Package, Flag, ClipboardList,
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
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

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
  industry: string | null;
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
  debts: Record<string, unknown> | null;
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
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all",
        selected
          ? "bg-[#2F8A24] text-white border-[#60C14F] shadow-[0_0_18px_rgba(96,193,79,0.18)]"
          : "bg-[#07182c] text-[#D7E6FF] border-[#1c3c66] hover:border-[#60C14F]/70"
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
        "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all",
        selected
          ? "border-[#60C14F] bg-[#2F8A24] shadow-[0_0_18px_rgba(96,193,79,0.18)]"
          : "border-[#1c3c66] bg-[#07182c] hover:border-[#60C14F]/70"
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
          selected ? "bg-[#66C94D] border-[#66C94D]" : "border-[#55759f]"
        )}
      >
        {selected && <Check className="h-3 w-3 text-white" />}
      </span>
      <span className={cn("text-sm font-medium", selected ? "text-white" : "text-[#EAF2FF]")}>
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
        <span className="text-5xl font-bold text-[#78C94D]">{Math.round(value)}%</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="[&_[data-radix-slider-range]]:bg-[#78C94D] [&_[data-radix-slider-track]]:bg-[#1c3c66] [&_[data-radix-slider-thumb]]:border-[#78C94D] [&_[data-radix-slider-thumb]]:bg-[#78C94D]"
      />
      <div className="flex justify-between mt-1.5">
        <span className="text-[11px] text-[#B8C9E6]">0%</span>
        <span className="text-[11px] text-[#B8C9E6]">100%</span>
      </div>
    </div>
  );
}

function SurveyQuestionCard({
  icon: Icon,
  title,
  description,
  example,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  example?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/85 bg-[#0d2a4f] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-[#FFC72B] text-white flex items-center justify-center shrink-0">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h4 className="text-[17px] font-bold leading-tight text-white">{title}</h4>
          {description && <p className="mt-1 text-[12px] font-semibold text-white">{description}</p>}
        </div>
      </div>
      {example && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#9a8b41] px-3 py-2 text-[12px] text-[#06172b]">
          <Lightbulb className="h-4 w-4 shrink-0" />
          <span>{example}</span>
        </div>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function InlineChoices({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full border px-4 py-2 text-sm font-bold transition-all",
            selected === option
              ? "border-[#FFC72B] bg-[#FFC72B] text-white"
              : "border-white/90 bg-transparent text-white hover:border-[#FFC72B]"
          )}
        >
          {selected === option && <Check className="mr-1 inline h-4 w-4" />}
          {option}
        </button>
      ))}
    </div>
  );
}

function CompactSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 border-[#274a77] bg-[#07182c] text-white">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const [homeBusinessPct, setHomeBusinessPct] = useState(10);
  const [phonePct, setPhonePct] = useState(50);
  const [internetPct, setInternetPct] = useState(50);
  const [hasReceivables, setHasReceivables] = useState<boolean | null>(null);
  const [hasInventory, setHasInventory] = useState<boolean | null>(null);
  const [ownerContributed, setOwnerContributed] = useState<boolean | null>(null);
  const [ownerContributionAmount, setOwnerContributionAmount] = useState("");
  const [ownerContributionDate, setOwnerContributionDate] = useState("");
  const [ownerDraws, setOwnerDraws] = useState<boolean | null>(null);
  const [additionalCategories, setAdditionalCategories] = useState<string[]>([]);

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
          "industry",
        ].join(","))
        .eq("id", orgId!)
        .single();
      if (error) throw error;
      return data as unknown as SurveyData;
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
    if (orgData.total_house_area_sqft && orgData.dedicated_office_area_sqft) {
      setHomeBusinessPct(Math.round((orgData.dedicated_office_area_sqft / orgData.total_house_area_sqft) * 100));
    }
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
    setPhonePct(typeof rawDebts.phone_business_percent === "number" ? rawDebts.phone_business_percent : 50);
    setInternetPct(typeof rawDebts.internet_business_percent === "number" ? rawDebts.internet_business_percent : 50);
    setHasReceivables(typeof rawDebts.has_receivables === "boolean" ? rawDebts.has_receivables : null);
    setHasInventory(typeof rawDebts.has_inventory === "boolean" ? rawDebts.has_inventory : null);
    setOwnerContributed(typeof rawDebts.owner_contributed === "boolean" ? rawDebts.owner_contributed : null);
    setOwnerContributionAmount(typeof rawDebts.owner_contribution_amount === "number" ? String(rawDebts.owner_contribution_amount) : "");
    setOwnerContributionDate(typeof rawDebts.owner_contribution_date === "string" ? rawDebts.owner_contribution_date : "");
    setOwnerDraws(typeof rawDebts.owner_draws === "boolean" ? rawDebts.owner_draws : null);
    setAdditionalCategories(Array.isArray(rawDebts.additional_balance_sheet_categories) ? rawDebts.additional_balance_sheet_categories as string[] : []);
  }, [orgData]);

  // Reset step when dialog opens
  useEffect(() => {
    if (open) setStep(initialStep ?? 0);
  }, [open, initialStep]);

  // ─── One-question-per-screen step definitions ──────────────────────────────
  type StepDef = {
    part: "business" | "balance";
    icon: React.ElementType;
    image?: string;
    title: string;
    description: string;
    subtitle?: string;
    example?: string;
    visual?: () => React.ReactNode;
    render: () => React.ReactNode;
    payload: () => Record<string, unknown>;
    skip?: () => boolean;
  };

  const debtExtras = (extra: Record<string, unknown> = {}) => {
    const numericDebts: Record<string, number> = {};
    for (const { key } of DEBT_CATEGORIES) {
      const val = parseFloat(debts[key] ?? "");
      if (!isNaN(val) && val > 0) numericDebts[key] = val;
    }
    return { debts: { ...(orgData?.debts ?? {}), ...numericDebts, ...extra } };
  };

  const selectedDebtKeys = DEBT_CATEGORIES.filter(({ key }) => (debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1");
  const ADDITIONAL_CATEGORIES = ["Accounts Payable", "Goodwill", "Retained Earnings", "Notes Payable", "Investments", "Security Deposits", "Prepaid Expenses", "Accrued Expenses", "Deferred Revenue", "Other Assets / Liabilities"];

  const BUSINESS_STEPS: StepDef[] = useMemo(() => [
    {
      part: "business",
      icon: Gavel,
      title: "Legal and Tax Identity",
      description: "Start with the basics that shape your filing strategy.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard
            icon={Briefcase}
            title="How do you file your personal tax return?"
            description="This helps match your business income to the right filing context."
            example="Example: Married Filing Jointly if you file one return with your spouse."
          >
            <InlineChoices options={FILING_STATUS} selected={filingStatus} onChange={setFilingStatus} />
          </SurveyQuestionCard>
          <SurveyQuestionCard
            icon={MapPin}
            title="What is your primary business state?"
            description="Use the state where the business mainly operates or files taxes."
            example="Example: California if most revenue and operations are there."
          >
            <CompactSelect value={primaryState} placeholder="Select state" options={US_STATES} onChange={setPrimaryState} />
          </SurveyQuestionCard>
          <SurveyQuestionCard
            icon={Home}
            title="What is your U.S. residency status?"
            description="Residency affects which income and deductions apply."
            example="Example: Resident Alien if you meet the IRS substantial presence test."
          >
            <InlineChoices options={RESIDENCY_STATUS} selected={residencyStatus} onChange={setResidencyStatus} />
          </SurveyQuestionCard>
          <SurveyQuestionCard
            icon={Globe2}
            title="Do you operate, work, or own property in multiple states?"
            description="Multi-state activity can create extra filing and deduction rules."
            example="Example: You live in Texas but earn client revenue in California."
          >
            <div className="flex gap-3">
              <Button type="button" variant={multiState === true ? "default" : "outline"} onClick={() => setMultiState(true)} className="min-w-20">Yes</Button>
              <Button type="button" variant={multiState === false ? "default" : "outline"} onClick={() => setMultiState(false)} className="min-w-20">No</Button>
            </div>
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({
        filing_status: filingStatus,
        primary_state: primaryState || null,
        residency_status: residencyStatus,
        multi_state_activity: multiState,
      }),
    },
    {
      part: "business",
      icon: Wallet,
      title: "Income Profile",
      description: "Show how money enters the business so we can spot entity-level opportunities.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Wallet} title="What income types apply to you?" description="Select every source that matches your business or personal filing mix.">
            <PillGroup options={INCOME_TYPES} selected={incomeTypes} multi onChange={(v) => setIncomeTypes(v as string[])} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={TrendingUp} title="Do you have passive or investment income?" description="Select any income that may need separate tax treatment.">
            <PillGroup options={PASSIVE_INCOME} selected={passiveIncome} multi onChange={(v) => setPassiveIncome(v as string[])} />
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ primary_income_types: incomeTypes, industry_niche: industryNiche || orgData?.industry || null, passive_income: passiveIncome }),
    },
    {
      part: "business",
      icon: Users,
      title: "People and Accounting",
      description: "Document the people and accounting setup behind the business.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Users} title="Who helps run the business?" description="This affects payroll, contractor, and family employment strategies.">
            <PillGroup options={TEAM_STRUCTURE} selected={teamStructure} multi onChange={(v) => setTeamStructure(v as string[])} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Calculator} title="What accounting method do you use?" description="Most small businesses use cash basis unless they elected accrual.">
            <InlineChoices options={ACCOUNTING_METHOD} selected={accountingMethod} onChange={setAccountingMethod} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Wrench} title="Did you buy major tools, equipment, or machinery?" description="Major assets can unlock depreciation or Section 179 planning.">
            <div className="flex gap-3">
              <Button type="button" variant={majorEquipment === true ? "default" : "outline"} onClick={() => setMajorEquipment(true)} className="min-w-20">Yes</Button>
              <Button type="button" variant={majorEquipment === false ? "default" : "outline"} onClick={() => setMajorEquipment(false)} className="min-w-20">No</Button>
            </div>
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ team_structure: teamStructure, accounting_method: accountingMethod, major_equipment: majorEquipment }),
    },
    {
      part: "business",
      icon: Car,
      title: "Vehicle Use",
      description: "Capture vehicle ownership and deduction method.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Car} title="How is your business vehicle owned or leased?" description="Example: Company Owned if the vehicle is titled to the business.">
            <PillGroup options={VEHICLE_OWNERSHIP} selected={vehicleOwnership} multi={false} onChange={(v) => setVehicleOwnership(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Route} title="How do you track vehicle deductions?" description="Example: Standard Mileage Rate if you track business miles.">
            <PillGroup options={VEHICLE_USAGE} selected={vehicleUsage} multi={false} onChange={(v) => setVehicleUsage(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Truck} title="Is the vehicle over 6,000 lbs?" description="Heavy vehicles can qualify for different depreciation rules.">
            <div className="flex gap-3">
              <Button type="button" variant={vehicleOver6k === true ? "default" : "outline"} onClick={() => setVehicleOver6k(true)} className="min-w-20">Yes</Button>
              <Button type="button" variant={vehicleOver6k === false ? "default" : "outline"} onClick={() => setVehicleOver6k(false)} className="min-w-20">No</Button>
            </div>
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ vehicle_ownership: vehicleOwnership, vehicle_usage: vehicleUsage, vehicle_over_6k_lbs: vehicleOver6k }),
    },
    {
      part: "business",
      icon: Home,
      title: "Workspace and Technology",
      description: "Capture your office setup and technology that supports the business.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Home} title="What type of workspace do you use?" description="Example: Dedicated Room if the room is used only for business.">
            <PillGroup options={HOME_OFFICE_TYPE} selected={homeOfficeType} multi={false} onChange={(v) => setHomeOfficeType(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Building} title="What is your home status?" description="This helps estimate home-office treatment correctly.">
            <PillGroup options={HOME_STATUS} selected={homeStatus} multi={false} onChange={(v) => setHomeStatus(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Laptop} title="Which technology costs support your business?" description="Select all that apply.">
            <PillGroup options={TECH_USAGE} selected={techUsage} multi onChange={(v) => setTechUsage(v as string[])} />
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ home_office_type: homeOfficeType, home_status: homeStatus, tech_usage: techUsage }),
    },
    {
      part: "business",
      icon: Landmark,
      title: "Real Estate",
      description: "Identify property connected to your household or business.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Building2} title="Which property types apply to you?" description="Select every property type connected to your household or business.">
            <PillGroup options={REAL_ESTATE_INTERESTS} selected={realEstate} multi onChange={(v) => setRealEstate(v as string[])} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Handshake} title="Do you host business meetings or corporate minutes at home?" description="Example: Renting your home to your business for board meetings.">
            <div className="flex gap-3">
              <Button type="button" variant={hostsMeetings === true ? "default" : "outline"} onClick={() => setHostsMeetings(true)} className="min-w-20">Yes</Button>
              <Button type="button" variant={hostsMeetings === false ? "default" : "outline"} onClick={() => setHostsMeetings(false)} className="min-w-20">No</Button>
            </div>
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ real_estate_interests: realEstate, hosts_business_meetings: hostsMeetings }),
    },
    {
      part: "business",
      icon: HeartPulse,
      title: "Health and Family",
      description: "Find healthcare, family, and education planning opportunities.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={HeartPulse} title="What health insurance do you use?" description="This can affect self-employed health deductions.">
            <PillGroup options={HEALTH_INSURANCE} selected={healthInsurance} multi={false} onChange={(v) => setHealthInsurance(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={PiggyBank} title="Do you use any health savings accounts?" description="Select every account type that applies.">
            <PillGroup options={HEALTH_SAVINGS} selected={healthSavings} multi onChange={(v) => setHealthSavings(v as string[])} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={GraduationCap} title="Any education or family support costs?" description="These may affect tax credits or planning.">
            <PillGroup options={FAMILY_EDUCATION} selected={familyEducation} multi onChange={(v) => setFamilyEducation(v as string[])} />
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ health_insurance: healthInsurance, health_savings: healthSavings, family_education: familyEducation }),
    },
    {
      part: "business",
      icon: Target,
      title: "Tax Strategy Goals",
      description: "Tell the AI how aggressive or conservative the plan should be.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Target} title="What is your main tax goal?" description="Choose the planning style you want BookSmart to prioritize.">
            <PillGroup options={TAX_GOALS} selected={taxGoal} multi={false} onChange={(v) => setTaxGoal(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={PiggyBank} title="What retirement setup do you currently have?" description="Retirement plans can create large tax strategy opportunities.">
            <PillGroup options={RETIREMENT_CURRENT} selected={retirementCurrent} multi onChange={(v) => setRetirementCurrent(v as string[])} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={ShieldCheck} title="What is your audit-risk appetite?" description="This controls how conservative the generated strategy should be.">
            <PillGroup options={AUDIT_APPETITE} selected={auditAppetite} multi={false} onChange={(v) => setAuditAppetite(v as string)} />
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ tax_goal: taxGoal, retirement_current: retirementCurrent, audit_appetite: auditAppetite }),
    },
    {
      part: "business",
      icon: Ruler,
      title: "Deduction Percentages",
      description: "Use practical percentages to estimate mixed personal and business use.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Home} title="What percentage of your home is business use?" description="This estimates the business-use percentage of your home.">
            <PercentSlider value={homeBusinessPct} onChange={setHomeBusinessPct} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Car} title="What percentage of vehicle use is business related?" description="Estimate the business share based on mileage or usage logs.">
            <PercentSlider value={vehiclePct} onChange={setVehiclePct} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Lightbulb} title="What percentage of utilities support the business?" description="Estimate the household utility share used for business.">
            <PercentSlider value={utilityPct} onChange={setUtilityPct} />
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => {
        const totalArea = parseFloat(totalHouseArea) || 0;
        return {
          dedicated_office_area_sqft: totalArea > 0 ? Math.round(totalArea * (homeBusinessPct / 100)) : null,
          business_vehicle_percent: Math.round(vehiclePct),
          business_utility_percent: Math.round(utilityPct),
        };
      },
    },
    {
      part: "business",
      icon: ClipboardList,
      title: "Equipment and Debts",
      description: "Finish with major equipment costs and business liabilities.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={DollarSign} title="How much did you spend on business equipment this year?" description="Enter the total cost of equipment, tools, hardware, or machinery bought for business use.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D7E6FF]">$</span>
              <Input value={equipmentCost} onChange={(e) => setEquipmentCost(e.target.value)} type="number" min="0" className="h-11 pl-8" />
            </div>
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={CreditCard} title="Does your business owe money to anyone?" description="Example: $12,000 SBA loan and $3,500 business credit card balance.">
            <div className="grid grid-cols-1 gap-2">
              {DEBT_CATEGORIES.map(({ key, label }) => (
                <ChoicePill
                  key={key}
                  label={label}
                  selected={(debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1"}
                  onToggle={() => setDebts((d) => {
                    const has = (d[key] ?? "") !== "" || d[`__${key}_selected`] === "1";
                    const next = { ...d };
                    if (has) delete next[`__${key}_selected`];
                    else next[`__${key}_selected`] = "1";
                    return next;
                  })}
                />
              ))}
            </div>
          </SurveyQuestionCard>
        </div>
      ),
      payload: () => ({ equipment_cost: parseFloat(equipmentCost) || 0, ...debtExtras() }),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [
    filingStatus, primaryState, residencyStatus, multiState, incomeTypes, industryNiche,
    passiveIncome, teamStructure, accountingMethod, majorEquipment, vehicleOwnership,
    vehicleUsage, vehicleOver6k, homeOfficeType, homeStatus, techUsage, realEstate,
    hostsMeetings, healthInsurance, healthSavings, familyEducation, taxGoal,
    retirementCurrent, auditAppetite, homeBusinessPct, vehiclePct, utilityPct,
    totalHouseArea, equipmentCost, debts,
  ]);

  const BALANCE_STEPS: StepDef[] = useMemo(() => [
    {
      part: "balance",
      icon: Home,
      title: "Where do you primarily work from?",
      description: "",
      visual: () => (
        <div className="flex items-center justify-center gap-3">
          <img src={houseIcon} alt="" className="h-16 w-16 object-contain" />
          <Plus className="h-4 w-4 text-white" />
          <img src={buildingIcon} alt="" className="h-16 w-16 object-contain" />
          <div className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded bg-[#1d2d45] flex items-center justify-center">
              <Plus className="h-6 w-6 text-[#FFC72B]" />
            </div>
            <span className="text-xs text-white">both</span>
          </div>
        </div>
      ),
      render: () => <PillGroup options={["My Home", "Commercial Office", "Both (Home & Office)"]} selected={homeOfficeType} multi={false} onChange={(v) => setHomeOfficeType(v as string)} />,
      payload: () => ({ home_office_type: homeOfficeType || null }),
    },
    {
      part: "balance",
      icon: Ruler,
      image: houseIcon,
      title: "What is the total square footage of your home?",
      description: "",
      example: "Example: If your home is 2,000 sq ft, enter 2,000.",
      render: () => (
        <div className="relative">
          <Input value={totalHouseArea} onChange={(e) => setTotalHouseArea(e.target.value)} type="number" min="0" className="h-12 pr-14 text-lg" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#D7E6FF]">sq ft</span>
        </div>
      ),
      payload: () => ({ total_house_area_sqft: parseFloat(totalHouseArea) || null }),
    },
    {
      part: "balance",
      icon: Home,
      title: "What percentage of your home is used regularly for business?",
      description: "Only include areas used regularly for business.",
      render: () => <PercentSlider value={homeBusinessPct} onChange={setHomeBusinessPct} />,
      payload: () => {
        const totalArea = parseFloat(totalHouseArea) || 0;
        return { dedicated_office_area_sqft: totalArea > 0 ? Math.round(totalArea * (homeBusinessPct / 100)) : null };
      },
    },
    {
      part: "balance",
      icon: Car,
      image: carIcon,
      title: "How much of your vehicle use is for business?",
      description: "Include trips to customers, job sites, suppliers, and business meetings.",
      render: () => <PercentSlider value={vehiclePct} onChange={setVehiclePct} />,
      payload: () => ({ business_vehicle_percent: Math.round(vehiclePct) }),
    },
    {
      part: "balance",
      icon: Laptop,
      image: phoneIcon,
      title: "What percentage of your phone service is used for business?",
      description: "Include calls, texts, email, scheduling, and business apps.",
      render: () => <PercentSlider value={phonePct} onChange={setPhonePct} />,
      payload: () => debtExtras({ phone_business_percent: Math.round(phonePct) }),
    },
    {
      part: "balance",
      icon: Globe2,
      image: wifiIcon,
      title: "What percentage of your internet service is used for business?",
      description: "Include email, bookkeeping, online meetings, research, and other business activities.",
      render: () => <PercentSlider value={internetPct} onChange={setInternetPct} />,
      payload: () => debtExtras({ internet_business_percent: Math.round(internetPct) }),
    },
    {
      part: "balance",
      icon: Lightbulb,
      image: lightbulbIcon,
      title: "What percentage of your household utilities support your business activities?",
      description: "Includes electricity, water, gas, trash and other household utilities.",
      render: () => <PercentSlider value={utilityPct} onChange={setUtilityPct} />,
      payload: () => ({ business_utility_percent: Math.round(utilityPct) }),
    },
    {
      part: "balance",
      icon: Wrench,
      image: equipmentIcon,
      title: "Do you own any business equipment?",
      description: "Examples: Computers, machinery, tools, furniture, etc.",
      render: () => <YesNoToggle value={majorEquipment} onChange={setMajorEquipment} />,
      payload: () => ({ major_equipment: majorEquipment }),
    },
    {
      part: "balance",
      icon: DollarSign,
      image: equipmentIcon,
      title: "What is the estimated value of your equipment?",
      description: "Enter the total current value of all equipment.",
      render: () => (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D7E6FF]">$</span>
          <Input value={equipmentCost} onChange={(e) => setEquipmentCost(e.target.value)} type="number" min="0" className="h-12 pl-8 text-lg" />
        </div>
      ),
      payload: () => ({ equipment_cost: parseFloat(equipmentCost) || 0 }),
    },
    {
      part: "balance",
      icon: Receipt,
      image: invoiceIcon,
      title: "Does anyone owe your business money?",
      description: "Examples: Unpaid invoices, client balances, retainers.",
      render: () => <YesNoToggle value={hasReceivables} onChange={setHasReceivables} />,
      payload: () => debtExtras({ has_receivables: hasReceivables }),
    },
    {
      part: "balance",
      icon: Package,
      image: packageIcon,
      title: "Do you keep inventory or products for sale?",
      description: "",
      render: () => <YesNoToggle value={hasInventory} onChange={setHasInventory} />,
      payload: () => debtExtras({ has_inventory: hasInventory }),
    },
    {
      part: "balance",
      icon: CreditCard,
      image: creditCardsIcon,
      title: "Does your business owe money to anyone?",
      description: "Select all that apply.",
      render: () => (
        <div className="grid grid-cols-1 gap-2">
          {DEBT_CATEGORIES.map(({ key, label }) => (
            <ChoicePill
              key={key}
              label={label}
              selected={(debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1"}
              onToggle={() => {
                setDebts((d) => {
                  const has = (d[key] ?? "") !== "" || d[`__${key}_selected`] === "1";
                  const next = { ...d };
                  if (has) delete next[`__${key}_selected`];
                  else next[`__${key}_selected`] = "1";
                  return next;
                });
              }}
            />
          ))}
        </div>
      ),
      payload: () => debtExtras(),
    },
    {
      part: "balance",
      icon: Receipt,
      image: creditCardsIcon,
      title: "Enter the current balances for the selected items.",
      description: "Enter the total amount owed for each item selected.",
      render: () => (
        <div className="space-y-2">
          {selectedDebtKeys.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[1fr_120px] gap-2 items-center">
              <span className="text-xs text-[#D7E6FF]">{label}</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#D7E6FF]">$</span>
                <Input value={debts[key] ?? ""} onChange={(e) => setDebts((d) => ({ ...d, [key]: e.target.value }))} type="number" min="0" className="h-8 pl-6 text-sm" />
              </div>
            </div>
          ))}
        </div>
      ),
      payload: () => debtExtras(),
    },
    {
      part: "balance",
      icon: Wallet,
      image: walletIcon,
      title: "Have you put personal money into the business?",
      description: "",
      render: () => <YesNoToggle value={ownerContributed} onChange={setOwnerContributed} />,
      payload: () => debtExtras({ owner_contributed: ownerContributed }),
    },
    {
      part: "balance",
      icon: DollarSign,
      image: walletIcon,
      title: "How much did you contribute and when?",
      description: "Enter total contributions and the most recent date.",
      render: () => (
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D7E6FF]">$</span>
            <Input value={ownerContributionAmount} onChange={(e) => setOwnerContributionAmount(e.target.value)} type="number" min="0" className="h-12 pl-8 text-lg" />
          </div>
          <Input value={ownerContributionDate} onChange={(e) => setOwnerContributionDate(e.target.value)} type="date" className="h-12 text-sm" />
        </div>
      ),
      payload: () => debtExtras({ owner_contribution_amount: parseFloat(ownerContributionAmount) || 0, owner_contribution_date: ownerContributionDate || null }),
    },
    {
      part: "balance",
      icon: TrendingUp,
      title: "Have you taken money out of the business for personal use?",
      description: "Examples: Owner draws, distributions, personal expenses.",
      visual: () => (
        <div className="flex justify-center">
          <div className="h-24 w-36 rounded-lg bg-[#123056] flex items-center justify-center text-[#78C94D] text-5xl font-bold">↕</div>
        </div>
      ),
      render: () => <YesNoToggle value={ownerDraws} onChange={setOwnerDraws} />,
      payload: () => debtExtras({ owner_draws: ownerDraws, additional_balance_sheet_categories: additionalCategories }),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [
    homeOfficeType, totalHouseArea, homeBusinessPct, vehiclePct, phonePct, internetPct,
    utilityPct, majorEquipment, equipmentCost, hasReceivables, hasInventory, debts,
    selectedDebtKeys, ownerContributed, ownerContributionAmount, ownerContributionDate,
    ownerDraws, additionalCategories,
  ]);

  const STEPS = useMemo(() => [...BUSINESS_STEPS, ...BALANCE_STEPS], [BUSINESS_STEPS, BALANCE_STEPS]);
  const BUSINESS_STEP_COUNT = BUSINESS_STEPS.length;
  const BALANCE_STEP_COUNT = BALANCE_STEPS.length;
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
  const CurrentIcon = current?.icon;
  const currentPartIndex = current?.part === "balance" ? step - BUSINESS_STEP_COUNT : step;
  const currentPartTotal = current?.part === "balance" ? BALANCE_STEP_COUNT : BUSINESS_STEP_COUNT;
  const progressPct = current ? ((currentPartIndex + 1) / currentPartTotal) * 100 : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] p-0 overflow-hidden border-white/80 bg-[#06172b] gap-0 text-[#EAF2FF] rounded-2xl">
        <div className="border-b border-white/20 px-4 py-4">
          <h2 className="text-lg font-bold text-white">Business Survey</h2>
        </div>
        <div className="p-5 max-h-[78vh] overflow-y-auto bg-[#0d2a4f]">
          {current ? (
            <div className={cn("flex flex-col", current.part === "business" ? "min-h-[620px]" : "min-h-[560px]")}>
              {current.part === "business" ? (
                <>
                  <h3 className="text-2xl font-bold text-white">Business Survey</h3>
                  <div className="mt-5 flex items-center gap-2 text-[#FFC72B] font-bold">
                    <Flag className="h-4 w-4 fill-[#FFC72B]" />
                    <span>Step {currentPartIndex + 1} of {BUSINESS_STEP_COUNT}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-14 rounded-full bg-[#FFC72B]" />
                  <div className="mt-5 rounded-xl border border-[#3b577d] bg-[#203750] p-4 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-[#FFC72B]/15 text-[#FFC72B] flex items-center justify-center shrink-0">
                      {CurrentIcon && <CurrentIcon className="h-7 w-7" />}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{current.title}</h4>
                      <p className="text-sm font-semibold text-white">{current.description}</p>
                    </div>
                  </div>
                  <div className="mt-5">{current.render()}</div>
                </>
              ) : (
                <>
                  <h3 className="text-2xl font-bold text-white">Balance Sheet Questionnaire</h3>
                  <div className="mt-2 flex items-center gap-2 text-[#FFC72B] font-bold">
                    <Flag className="h-4 w-4 fill-[#FFC72B]" />
                    <span>Question {currentPartIndex + 1} of {BALANCE_STEP_COUNT}</span>
                  </div>
                  <div className="mt-5 flex items-start gap-4 mb-5">
                    <div className="h-10 w-10 rounded-full bg-[#2F6FDB] flex items-center justify-center text-lg font-bold text-white shadow-[0_0_16px_rgba(47,111,219,0.55)] shrink-0">
                      {currentPartIndex + 1}
                    </div>
                    <h3 className="text-[20px] font-bold leading-tight text-white">{current.title}</h3>
                  </div>

                  <div className="min-h-[135px] flex items-center justify-center mb-5">
                    {current.visual ? (
                      <div className="w-full [&_img]:drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)]">
                        {current.visual()}
                      </div>
                    ) : current.image ? (
                      <img src={current.image} alt="" className="h-[118px] w-[160px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)]" />
                    ) : (
                      <div className="h-[118px] w-[160px] rounded-lg bg-[#102c52] border border-[#2C5A91] flex items-center justify-center">
                        {CurrentIcon && <CurrentIcon className="h-14 w-14 text-[#7FB4FF]" />}
                      </div>
                    )}
                  </div>

                  {current.description && (
                    <p className="text-[12px] leading-snug text-[#D7E6FF] text-center mb-4">{current.description}</p>
                  )}

                  {current.example && (
                    <p className="text-[12px] leading-snug text-[#D7E6FF] mb-4">{current.example}</p>
                  )}

                  <div className="[&_input]:bg-[#031327] [&_input]:border-[#274a77] [&_input]:text-[#EAF2FF] [&_input]:placeholder:text-[#7993ba]">
                    {current.render()}
                  </div>
                </>
              )}

              <div className="mt-auto pt-7">
                <div className="text-xs text-white mb-2">{currentPartIndex + 1} of {currentPartTotal}</div>
                <div className="h-2 rounded-full bg-[#1c3c66] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#78C94D] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#203f6c] bg-[#06172b] flex flex-col items-center text-center py-10 px-6">
              <div className="h-32 w-32 flex items-center justify-center mb-4">
                <img src={trophyIcon} alt="" className="h-32 w-32 object-contain drop-shadow-lg" />
              </div>
              <p className="text-2xl font-bold mb-1 flex items-center gap-2 text-[#FFC72B]">
                Great Job! <Sparkles className="h-5 w-5" />
              </p>
              <p className="text-sm text-[#D7E6FF] max-w-md">
                Your business profile is saved. This helps our AI generate personalized tax
                strategies, accurate deductions, and a more complete financial picture.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#18375e] px-5 py-4 bg-[#031327]">
          <Button size="sm" variant="ghost" onClick={goBack} className="gap-1 text-[#D7E6FF] hover:text-white hover:bg-[#102c52] px-2">
            {step === 0 ? "Cancel" : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </Button>
          <div className="flex gap-2">
            {current && (
              <Button size="sm" variant="outline" onClick={advance} className="border-[#274a77] bg-transparent text-[#D7E6FF] hover:bg-[#102c52] hover:text-white px-2">Skip</Button>
            )}
            <Button size="sm" onClick={current ? saveAndAdvance : () => onOpenChange(false)} disabled={saving} className="gap-1.5 bg-[#FFC72B] text-[#031327] hover:bg-[#ffd95e] px-3">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {current ? (step === TOTAL_STEPS - 1 ? "Finish" : "Next") : "Done"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
