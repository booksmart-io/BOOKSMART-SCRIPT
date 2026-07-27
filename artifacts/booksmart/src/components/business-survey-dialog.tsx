import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
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
import {
  CompletionCard,
  QuestionnaireNavigation,
  QuestionProgress,
  QuestionStage,
  SelectionIndicator,
} from "@/components/survey-questionnaire-ui";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSurveyProgress } from "@/hooks/use-survey-progress";
import {
  QUESTIONS,
  PRIMARY_WORK_LOCATION_OPTIONS,
  acquireSurveySaveLock,
  isApplicable,
  meaningfulAnswer,
  persistSurveyQuestionInOrder,
  progressAfterQuestionAnswer,
  progressAfterQuestionSkip,
  questionsForStep,
  releaseSurveySaveLock,
  type ProgressState,
} from "@/lib/survey-progress";
import {
  SURVEY_SECTIONS,
  applicableSurveyCompletion,
  questionsForSection,
  sectionIndexForStep,
} from "@/lib/survey-sections";
import houseIcon from "@/assets/survey-icons/house.png";
import buildingIcon from "@/assets/survey-icons/building.png";
import carIcon from "@/assets/survey-icons/car.png";
import phoneIcon from "@/assets/survey-icons/phone.png";
import wifiIcon from "@/assets/survey-icons/wifi.png";
import lightbulbIcon from "@/assets/survey-icons/lightbulb.png";
import equipmentIcon from "@/assets/survey-icons/equipment.png";
import invoiceIcon from "@/assets/survey-icons/invoice.png";
import packageIcon from "@/assets/survey-icons/package.png";
import walletIcon from "@/assets/survey-icons/wallet.png";
import trophyIcon from "@/assets/survey-icons/trophy.png";
import cashIcon from "@/assets/survey-icons/cash.png";
import completeIcon from "@/assets/survey-icons/complete.png";
import folderIcon from "@/assets/survey-icons/folder.png";
import reportIcon from "@/assets/survey-icons/report.png";

// ─── Options ─────────────────────────────────────────────────────────────────
const FILING_STATUS = ["Single","Married Filing Jointly","Married Filing Separately","Head of Household","Qualifying Surviving Spouse"];
const RESIDENCY_STATUS = ["US Citizen","Resident Alien","Non-Resident Alien","Dual-Status Alien"];
const INCOME_TYPES = ["W2 Employee","1099 Contractor (Freelance)","Single-Member LLC","Multi-Member LLC","S-Corp Owner","C-Corp Owner","Trust/Estate"];
const PASSIVE_INCOME = ["Dividend Income","Capital Gains (Stocks)","Cryptocurrency/Defi","Rental Income","Royalties","Oil/Gas Rights"];
const TEAM_STRUCTURE = ["Solo Operator","Hire 1099 Contractors","W2 Employees","Employ Spouse","Employ Children (under 18)","No Help"];
const ACCOUNTING_METHOD = ["Cash Basis (Standard)","Accrual Basis","Not Sure"];
const BUSINESS_ACTIVITY = ["Products","Services","Both products and services","Other"];
const ISSUES_1099S = ["Yes","No","Not sure"];
const ACCOUNTING_SOFTWARE = ["QuickBooks","Xero","Wave","FreshBooks","Zoho","Sage","Other","None"];
const BUSINESS_GOALS = [
  "Improve bookkeeping and recordkeeping","Improve cash flow","Build a budget","Reduce taxes",
  "Prepare for funding","Build business credit","Improve financial forecasting","Grow or expand the business",
];
const FUNDING_INTEREST = ["Yes","No","Maybe / exploring options"];
const FUNDING_PURPOSES = [
  "Working capital","Equipment","Vehicle","Commercial property","Expansion","Startup costs",
  "Inventory","Refinance existing debt","Other",
];
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
  business_activity_model: string | null;
  issues_1099s: string | null;
  accounting_software: string | null;
  business_goals: string[] | null;
  funding_interest: string | null;
  funding_purposes: string[] | null;
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
  equipment_current_value: number | null;
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
      data-selected={selected}
      onClick={onToggle}
      className={cn(
        "survey-answer-option flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-[#2F8A24] text-white border-[#60C14F] shadow-[0_0_18px_rgba(96,193,79,0.18)]"
          : "bg-[#04172a] text-[#D7E6FF] border-[#2b4059] hover:border-[#60C14F]/70"
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
      data-selected={selected}
      onClick={onToggle}
      className={cn(
        "survey-answer-option flex min-h-11 w-full min-w-0 items-center gap-3 rounded-md border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-[#60C14F] bg-[#2F8A24] shadow-[0_0_18px_rgba(96,193,79,0.18)]"
          : "border-[#2b4059] bg-[#04172a] hover:border-[#60C14F]/70"
      )}
    >
      <SelectionIndicator selected={selected} />
      <span className={cn("min-w-0 break-words text-sm font-medium", selected ? "text-white" : "text-[#EAF2FF]")}>
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
  image,
  title,
  description,
  example,
  children,
}: {
  icon: React.ElementType;
  image?: string;
  title: string;
  description: string;
  example?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[#2b4059] bg-[#001426] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4">
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 rounded-xl bg-[#061f38] text-[#FFC72B] flex items-center justify-center shrink-0 overflow-visible">
          {image
            ? <img src={image} alt="" aria-hidden="true" className="h-14 w-14 object-contain" />
            : <Icon className="h-6 w-6" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h4 className="break-words text-[17px] font-bold leading-tight text-white">{title}</h4>
          {description && <p className="mt-1 break-words text-[12px] leading-relaxed text-[#c3d0df]">{description}</p>}
        </div>
      </div>
      {example && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#9a8b41] px-3 py-2 text-[12px] text-[#06172b]">
          <Lightbulb className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{example}</span>
        </div>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function questionCardsIn(node: React.ReactNode): React.ReactElement[] {
  if (!isValidElement(node)) return [];
  if (node.type === SurveyQuestionCard) return [node];
  return Children.toArray((node.props as { children?: React.ReactNode }).children)
    .flatMap(questionCardsIn);
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
    <div className="flex flex-wrap justify-center gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          data-selected={selected === option}
          onClick={() => onChange(option)}
          className={cn(
            "survey-answer-option min-h-11 min-w-0 break-words rounded-full border px-4 py-2 text-sm font-bold transition-all",
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
      <SelectTrigger className="h-11 min-w-0 border-[#274a77] bg-[#07182c] text-white">
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
  const [questionInSection, setQuestionInSection] = useState(0);
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
  const [businessActivity, setBusinessActivity] = useState<string | null>(null);
  const [issues1099s, setIssues1099s] = useState<string | null>(null);
  const [accountingSoftware, setAccountingSoftware] = useState<string | null>(null);
  const [businessGoals, setBusinessGoals] = useState<string[]>([]);
  const [fundingInterest, setFundingInterest] = useState<string | null>(null);
  const [fundingPurposes, setFundingPurposes] = useState<string[]>([]);

  // Vehicle
  const [vehicleOwnership, setVehicleOwnership] = useState<string | null>(null);
  const [vehicleUsage, setVehicleUsage] = useState<string | null>(null);
  const [vehicleOver6k, setVehicleOver6k] = useState<boolean | null>(null);
  const [vehiclePct, setVehiclePct] = useState(100);
  const [balanceVehiclePct, setBalanceVehiclePct] = useState(100);

  // Workspace
  const [homeOfficeType, setHomeOfficeType] = useState<string | null>(null);
  const [primaryWorkLocation, setPrimaryWorkLocation] = useState<string | null>(null);
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
  const [balanceUtilityPct, setBalanceUtilityPct] = useState(100);
  const [mealPct, setMealPct] = useState(100);
  const [homeBusinessPct, setHomeBusinessPct] = useState(10);
  const [homeAllocationPct, setHomeAllocationPct] = useState(10);
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
  const [equipmentCurrentValue, setEquipmentCurrentValue] = useState("0");
  const [balanceEquipmentOwnership, setBalanceEquipmentOwnership] = useState<boolean | null>(null);
  const [debts, setDebts] = useState<Record<string, string>>({});
  const [hasDebt, setHasDebt] = useState<boolean | null>(null);
  const [surveyAnswerValues, setSurveyAnswerValues] = useState<Record<string, unknown>>({});
  const [touchedQuestionKeys, setTouchedQuestionKeys] = useState<Set<string>>(new Set());
  const saveInFlight = useRef(false);
  const resumeApplied = useRef(false);
  const resumeOrgId = useRef<number | null>(null);

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
          "business_activity_model","issues_1099s","accounting_software",
          "business_goals","funding_interest","funding_purposes",
          "vehicle_ownership","vehicle_usage","vehicle_over_6k_lbs",
          "home_office_type","home_status","tech_usage",
          "real_estate_interests","hosts_business_meetings",
          "health_insurance","health_savings","family_education",
          "tax_goal","retirement_current","audit_appetite",
          "total_house_area_sqft","dedicated_office_area_sqft",
          "business_vehicle_percent","business_utility_percent","business_meal_percent",
          "equipment_cost","debts",
          "equipment_current_value",
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
    setBusinessActivity(orgData.business_activity_model);
    setIssues1099s(orgData.issues_1099s);
    setAccountingSoftware(orgData.accounting_software);
    setBusinessGoals(orgData.business_goals ?? []);
    setFundingInterest(orgData.funding_interest);
    setFundingPurposes(orgData.funding_purposes ?? []);
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
      const savedHomePercent = Math.round((orgData.dedicated_office_area_sqft / orgData.total_house_area_sqft) * 100);
      setHomeBusinessPct(savedHomePercent);
      setHomeAllocationPct(savedHomePercent);
    }
    setVehiclePct(orgData.business_vehicle_percent ?? 100);
    setBalanceVehiclePct(orgData.business_vehicle_percent ?? 100);
    setUtilityPct(orgData.business_utility_percent ?? 100);
    setBalanceUtilityPct(orgData.business_utility_percent ?? 100);
    setMealPct(orgData.business_meal_percent ?? 100);
    setEquipmentCost(orgData.equipment_cost?.toString() ?? "0");
    setEquipmentCurrentValue(orgData.equipment_current_value?.toString() ?? "0");
    const rawDebts = orgData.debts ?? {};
    const savedSurveyValues = rawDebts.survey_answer_values && typeof rawDebts.survey_answer_values === "object"
      ? rawDebts.survey_answer_values as Record<string, unknown>
      : {};
    setSurveyAnswerValues(savedSurveyValues);
    const persistedQuestionKeys = new Set<string>();
    const savedNumber = (key: string, fallback: number) => {
      const saved = savedSurveyValues[key];
      if (typeof saved === "number" && Number.isFinite(saved)) {
        persistedQuestionKeys.add(key);
        return saved;
      }
      return fallback;
    };
    setHomeBusinessPct((current) => savedNumber("workspace.home_business_use_percent", current));
    setVehiclePct((current) => savedNumber("vehicle.business_use_percent", current));
    setUtilityPct((current) => savedNumber("workspace.utility_business_use_percent", current));
    setHomeAllocationPct((current) => savedNumber("workspace.home_allocation_percent", current));
    setBalanceVehiclePct((current) => savedNumber("vehicle.balance_business_use_percent", current));
    setBalanceUtilityPct((current) => savedNumber("workspace.balance_utility_percent", current));
    if (persistedQuestionKeys.size) {
      setTouchedQuestionKeys((keys) => new Set([...keys, ...persistedQuestionKeys]));
    }
    const savedWorkLocation = typeof rawDebts.primary_work_location === "string"
      ? rawDebts.primary_work_location
      : PRIMARY_WORK_LOCATION_OPTIONS.includes((orgData.home_office_type ?? "") as typeof PRIMARY_WORK_LOCATION_OPTIONS[number])
        ? orgData.home_office_type
        : null;
    setPrimaryWorkLocation(savedWorkLocation);
    setBalanceEquipmentOwnership(
      typeof rawDebts.balance_equipment_ownership === "boolean"
        ? rawDebts.balance_equipment_ownership
        : orgData.major_equipment,
    );
    const strDebts: Record<string, string> = {};
    for (const k of DEBT_CATEGORIES.map((d) => d.key)) {
      strDebts[k] = rawDebts[k]?.toString() ?? "";
    }
    const selectedLiabilities = Array.isArray(rawDebts.selected_liability_keys)
      ? rawDebts.selected_liability_keys as string[]
      : [];
    for (const key of selectedLiabilities) strDebts[`__${key}_selected`] = "1";
    setDebts(strDebts);
    setHasDebt(typeof rawDebts.has_debt === "boolean" ? rawDebts.has_debt : (selectedLiabilities.length > 0 ? true : null));
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

  const selectedDebtKeys = DEBT_CATEGORIES.filter(({ key }) => (debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1");
  const surveyAnswers = useMemo<Record<string, unknown>>(() => ({
    "tax.filing_status": filingStatus,
    "tax.primary_business_state": primaryState,
    "tax.residency_status": residencyStatus,
    "tax.multi_state_activity": multiState,
    "income.primary_types": incomeTypes,
    "income.passive_types": passiveIncome,
    "business.activity_model": businessActivity,
    "tax.issues_1099s": issues1099s,
    "accounting.software": accountingSoftware,
    "strategy.business_goals": businessGoals,
    "funding.interest": fundingInterest,
    "funding.purposes": fundingPurposes,
    "team.structure": teamStructure,
    "accounting.method": accountingMethod,
    "equipment.ownership": majorEquipment,
    "vehicle.ownership": vehicleOwnership,
    "vehicle.deduction_method": vehicleUsage,
    "vehicle.over_6000_lbs": vehicleOver6k,
    "workspace.home_office_type": homeOfficeType,
    "workspace.home_status": homeStatus,
    "workspace.tech_usage": techUsage,
    "property.interests": realEstate,
    "property.hosts_home_meetings": hostsMeetings,
    "health.insurance": healthInsurance,
    "health.savings": healthSavings,
    "family.education_support": familyEducation,
    "strategy.tax_goal": taxGoal,
    "strategy.retirement": retirementCurrent,
    "strategy.audit_appetite": auditAppetite,
    "workspace.home_business_use_percent": touchedQuestionKeys.has("workspace.home_business_use_percent") ? homeBusinessPct : null,
    "vehicle.business_use_percent": touchedQuestionKeys.has("vehicle.business_use_percent") ? vehiclePct : null,
    "workspace.utility_business_use_percent": touchedQuestionKeys.has("workspace.utility_business_use_percent") ? utilityPct : null,
    "equipment.spending_this_year": equipmentCost === "" ? null : Number(equipmentCost),
    "liabilities.selected": hasDebt === false ? [] : selectedDebtKeys.map(({ key }) => key),
    "workspace.primary_work_location": primaryWorkLocation,
    "workspace.total_home_sqft": Number(totalHouseArea),
    "workspace.home_allocation_percent": touchedQuestionKeys.has("workspace.home_allocation_percent") ? homeAllocationPct : null,
    "vehicle.balance_business_use_percent": touchedQuestionKeys.has("vehicle.balance_business_use_percent") ? balanceVehiclePct : null,
    "workspace.phone_business_use_percent": touchedQuestionKeys.has("workspace.phone_business_use_percent") ? phonePct : null,
    "workspace.internet_business_use_percent": touchedQuestionKeys.has("workspace.internet_business_use_percent") ? internetPct : null,
    "workspace.balance_utility_percent": touchedQuestionKeys.has("workspace.balance_utility_percent") ? balanceUtilityPct : null,
    "equipment.balance_ownership": balanceEquipmentOwnership,
    "equipment.current_value": equipmentCurrentValue === "" ? null : Number(equipmentCurrentValue),
    "assets.has_receivables": hasReceivables,
    "assets.has_inventory": hasInventory,
    "liabilities.has_debt": hasDebt,
    "liabilities.balances": Object.fromEntries(selectedDebtKeys.map(({ key }) => [key, Number(debts[key]) || 0])),
    "equity.owner_contributed": ownerContributed,
    "equity.owner_contribution_details": ownerContributionAmount || ownerContributionDate
      ? { amount: Number(ownerContributionAmount) || 0, date: ownerContributionDate || null }
      : null,
    "equity.owner_draws": ownerDraws,
    "__persisted_question_keys": Object.keys(surveyAnswerValues),
  }), [
    filingStatus, primaryState, residencyStatus, multiState, incomeTypes, passiveIncome,
    businessActivity, issues1099s, accountingSoftware, businessGoals, fundingInterest,
    fundingPurposes, teamStructure, accountingMethod, majorEquipment, vehicleOwnership, vehicleUsage,
    vehicleOver6k, homeOfficeType, homeStatus, techUsage, realEstate, hostsMeetings,
    healthInsurance, healthSavings, familyEducation, taxGoal, retirementCurrent,
    auditAppetite, homeBusinessPct, homeAllocationPct, vehiclePct, balanceVehiclePct,
    utilityPct, balanceUtilityPct, equipmentCost, primaryWorkLocation, balanceEquipmentOwnership,
    selectedDebtKeys, totalHouseArea, phonePct, internetPct, equipmentCurrentValue,
    hasReceivables, hasInventory, debts, ownerContributed, ownerContributionAmount,
    ownerContributionDate, ownerDraws, touchedQuestionKeys, hasDebt, surveyAnswerValues,
  ]);
  const surveyProgress = useSurveyProgress(orgId, open, !!orgData, surveyAnswers);

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
    return {
      debts: {
        ...(orgData?.debts ?? {}),
        ...numericDebts,
        selected_liability_keys: selectedDebtKeys.map(({ key }) => key),
        has_debt: hasDebt,
        ...(Object.keys(surveyAnswerValues).length ? { survey_answer_values: surveyAnswerValues } : {}),
        ...extra,
      },
    };
  };

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
            <div className="flex justify-center gap-3">
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
      title: "Business Profile and Goals",
      description: "Tell us what the business does and what you want to accomplish next.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Package} title="What does your business primarily sell?" description="Choose the option that best describes your primary business activity.">
            <PillGroup options={BUSINESS_ACTIVITY} selected={businessActivity} multi={false} onChange={(v) => setBusinessActivity(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Receipt} title="Do you make payments that may require Forms 1099?" description="This refers to potentially reportable payments and is separate from simply having independent contractors.">
            <PillGroup options={ISSUES_1099S} selected={issues1099s} multi={false} onChange={(v) => setIssues1099s(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Calculator} title="Which accounting software do you currently use?" description="This is separate from the accounting method your business uses.">
            <PillGroup options={ACCOUNTING_SOFTWARE} selected={accountingSoftware} multi={false} onChange={(v) => setAccountingSoftware(v as string)} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Target} title="What are your main business goals right now?" description="Select all that apply. Your tax goal remains a separate preference.">
            <PillGroup options={BUSINESS_GOALS} selected={businessGoals} multi onChange={(v) => setBusinessGoals(v as string[])} />
          </SurveyQuestionCard>
          <SurveyQuestionCard icon={Landmark} title="Are you interested in capital for your business?" description="Tell us whether business funding is currently relevant to you.">
            <PillGroup options={FUNDING_INTEREST} selected={fundingInterest} multi={false} onChange={(v) => {
              setFundingInterest(v as string);
            }} />
          </SurveyQuestionCard>
          {(fundingInterest === "Yes" || fundingInterest === "Maybe / exploring options") && (
            <SurveyQuestionCard icon={Wallet} title="What would you use the funding for?" description="Select all uses that apply.">
              <PillGroup options={FUNDING_PURPOSES} selected={fundingPurposes} multi onChange={(v) => setFundingPurposes(v as string[])} />
            </SurveyQuestionCard>
          )}
        </div>
      ),
      payload: () => ({
        business_activity_model: businessActivity,
        issues_1099s: issues1099s,
        accounting_software: accountingSoftware,
        business_goals: businessGoals,
        funding_interest: fundingInterest,
        ...((fundingInterest === "Yes" || fundingInterest === "Maybe / exploring options")
          ? { funding_purposes: fundingPurposes }
          : {}),
      }),
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
          {vehicleOwnership && vehicleOwnership !== "No Business Vehicle" && (
            <>
              <SurveyQuestionCard icon={Route} title="How do you track vehicle deductions?" description="Example: Standard Mileage Rate if you track business miles.">
                <PillGroup options={VEHICLE_USAGE} selected={vehicleUsage} multi={false} onChange={(v) => setVehicleUsage(v as string)} />
              </SurveyQuestionCard>
              <SurveyQuestionCard icon={Truck} title="Is the vehicle over 6,000 lbs?" description="Heavy vehicles can qualify for different depreciation rules.">
                <div className="flex justify-center gap-3">
                  <Button type="button" variant={vehicleOver6k === true ? "default" : "outline"} onClick={() => setVehicleOver6k(true)} className="min-w-20">Yes</Button>
                  <Button type="button" variant={vehicleOver6k === false ? "default" : "outline"} onClick={() => setVehicleOver6k(false)} className="min-w-20">No</Button>
                </div>
              </SurveyQuestionCard>
            </>
          )}
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
          {(homeOfficeType === "Dedicated Room (Exclusive Use)" || homeOfficeType === "Shared Space (Non-Exclusive)") && (
            <SurveyQuestionCard icon={Building} title="What is your home status?" description="This helps estimate home-office treatment correctly.">
              <PillGroup options={HOME_STATUS} selected={homeStatus} multi={false} onChange={(v) => setHomeStatus(v as string)} />
            </SurveyQuestionCard>
          )}
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
          {(homeOfficeType === "Dedicated Room (Exclusive Use)" || homeOfficeType === "Shared Space (Non-Exclusive)") && <SurveyQuestionCard icon={Handshake} title="Do you host business meetings or corporate minutes at home?" description="Example: Renting your home to your business for board meetings.">
            <div className="flex justify-center gap-3">
              <Button type="button" variant={hostsMeetings === true ? "default" : "outline"} onClick={() => setHostsMeetings(true)} className="min-w-20">Yes</Button>
              <Button type="button" variant={hostsMeetings === false ? "default" : "outline"} onClick={() => setHostsMeetings(false)} className="min-w-20">No</Button>
            </div>
          </SurveyQuestionCard>}
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
      icon: ClipboardList,
      title: "Equipment",
      description: "Capture business equipment ownership and spending.",
      render: () => (
        <div className="space-y-4">
          <SurveyQuestionCard icon={Wrench} title="Do you own business equipment?" description="Examples include computers, tools, furniture, hardware, and machinery.">
            <div className="flex justify-center gap-3">
              <Button type="button" variant={majorEquipment === true ? "default" : "outline"} onClick={() => setMajorEquipment(true)} className="min-w-20">Yes</Button>
              <Button type="button" variant={majorEquipment === false ? "default" : "outline"} onClick={() => setMajorEquipment(false)} className="min-w-20">No</Button>
            </div>
          </SurveyQuestionCard>
          {majorEquipment === true && <SurveyQuestionCard icon={DollarSign} title="How much did you spend on business equipment this year?" description="Enter the total cost of equipment, tools, hardware, or machinery bought for business use.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D7E6FF]">$</span>
              <Input value={equipmentCost} onChange={(e) => { setEquipmentCost(e.target.value); setTouchedQuestionKeys((keys) => new Set(keys).add("equipment.spending_this_year")); }} type="number" min="0" className="h-11 pl-8" />
            </div>
          </SurveyQuestionCard>}
        </div>
      ),
      payload: () => ({ major_equipment: majorEquipment, equipment_cost: parseFloat(equipmentCost) || 0 }),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [
    filingStatus, primaryState, residencyStatus, multiState, incomeTypes, industryNiche,
    passiveIncome, businessActivity, issues1099s, accountingSoftware, businessGoals,
    fundingInterest, fundingPurposes, teamStructure, accountingMethod, majorEquipment, vehicleOwnership,
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
      render: () => <PillGroup options={[...PRIMARY_WORK_LOCATION_OPTIONS]} selected={primaryWorkLocation} multi={false} onChange={(v) => setPrimaryWorkLocation(v as string)} />,
      payload: () => debtExtras({ primary_work_location: primaryWorkLocation }),
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
          <Input value={totalHouseArea} onChange={(e) => { setTotalHouseArea(e.target.value); setTouchedQuestionKeys((keys) => new Set(keys).add("workspace.total_home_sqft")); }} type="number" min="0" className="h-12 pr-14 text-lg" />
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
      render: () => <PercentSlider value={homeAllocationPct} onChange={(value) => { setHomeAllocationPct(value); setTouchedQuestionKeys((keys) => new Set(keys).add("workspace.home_allocation_percent")); }} />,
      payload: () => {
        const totalArea = parseFloat(totalHouseArea) || 0;
        return { dedicated_office_area_sqft: totalArea > 0 ? Math.round(totalArea * (homeAllocationPct / 100)) : null };
      },
    },
    {
      part: "balance",
      icon: Car,
      image: carIcon,
      title: "How much of your vehicle use is for business?",
      description: "Include trips to customers, job sites, suppliers, and business meetings.",
      render: () => <PercentSlider value={balanceVehiclePct} onChange={(value) => { setBalanceVehiclePct(value); setTouchedQuestionKeys((keys) => new Set(keys).add("vehicle.balance_business_use_percent")); }} />,
      payload: () => ({ business_vehicle_percent: Math.round(balanceVehiclePct) }),
    },
    {
      part: "balance",
      icon: Laptop,
      image: phoneIcon,
      title: "What percentage of your phone service is used for business?",
      description: "Include calls, texts, email, scheduling, and business apps.",
      render: () => <PercentSlider value={phonePct} onChange={(value) => { setPhonePct(value); setTouchedQuestionKeys((keys) => new Set(keys).add("workspace.phone_business_use_percent")); }} />,
      payload: () => debtExtras({ phone_business_percent: Math.round(phonePct) }),
    },
    {
      part: "balance",
      icon: Globe2,
      image: wifiIcon,
      title: "What percentage of your internet service is used for business?",
      description: "Include email, bookkeeping, online meetings, research, and other business activities.",
      render: () => <PercentSlider value={internetPct} onChange={(value) => { setInternetPct(value); setTouchedQuestionKeys((keys) => new Set(keys).add("workspace.internet_business_use_percent")); }} />,
      payload: () => debtExtras({ internet_business_percent: Math.round(internetPct) }),
    },
    {
      part: "balance",
      icon: Lightbulb,
      image: lightbulbIcon,
      title: "What percentage of your household utilities support your business activities?",
      description: "Includes electricity, water, gas, trash and other household utilities.",
      render: () => <PercentSlider value={balanceUtilityPct} onChange={(value) => { setBalanceUtilityPct(value); setTouchedQuestionKeys((keys) => new Set(keys).add("workspace.balance_utility_percent")); }} />,
      payload: () => ({ business_utility_percent: Math.round(balanceUtilityPct) }),
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
          <Input
            value={equipmentCurrentValue}
            onChange={(e) => {
              setEquipmentCurrentValue(e.target.value);
              setTouchedQuestionKeys((keys) => new Set(keys).add("equipment.current_value"));
            }}
            type="number"
            min="0"
            className="h-12 pl-8 text-lg"
          />
        </div>
      ),
      payload: () => ({ equipment_current_value: parseFloat(equipmentCurrentValue) || null }),
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
      image: cashIcon,
      title: "Does your business owe money to anyone?",
      description: "Choose Yes if the business currently has any debts or liabilities.",
      render: () => <YesNoToggle value={hasDebt} onChange={(value) => {
        setHasDebt(value);
        if (value === false) setDebts({});
      }} />,
      payload: () => debtExtras(),
    },
    {
      part: "balance",
      icon: CreditCard,
      image: cashIcon,
      title: "Which business debts or liabilities do you have?",
      description: "Select every type that currently applies.",
      render: () => (
        <div className="grid grid-cols-1 gap-2">
          {DEBT_CATEGORIES.map(({ key, label }) => (
            <ChoicePill
              key={key}
              label={label}
              selected={(debts[key] ?? "") !== "" || debts[`__${key}_selected`] === "1"}
              onToggle={() => {
                setTouchedQuestionKeys((keys) => new Set(keys).add("liabilities.selected"));
                setDebts((currentDebts) => {
                  const selected = (currentDebts[key] ?? "") !== "" || currentDebts[`__${key}_selected`] === "1";
                  const next = { ...currentDebts };
                  if (selected) {
                    delete next[key];
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
      payload: () => debtExtras(),
    },
    {
      part: "balance",
      icon: Receipt,
      image: cashIcon,
      title: "Enter the current balances for the selected items.",
      description: "Enter the total amount owed for each item selected.",
      render: () => (
        <div className="space-y-2">
          {selectedDebtKeys.map(({ key, label }) => (
            <div key={key} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
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
      image: cashIcon,
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
      image: cashIcon,
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
    primaryWorkLocation, totalHouseArea, homeAllocationPct, balanceVehiclePct, phonePct, internetPct,
    balanceUtilityPct, balanceEquipmentOwnership, equipmentCurrentValue, hasReceivables, hasInventory, debts, hasDebt,
    selectedDebtKeys, ownerContributed, ownerContributionAmount, ownerContributionDate,
    ownerDraws, additionalCategories,
  ]);

  const SOURCE_BY_STEP = useMemo(() => {
    const businessKeys = [
      "business.legal_tax", "business.income", "business.phase1_profile", "business.people_accounting",
      "business.vehicle", "business.workspace", "business.real_estate", "business.health_family",
      "business.strategy", "business.equipment_debts",
    ];
    const balanceKeys = [
      "balance.work_location", "balance.home_sqft", "balance.home_percent", "balance.vehicle_percent",
      "balance.phone_percent", "balance.internet_percent", "balance.utility_percent", "balance.equipment_value",
      "balance.receivables", "balance.inventory", "balance.debt_presence", "balance.debt_types",
      "balance.debt_balances", "balance.owner_contribution", "balance.owner_contribution_details", "balance.owner_draws",
    ];
    return new globalThis.Map<string, StepDef>([
      ...businessKeys.map((key, index) => [key, BUSINESS_STEPS[index]] as const),
      ...balanceKeys.map((key, index) => [key, BALANCE_STEPS[index]] as const),
    ]);
  }, [BUSINESS_STEPS, BALANCE_STEPS]);
  const SECTION_ICONS: Record<string, React.ElementType> = {
    "section.tax_basics": Gavel,
    "section.business_profile": ClipboardList,
    "section.team_accounting": Users,
    "section.workspace_property": Home,
    "section.vehicle": Car,
    "section.equipment_assets": Wrench,
    "section.debts_equity": CreditCard,
    "section.tax_strategy": Target,
  };
  const SECTION_IMAGES: Record<string, string> = {
    "section.tax_basics": reportIcon,
    "section.business_profile": folderIcon,
    "section.team_accounting": invoiceIcon,
    "section.workspace_property": houseIcon,
    "section.vehicle": carIcon,
    "section.equipment_assets": equipmentIcon,
    "section.debts_equity": cashIcon,
    "section.tax_strategy": completeIcon,
  };
  const STEPS: StepDef[] = useMemo(() => SURVEY_SECTIONS.map((section) => {
    const sourceEntries = section.stepKeys.flatMap((stepKey) => {
      const source = SOURCE_BY_STEP.get(stepKey);
      return source ? [{ stepKey, source }] : [];
    });
    return {
      part: "business" as const,
      icon: SECTION_ICONS[section.key] ?? ClipboardList,
      image: SECTION_IMAGES[section.key],
      title: section.title,
      description: section.description,
      render: () => (
        <div className="space-y-4">
          {sourceEntries.map(({ stepKey, source }) => {
            const questions = questionsForStep(stepKey);
            if (questions.length > 0 && questions.every((question) => !isApplicable(question, surveyAnswers))) {
              return null;
            }
            if (source.part === "business") {
              return <div key={stepKey}>{source.render()}</div>;
            }
            return (
              <SurveyQuestionCard
                key={stepKey}
                icon={source.icon}
                image={source.image}
                title={source.title}
                description={source.description}
                example={source.example}
              >
                {source.render()}
              </SurveyQuestionCard>
            );
          })}
          {section.key === "section.vehicle" && vehicleOwnership === "No Business Vehicle" && (
            <div className="rounded-xl border border-[#5a7ca8] bg-[#07182c] p-4 text-sm text-[#D7E6FF]" role="status">
              No business vehicle — we’ll skip vehicle-related questions.
            </div>
          )}
          {section.key === "section.tax_basics" && (industryNiche || orgData?.industry) && (
            <div className="rounded-xl border border-[#3b577d] bg-[#203750] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9CB6D9]">Industry · Using your business profile</p>
              <p className="mt-1 font-bold text-white">{industryNiche || orgData?.industry}</p>
            </div>
          )}
        </div>
      ),
      payload: () => Object.assign({}, ...sourceEntries.map(({ source }) => source.payload())),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [SOURCE_BY_STEP, vehicleOwnership, industryNiche, orgData?.industry]);
  const TOTAL_STEPS = STEPS.length;
  const DEFAULT_SENSITIVE_KEYS = new Set([
    "workspace.home_business_use_percent",
    "vehicle.business_use_percent",
    "workspace.utility_business_use_percent",
    "workspace.home_allocation_percent",
    "vehicle.balance_business_use_percent",
    "workspace.phone_business_use_percent",
    "workspace.internet_business_use_percent",
    "workspace.balance_utility_percent",
    "equipment.spending_this_year",
    "equipment.current_value",
  ]);
  const QUESTION_PAYLOAD_FIELD: Record<string, string> = {
    "tax.filing_status": "filing_status",
    "tax.primary_business_state": "primary_state",
    "tax.residency_status": "residency_status",
    "tax.multi_state_activity": "multi_state_activity",
    "income.primary_types": "primary_income_types",
    "income.passive_types": "passive_income",
    "business.activity_model": "business_activity_model",
    "tax.issues_1099s": "issues_1099s",
    "accounting.software": "accounting_software",
    "strategy.business_goals": "business_goals",
    "funding.interest": "funding_interest",
    "funding.purposes": "funding_purposes",
    "team.structure": "team_structure",
    "accounting.method": "accounting_method",
    "equipment.ownership": "major_equipment",
    "vehicle.ownership": "vehicle_ownership",
    "vehicle.deduction_method": "vehicle_usage",
    "vehicle.over_6000_lbs": "vehicle_over_6k_lbs",
    "workspace.home_office_type": "home_office_type",
    "workspace.home_status": "home_status",
    "workspace.tech_usage": "tech_usage",
    "property.interests": "real_estate_interests",
    "property.hosts_home_meetings": "hosts_business_meetings",
    "health.insurance": "health_insurance",
    "health.savings": "health_savings",
    "family.education_support": "family_education",
    "strategy.tax_goal": "tax_goal",
    "strategy.retirement": "retirement_current",
    "strategy.audit_appetite": "audit_appetite",
    "workspace.home_business_use_percent": "dedicated_office_area_sqft",
    "vehicle.business_use_percent": "business_vehicle_percent",
    "workspace.utility_business_use_percent": "business_utility_percent",
    "equipment.spending_this_year": "equipment_cost",
    "workspace.total_home_sqft": "total_house_area_sqft",
    "workspace.home_allocation_percent": "dedicated_office_area_sqft",
    "vehicle.balance_business_use_percent": "business_vehicle_percent",
    "workspace.balance_utility_percent": "business_utility_percent",
    "equipment.current_value": "equipment_current_value",
  };
  const DEBT_QUESTION_KEYS = new Set([
    "liabilities.selected",
    "workspace.primary_work_location",
    "workspace.phone_business_use_percent",
    "workspace.internet_business_use_percent",
    "equipment.balance_ownership",
    "assets.has_receivables",
    "assets.has_inventory",
    "liabilities.has_debt",
    "liabilities.balances",
    "equity.owner_contributed",
    "equity.owner_contribution_details",
    "equity.owner_draws",
  ]);

  function payloadForQuestion(question: (typeof QUESTIONS)[number]) {
    if (question.key === "liabilities.selected") return debtExtras();
    const source = SOURCE_BY_STEP.get(question.stepKey);
    const sourcePayload = source?.payload() ?? {};
    if (DEBT_QUESTION_KEYS.has(question.key)) {
      return sourcePayload.debts ? { debts: sourcePayload.debts } : debtExtras();
    }
    const field = QUESTION_PAYLOAD_FIELD[question.key];
    const payload = field && Object.hasOwn(sourcePayload, field) ? { [field]: sourcePayload[field] } : {};
    const provenanceValues: Record<string, unknown> = {
      "workspace.home_business_use_percent": homeBusinessPct,
      "vehicle.business_use_percent": vehiclePct,
      "workspace.utility_business_use_percent": utilityPct,
      "workspace.home_allocation_percent": homeAllocationPct,
      "vehicle.balance_business_use_percent": balanceVehiclePct,
      "workspace.balance_utility_percent": balanceUtilityPct,
    };
    if (Object.hasOwn(provenanceValues, question.key)) {
      return {
        ...payload,
        ...debtExtras({
          survey_answer_values: {
            ...surveyAnswerValues,
            [question.key]: provenanceValues[question.key],
          },
        }),
      };
    }
    return payload;
  }

  function stepIsNotApplicable(index: number) {
    const questions = questionsForSection(index);
    return questions.length > 0 && questions.every((question) => !isApplicable(question, surveyAnswers));
  }

  function firstNonSkipped(from: number): number {
    let i = from;
    while (i < TOTAL_STEPS && (STEPS[i]?.skip?.() || stepIsNotApplicable(i))) i++;
    return i;
  }

  function applicableQuestionsForSection(index: number) {
    return questionsForSection(index).filter((question) => isApplicable(question, surveyAnswers));
  }

  function activeQuestion() {
    return applicableQuestionsForSection(step)[questionInSection] ?? null;
  }

  function positionAfter(sectionIndex: number, questionIndex: number) {
    const sameSection = applicableQuestionsForSection(sectionIndex);
    if (questionIndex + 1 < sameSection.length) {
      return { section: sectionIndex, question: questionIndex + 1, definition: sameSection[questionIndex + 1] };
    }
    for (let nextSection = sectionIndex + 1; nextSection < TOTAL_STEPS; nextSection++) {
      const questions = applicableQuestionsForSection(nextSection);
      if (questions.length) return { section: nextSection, question: 0, definition: questions[0] };
    }
    return null;
  }

  function positionBefore(sectionIndex: number, questionIndex: number) {
    if (questionIndex > 0) {
      const questions = applicableQuestionsForSection(sectionIndex);
      return { section: sectionIndex, question: questionIndex - 1, definition: questions[questionIndex - 1] };
    }
    for (let previousSection = sectionIndex - 1; previousSection >= 0; previousSection--) {
      const questions = applicableQuestionsForSection(previousSection);
      if (questions.length) {
        return {
          section: previousSection,
          question: questions.length - 1,
          definition: questions[questions.length - 1],
        };
      }
    }
    return null;
  }

  function hasConfirmedAnswer(question: (typeof QUESTIONS)[number]) {
    const value = surveyAnswers[question.key];
    if (DEFAULT_SENSITIVE_KEYS.has(question.key)) {
      return surveyProgress.progress.answered.has(question.key)
        || (touchedQuestionKeys.has(question.key) && value != null);
    }
    if (question.key === "liabilities.selected") {
      return touchedQuestionKeys.has(question.key)
        || surveyProgress.progress.answered.has(question.key)
        || meaningfulAnswer(value);
    }
    return meaningfulAnswer(value);
  }

  function progressAfterAnsweringQuestion(question: (typeof QUESTIONS)[number]): ProgressState {
    const { answered, skipped } = progressAfterQuestionAnswer(surveyProgress.progress, question.key);
    if (question.key === "funding.interest" && fundingInterest === "No") {
      answered.delete("funding.purposes");
      skipped.add("funding.purposes");
    }
    return { answered, skipped };
  }

  function goToPosition(position: ReturnType<typeof positionAfter>) {
    if (!position) {
      setStep(TOTAL_STEPS);
      setQuestionInSection(0);
      toast.success("Business survey saved. Your AI strategy is being tailored.");
      return;
    }
    setStep(position.section);
    setQuestionInSection(position.question);
  }

  async function saveActiveQuestion(closeAfter: boolean) {
    if (saving || saveInFlight.current) return;
    const question = activeQuestion();
    if (!question) return;
    if (!hasConfirmedAnswer(question)) {
      toast.error("Answer this question or choose Skip to continue.");
      return;
    }
    if (!orgId) {
      if (closeAfter) onOpenChange(false);
      else goToPosition(positionAfter(step, questionInSection));
      return;
    }
    if (!acquireSurveySaveLock(saveInFlight)) return;
    setSaving(true);
    try {
      const nextProgress = progressAfterAnsweringQuestion(question);
      const nextPosition = positionAfter(step, questionInSection);
      await persistSurveyQuestionInOrder({
        saveAnswer: async () => {
          const payload = payloadForQuestion(question);
          if (Object.keys(payload).length > 0) {
            const { error } = await supabase.from("organizations").update(payload).eq("id", orgId);
            if (error) throw error;
            if (payload.debts && typeof payload.debts === "object") {
              const values = (payload.debts as Record<string, unknown>).survey_answer_values;
              if (values && typeof values === "object") setSurveyAnswerValues(values as Record<string, unknown>);
            }
            qc.invalidateQueries({ queryKey: ["org_survey_data", orgId] });
            qc.invalidateQueries({ queryKey: ["organizations_list"] });
          }
        },
        saveProgress: () => surveyProgress.persist(
          nextProgress,
          closeAfter ? question.key : (nextPosition?.definition.key ?? null),
        ),
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["survey_setup_status", orgId] });
          if (closeAfter) {
            onOpenChange(false);
          } else {
            goToPosition(nextPosition);
          }
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      releaseSurveySaveLock(saveInFlight);
      setSaving(false);
    }
  }

  async function skipActiveQuestion() {
    if (saving || saveInFlight.current) return;
    const question = activeQuestion();
    if (!question) return;
    const { answered, skipped } = progressAfterQuestionSkip(surveyProgress.progress, question.key);
    if (!acquireSurveySaveLock(saveInFlight)) return;
    setSaving(true);
    try {
      const nextPosition = positionAfter(step, questionInSection);
      await surveyProgress.persist({ answered, skipped }, nextPosition?.definition.key ?? null);
      qc.invalidateQueries({ queryKey: ["survey_setup_status", orgId] });
      goToPosition(nextPosition);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save survey progress");
    } finally {
      releaseSurveySaveLock(saveInFlight);
      setSaving(false);
    }
  }

  function goBack() {
    if (saving || saveInFlight.current) return;
    const previous = positionBefore(step, questionInSection);
    if (!previous) {
      onOpenChange(false);
      return;
    }
    setStep(previous.section);
    setQuestionInSection(previous.question);
  }

  useEffect(() => {
    if (!open) {
      resumeApplied.current = false;
      setTouchedQuestionKeys(new Set());
      return;
    }
    if (resumeOrgId.current !== orgId) {
      resumeOrgId.current = orgId;
      resumeApplied.current = false;
    }
    if (!surveyProgress.loaded || resumeApplied.current) return;
    const requested = initialStep != null ? initialStep : (
      surveyProgress.legacyCompleteLike
        ? TOTAL_STEPS
        : sectionIndexForStep(surveyProgress.resumeStepKey)
    );
    const requestedSection = firstNonSkipped(Math.max(0, requested));
    setStep(requestedSection);
    const requestedQuestions = applicableQuestionsForSection(requestedSection);
    const requestedQuestionIndex = initialStep == null
      ? requestedQuestions.findIndex((question) => question.key === surveyProgress.resumeStepKey)
      : -1;
    setQuestionInSection(requestedQuestionIndex >= 0 ? requestedQuestionIndex : 0);
    resumeApplied.current = true;
  }, [open, initialStep, surveyProgress.loaded, surveyProgress.resumeStepKey, orgId]);

  async function closeCompletedSurvey() {
    if (surveyProgress.legacyCompleteLike && !surveyProgress.hasStoredProgress) {
      try {
        await surveyProgress.persist(surveyProgress.progress, null, "legacy_inferred");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save survey completion");
        return;
      }
    }
    onOpenChange(false);
  }

  const current = step < TOTAL_STEPS ? STEPS[step] : null;
  const currentQuestionCards = current ? questionCardsIn(current.render()) : [];
  const currentSectionQuestions = current ? applicableQuestionsForSection(step) : [];
  const safeQuestionIndex = Math.min(
    questionInSection,
    Math.max(0, Math.min(currentQuestionCards.length, currentSectionQuestions.length) - 1),
  );
  const currentQuestion = currentQuestionCards[safeQuestionIndex];
  const currentQuestionDefinition = currentSectionQuestions[safeQuestionIndex];
  const currentQuestionProps = currentQuestion?.props as {
    icon?: React.ElementType;
    image?: string;
    title?: string;
    description?: string;
    children?: React.ReactNode;
  } | undefined;
  const CurrentIcon = currentQuestionProps?.icon ?? current?.icon;
  const applicableQuestions = SURVEY_SECTIONS.flatMap((_section, index) => applicableQuestionsForSection(index));
  const displayedQuestionNumber = Math.max(
    1,
    applicableQuestions.findIndex((question) => question.key === currentQuestionDefinition?.key) + 1,
  );
  const completion = applicableSurveyCompletion(surveyAnswers, surveyProgress.progress);
  const progressPct = current ? completion.percent : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="survey-modal flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-border bg-card p-0 text-card-foreground sm:h-[min(820px,calc(100dvh-2rem))] sm:w-[min(580px,calc(100vw-2rem))] sm:max-w-none sm:rounded-xl">
        <div className="min-h-0 flex-1 overflow-y-auto bg-card p-3 pt-10 sm:p-5 sm:pt-10">
          {current ? (
            <div
              className="flex min-h-full min-w-0 items-center justify-center"
              data-survey-question-key={currentQuestionDefinition?.key}
            >
              <QuestionStage
              number={displayedQuestionNumber}
              title={currentQuestionProps?.title ?? current.title}
              description={currentQuestionProps?.description ?? current.description}
              image={currentQuestionProps?.image ?? current.image}
              icon={CurrentIcon ? <CurrentIcon className="h-16 w-16 sm:h-20 sm:w-20" aria-hidden="true" /> : undefined}
            >
              <div className="sr-only">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFC72B]/15 text-[#FFC72B]">
                  {CurrentIcon && <CurrentIcon className="h-7 w-7" aria-hidden="true" />}
                </div>
                <h3 className="min-w-0 break-words text-xl font-bold text-white sm:text-2xl">{current.title}</h3>
              </div>
              <div className="mt-2 flex items-center gap-2 font-bold text-[#FFC72B]">
                <Flag className="h-4 w-4 fill-[#FFC72B]" />
                <span>Section {step + 1} of {TOTAL_STEPS}</span>
              </div>
              <p className="mt-2 text-sm text-[#D7E6FF]">{current.description}</p>
              <p className="mt-1 text-xs text-[#9CB6D9]">{progressPct}% overall completion · only applicable questions count</p>
              </div>
              <div className="[&_input]:border-input [&_input]:bg-background [&_input]:text-foreground">
                {currentQuestionProps?.children ?? (
                  <p className="text-sm text-destructive" role="alert">
                    This question could not be displayed. Close and reopen the survey, then try again.
                  </p>
                )}
              </div>

              <QuestionProgress current={displayedQuestionNumber} total={applicableQuestions.length} percent={progressPct} />
              </QuestionStage>
            </div>
          ) : (
            <CompletionCard image={trophyIcon} />
          )}
        </div>

        <QuestionnaireNavigation
          first={step === 0 && questionInSection === 0}
          complete={!current}
          saving={saving}
          onBack={goBack}
          onSkip={current ? skipActiveQuestion : undefined}
          onSave={current ? () => saveActiveQuestion(true) : undefined}
          onContinue={current ? () => saveActiveQuestion(false) : closeCompletedSurvey}
        />
      </DialogContent>
    </Dialog>
  );
}
