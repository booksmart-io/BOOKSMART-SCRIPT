import { useMemo, useState } from "react";
import { Loader2, Building2, MapPin, BadgeDollarSign, Landmark, BriefcaseBusiness, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { checkAddBusiness } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";

type StateRow = { id: number; name: string; code: string };

type BusinessSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: number | null;
  states: StateRow[];
  defaultEmail?: string;
  onSaved: (orgId: number) => void;
  onError?: (message: string) => void;
};

const ENTITY_TYPES = [
  "Sole Proprietorship",
  "Single Member LLC",
  "Multi Member LLC",
  "Partnership",
  "Limited Partnership (LP)",
  "Limited Liability Partnership (LLP)",
  "S Corporation",
  "C Corporation",
  "Professional Corporation (PC)",
  "Professional LLC (PLLC)",
  "Nonprofit",
  "Independent Contractor / Freelancer",
  "Trust",
  "Estate",
  "Other",
];

const INDUSTRIES = [
  "Construction", "Real Estate", "Restaurant", "Retail", "Medical", "Dental", "Legal", "Accounting",
  "Financial Services", "Marketing", "Technology", "Consulting", "Insurance", "Manufacturing",
  "Transportation", "Logistics", "Trucking", "Cleaning Services", "Landscaping", "HVAC", "Plumbing",
  "Electrical", "Roofing", "Engineering", "Architecture", "Education", "Childcare", "Fitness",
  "Beauty Salon", "Barber Shop", "E Commerce", "Online Business", "Photography", "Agriculture",
  "Nonprofit", "Other",
];

const BUSINESS_STATUS = ["Startup", "Operating", "Seasonal", "Temporarily Closed"];
const EMPLOYEE_COUNTS = ["Just Me", "2 to 5", "6 to 10", "11 to 25", "26 to 50", "51 to 100", "100+"];
const LOCATION_TYPES = ["Home Office", "Commercial Office", "Retail Store", "Warehouse", "Mobile Business", "Virtual Office"];
const TAX_PREPARERS = ["Myself", "CPA", "Tax Preparer", "Bookkeeper"];
const TAX_FILINGS = ["Federal", "State", "Sales Tax", "Payroll Tax", "1099"];
const PAYMENT_PLATFORMS = ["Stripe", "Square", "PayPal", "Shopify", "Amazon", "Etsy", "Clover", "Toast", "Venmo", "Cash App", "Zelle", "Other"];
const ACCOUNTING_SOFTWARE = ["QuickBooks", "Xero", "Wave", "FreshBooks", "Zoho", "Sage", "None"];
const PAYROLL_PROVIDERS = ["Gusto", "ADP", "Paychex", "Rippling", "Justworks", "None"];
const BUSINESS_OPERATIONS = ["Sell Products", "Sell Services", "Have Employees", "Issue 1099s"];
const REVENUE_RANGES = ["Under $25,000", "$25K to $50K", "$50K to $100K", "$100K to $250K", "$250K to $500K", "$500K to $1M", "$1M to $5M", "$5M+"];
const PROFITABILITY = ["Profitable", "Breaking Even", "Losing Money", "Unsure"];
const DEDUCTION_AREAS = ["Home Office", "Vehicle", "Phone", "Internet", "Travel", "Meals", "Equipment", "Contractors", "Employees", "Advertising", "Software", "Subscriptions", "Professional Services", "Insurance", "Rent", "Utilities", "Inventory", "Shipping", "Education"];
const BUSINESS_GOALS = ["Bookkeeping", "Tax Savings", "AI Financial Insights", "Cash Flow", "Budgeting", "Financial Reports", "CPA Access", "Tax Preparation", "Loan Readiness", "Business Credit", "Financial Forecasting", "Expense Tracking", "Receipt Management", "Bank Reconciliation"];
const FUNDING_PURPOSES = ["Working Capital", "Equipment", "Vehicle", "Commercial Property", "SBA Loan", "Line of Credit", "Expansion", "Startup", "Inventory"];
const AI_NOTIFICATIONS = ["Tax Savings", "Missing Deductions", "Large Expenses", "Cash Flow Issues", "Upcoming Tax Deadlines", "Funding Opportunities", "Business Health Score Changes", "Monthly Reports"];
const DOCUMENT_TYPES = ["Prior Tax Return", "Bank Statements", "Credit Card Statements", "Profit & Loss", "Balance Sheet", "Articles of Incorporation", "EIN Letter", "Business License", "Sales Tax Permit"];

const INITIAL_FORM = {
  legalName: "",
  hasDba: "no",
  dba: "",
  entityType: "",
  industry: "",
  naics: "",
  description: "",
  status: "",
  yearEstablished: "",
  startDate: "",
  employees: "",
  contractors: "",
  website: "",
  businessEmail: "",
  businessPhone: "",
  street: "",
  suite: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
  mailingSame: true,
  locationType: "",
  ownerName: "",
  ownerTitle: "Owner",
  ownershipPercent: "100",
  additionalOwners: "",
  einTin: "",
  federalTaxClass: "",
  stateIncorporation: "",
  stateRegistrationNumber: "",
  businessLicenseNumber: "",
  salesTaxPermit: "no",
  salesTaxNumber: "",
  payrollTaxNumber: "",
  taxYear: "Calendar",
  fiscalYearEnd: "",
  taxPreparer: "",
  currentCpa: "",
  connectBankNow: "later",
  primaryBank: "",
  bankAccountCount: "",
  businessCreditCards: "no",
  loans: "no",
  lineOfCredit: "no",
  paymentPlatforms: [] as string[],
  accountingSoftware: "",
  payrollProvider: "",
  operations: [] as string[],
  annualRevenue: "",
  monthlyRevenue: "",
  monthlyExpenses: "",
  profitability: "",
  deductionAreas: [] as string[],
  goals: [] as string[],
  applyingFunding: "maybe",
  fundingPurposes: [] as string[],
  desiredFundingAmount: "",
  fundingTimeline: "",
  hasCpa: "no",
  wantsCpaMatch: "yes",
  wantsBookkeeper: "no",
  aiNotifications: [] as string[],
  uploadDocumentsNow: "later",
  documents: [] as string[],
  enableMfa: "no",
  inviteTeamMembers: "no",
  certifyAccurate: false,
  authorizeAnalysis: false,
  acceptTerms: false,
  acceptPrivacy: false,
};

type FormState = typeof INITIAL_FORM;
type MultiKey = {
  [K in keyof FormState]: FormState[K] extends string[] ? K : never;
}[keyof FormState];

const STEPS = [
  { title: "Company", icon: Building2 },
  { title: "Address", icon: MapPin },
  { title: "Tax", icon: Landmark },
  { title: "Banking", icon: BadgeDollarSign },
  { title: "Operations", icon: BriefcaseBusiness },
  { title: "Legal", icon: ShieldCheck },
];

const NAICS_BY_INDUSTRY: Record<string, string> = {
  Construction: "23",
  "Real Estate": "531",
  Restaurant: "722511",
  Retail: "44-45",
  Medical: "621",
  Dental: "621210",
  Legal: "541110",
  Accounting: "541211",
  Technology: "5415",
  Consulting: "541611",
  Transportation: "48-49",
  Trucking: "484",
  Manufacturing: "31-33",
  Nonprofit: "813",
};

export default function BusinessSetupDialog({
  open,
  onOpenChange,
  ownerId,
  states,
  defaultEmail = "",
  onSaved,
  onError,
}: BusinessSetupDialogProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM, businessEmail: defaultEmail });

  const progress = ((step + 1) / STEPS.length) * 100;
  const CurrentIcon = STEPS[step].icon;

  const selectedStateName = useMemo(
    () => states.find((s) => String(s.id) === form.state)?.name ?? "",
    [states, form.state]
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleList(key: MultiKey, value: string) {
    setForm((current) => {
      const list = current[key] as string[];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      };
    });
  }

  function validateStep() {
    if (step === 0) {
      if (!form.legalName.trim()) return "Legal business name is required.";
      if (!form.entityType) return "Business entity type is required.";
      if (!form.industry) return "Industry is required.";
    }
    if (step === 1) {
      if (!form.state) return "Primary business state is required.";
    }
    if (step === 2) {
      if (!form.einTin.trim()) return "EIN / Tax ID is required.";
      if (!form.federalTaxClass) return "Federal tax classification is required.";
    }
    if (step === 5) {
      if (!form.certifyAccurate || !form.authorizeAnalysis || !form.acceptTerms || !form.acceptPrivacy) {
        return "Please complete all legal confirmations.";
      }
    }
    return null;
  }

  function next() {
    const error = validateStep();
    if (error) {
      onError?.(error);
      return;
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  async function save() {
    const error = validateStep();
    if (error) {
      onError?.(error);
      return;
    }
    if (ownerId === null) {
      onError?.("No user account found.");
      return;
    }
    setSaving(true);
    try {
      await checkAddBusiness();
      const onboardingProfile = {
        dba: form.hasDba === "yes" ? form.dba.trim() : null,
        has_dba: form.hasDba === "yes",
        naics_code: form.naics.trim() || null,
        business_description: form.description.trim() || null,
        business_status: form.status || null,
        year_established: form.yearEstablished || null,
        date_business_started: form.startDate || null,
        employee_count: form.employees || null,
        independent_contractor_count: form.contractors || null,
        address: {
          street: form.street.trim() || null,
          suite: form.suite.trim() || null,
          city: form.city.trim() || null,
          state: selectedStateName || null,
          zip: form.zip.trim() || null,
          country: form.country.trim() || null,
          mailing_same_as_business: form.mailingSame,
          location_type: form.locationType || null,
        },
        ownership: {
          owner_name: form.ownerName.trim() || null,
          owner_title: form.ownerTitle.trim() || null,
          ownership_percent: Number(form.ownershipPercent) || 100,
          additional_owners_notes: form.additionalOwners.trim() || null,
        },
        tax: {
          federal_tax_classification: form.federalTaxClass || null,
          state_of_incorporation: form.stateIncorporation || null,
          state_registration_number: form.stateRegistrationNumber.trim() || null,
          business_license_number: form.businessLicenseNumber.trim() || null,
          sales_tax_permit: form.salesTaxPermit === "yes",
          sales_tax_number: form.salesTaxNumber.trim() || null,
          payroll_tax_number: form.payrollTaxNumber.trim() || null,
          tax_year: form.taxYear,
          fiscal_year_end: form.fiscalYearEnd || null,
          filings: form.operations.includes("Issue 1099s") ? [...TAX_FILINGS.filter((f) => f !== "1099"), "1099"] : [],
          tax_preparer: form.taxPreparer || null,
          current_cpa: form.currentCpa.trim() || null,
        },
        banking: {
          connect_bank_now: form.connectBankNow === "yes",
          primary_bank: form.primaryBank.trim() || null,
          bank_account_count: form.bankAccountCount || null,
          business_credit_cards: form.businessCreditCards === "yes",
          loans: form.loans === "yes",
          line_of_credit: form.lineOfCredit === "yes",
          payment_platforms: form.paymentPlatforms,
          accounting_software: form.accountingSoftware || null,
          payroll_provider: form.payrollProvider || null,
        },
        operations: form.operations,
        financial_snapshot: {
          approximate_annual_revenue: form.annualRevenue || null,
          average_monthly_revenue: Number(form.monthlyRevenue) || null,
          average_monthly_expenses: Number(form.monthlyExpenses) || null,
          profitability: form.profitability || null,
        },
        deduction_profile: form.deductionAreas,
        goals: form.goals,
        funding: {
          plans_to_apply: form.applyingFunding,
          purposes: form.fundingPurposes,
          desired_amount: Number(form.desiredFundingAmount) || null,
          timeline: form.fundingTimeline.trim() || null,
        },
        cpa_profile: {
          has_cpa: form.hasCpa === "yes",
          wants_cpa_match: form.wantsCpaMatch === "yes",
          wants_bookkeeper: form.wantsBookkeeper === "yes",
        },
        ai_preferences: form.aiNotifications,
        documents: {
          upload_now: form.uploadDocumentsNow === "now",
          requested_documents: form.documents,
        },
        security: {
          enable_mfa: form.enableMfa === "yes",
          invite_team_members: form.inviteTeamMembers === "yes",
        },
        legal: {
          certified_accurate: form.certifyAccurate,
          authorized_analysis: form.authorizeAnalysis,
          accepted_terms: form.acceptTerms,
          accepted_privacy: form.acceptPrivacy,
        },
        completed_at: new Date().toISOString(),
      };

      const payload = {
        owner_id: ownerId,
        name: form.legalName.trim(),
        org_type: form.entityType,
        industry: form.industry,
        ein_tin: form.einTin.trim(),
        state: Number(form.state),
        street: [form.street.trim(), form.suite.trim()].filter(Boolean).join(", "),
        city: form.city.trim(),
        zip: form.zip.trim(),
        phone: form.businessPhone.trim(),
        email: form.businessEmail.trim(),
        website: form.website.trim() || null,
        primary_state: selectedStateName || null,
        industry_niche: form.industry,
        debts: {
          onboarding_profile: onboardingProfile,
          business_profile_completed: true,
        },
      };

      const { data, error: insertError } = await supabase
        .from("organizations")
        .insert(payload)
        .select("id")
        .single();
      if (insertError) throw insertError;
      const orgId = (data as { id: number }).id;
      onSaved(orgId);
      setStep(0);
      setForm({ ...INITIAL_FORM, businessEmail: defaultEmail });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add business";
      onError?.(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 py-5 border-b border-border/60">
          <DialogTitle>Add Business</DialogTitle>
          <DialogDescription>Set up the business profile first. After this, BookSmart will start the survey.</DialogDescription>
          <div className="pt-4">
            <div className="flex gap-2 text-xs font-medium text-muted-foreground">
              {STEPS.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setStep(index)}
                  className={cn("flex flex-1 items-center justify-center gap-2 rounded-md border px-2 py-2", index === step ? "border-primary bg-primary/10 text-primary" : "border-border/60")}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.title}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[58vh] overflow-y-auto px-6 py-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CurrentIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{STEPS[step].title}</h3>
              <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
            </div>
          </div>

          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Legal business name *"><Input value={form.legalName} onChange={(e) => update("legalName", e.target.value)} placeholder="Acme LLC" /></Field>
              <Field label="Entity type *"><SelectField value={form.entityType} onChange={(v) => update("entityType", v)} options={ENTITY_TYPES} placeholder="Select entity" /></Field>
              <Field label="Does your business use a DBA?"><SelectField value={form.hasDba} onChange={(v) => update("hasDba", v)} options={["no", "yes"]} /></Field>
              {form.hasDba === "yes" && <Field label="DBA / trade name"><Input value={form.dba} onChange={(e) => update("dba", e.target.value)} /></Field>}
              <Field label="Industry *"><SelectField value={form.industry} onChange={(v) => { update("industry", v); update("naics", NAICS_BY_INDUSTRY[v] ?? ""); }} options={INDUSTRIES} placeholder="Select industry" /></Field>
              <Field label="NAICS code"><Input value={form.naics} onChange={(e) => update("naics", e.target.value)} placeholder="Auto-filled when available" /></Field>
              <Field label="Business status"><SelectField value={form.status} onChange={(v) => update("status", v)} options={BUSINESS_STATUS} placeholder="Select status" /></Field>
              <Field label="Year established"><Input type="number" value={form.yearEstablished} onChange={(e) => update("yearEstablished", e.target.value)} placeholder="2024" /></Field>
              <Field label="Date business started"><Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field>
              <Field label="Number of employees"><SelectField value={form.employees} onChange={(v) => update("employees", v)} options={EMPLOYEE_COUNTS} placeholder="Select count" /></Field>
              <Field label="Independent contractors"><Input type="number" min="0" value={form.contractors} onChange={(e) => update("contractors", e.target.value)} /></Field>
              <Field label="Business website"><Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://acme.com" /></Field>
              <Field label="Business email"><Input type="email" value={form.businessEmail} onChange={(e) => update("businessEmail", e.target.value)} /></Field>
              <Field label="Business phone"><Input value={form.businessPhone} onChange={(e) => update("businessPhone", e.target.value)} /></Field>
              <div className="md:col-span-2"><Field label="Products or services"><Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe what this business sells or provides." /></Field></div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Street"><Input value={form.street} onChange={(e) => update("street", e.target.value)} /></Field>
              <Field label="Suite"><Input value={form.suite} onChange={(e) => update("suite", e.target.value)} /></Field>
              <Field label="City"><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></Field>
              <Field label="State *"><SelectField value={form.state} onChange={(v) => update("state", v)} options={states.map((s) => ({ value: String(s.id), label: s.name }))} placeholder="Select state" /></Field>
              <Field label="ZIP"><Input value={form.zip} onChange={(e) => update("zip", e.target.value)} /></Field>
              <Field label="Country"><Input value={form.country} onChange={(e) => update("country", e.target.value)} /></Field>
              <Field label="Business location type"><SelectField value={form.locationType} onChange={(v) => update("locationType", v)} options={LOCATION_TYPES} placeholder="Select location" /></Field>
              <CheckRow label="Mailing address is same as business address" checked={form.mailingSame} onChange={(v) => update("mailingSame", v)} />
              <Field label="Owner full name"><Input value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} /></Field>
              <Field label="Owner title"><Input value={form.ownerTitle} onChange={(e) => update("ownerTitle", e.target.value)} /></Field>
              <Field label="Ownership percentage"><Input type="number" min="0" max="100" value={form.ownershipPercent} onChange={(e) => update("ownershipPercent", e.target.value)} /></Field>
              <div className="md:col-span-2"><Field label="Additional owners"><Textarea value={form.additionalOwners} onChange={(e) => update("additionalOwners", e.target.value)} placeholder="Name, email, ownership %, role" /></Field></div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="EIN / Tax ID *"><Input value={form.einTin} onChange={(e) => update("einTin", e.target.value)} placeholder="12-3456789" /></Field>
              <Field label="Federal tax classification *"><SelectField value={form.federalTaxClass} onChange={(v) => update("federalTaxClass", v)} options={["Sole Proprietor", "Single Member LLC", "Partnership", "S Corporation", "C Corporation", "Nonprofit"]} placeholder="Select class" /></Field>
              <Field label="State of incorporation"><SelectField value={form.stateIncorporation} onChange={(v) => update("stateIncorporation", v)} options={states.map((s) => ({ value: s.name, label: s.name }))} placeholder="Select state" /></Field>
              <Field label="State registration number"><Input value={form.stateRegistrationNumber} onChange={(e) => update("stateRegistrationNumber", e.target.value)} /></Field>
              <Field label="Business license number"><Input value={form.businessLicenseNumber} onChange={(e) => update("businessLicenseNumber", e.target.value)} /></Field>
              <Field label="Sales tax permit"><SelectField value={form.salesTaxPermit} onChange={(v) => update("salesTaxPermit", v)} options={["no", "yes"]} /></Field>
              {form.salesTaxPermit === "yes" && <Field label="Sales tax number"><Input value={form.salesTaxNumber} onChange={(e) => update("salesTaxNumber", e.target.value)} /></Field>}
              <Field label="Payroll tax number"><Input value={form.payrollTaxNumber} onChange={(e) => update("payrollTaxNumber", e.target.value)} /></Field>
              <Field label="Business tax year"><SelectField value={form.taxYear} onChange={(v) => update("taxYear", v)} options={["Calendar", "Fiscal"]} /></Field>
              {form.taxYear === "Fiscal" && <Field label="Fiscal year end"><Input type="date" value={form.fiscalYearEnd} onChange={(e) => update("fiscalYearEnd", e.target.value)} /></Field>}
              <Field label="Who prepares your taxes?"><SelectField value={form.taxPreparer} onChange={(v) => update("taxPreparer", v)} options={TAX_PREPARERS} placeholder="Select preparer" /></Field>
              <Field label="Current CPA"><Input value={form.currentCpa} onChange={(e) => update("currentCpa", e.target.value)} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Connect bank now?"><SelectField value={form.connectBankNow} onChange={(v) => update("connectBankNow", v)} options={["later", "yes"]} /></Field>
              <Field label="Primary bank"><Input value={form.primaryBank} onChange={(e) => update("primaryBank", e.target.value)} /></Field>
              <Field label="Number of business bank accounts"><Input type="number" min="0" value={form.bankAccountCount} onChange={(e) => update("bankAccountCount", e.target.value)} /></Field>
              <Field label="Business credit cards"><SelectField value={form.businessCreditCards} onChange={(v) => update("businessCreditCards", v)} options={["no", "yes"]} /></Field>
              <Field label="Loans"><SelectField value={form.loans} onChange={(v) => update("loans", v)} options={["no", "yes"]} /></Field>
              <Field label="Line of credit"><SelectField value={form.lineOfCredit} onChange={(v) => update("lineOfCredit", v)} options={["no", "yes"]} /></Field>
              <Field label="Accounting software"><SelectField value={form.accountingSoftware} onChange={(v) => update("accountingSoftware", v)} options={ACCOUNTING_SOFTWARE} placeholder="Select software" /></Field>
              <Field label="Payroll provider"><SelectField value={form.payrollProvider} onChange={(v) => update("payrollProvider", v)} options={PAYROLL_PROVIDERS} placeholder="Select provider" /></Field>
              <MultiSection title="Payment platforms" options={PAYMENT_PLATFORMS} selected={form.paymentPlatforms} onToggle={(v) => toggleList("paymentPlatforms", v)} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <MultiSection title="Business operations" options={BUSINESS_OPERATIONS} selected={form.operations} onToggle={(v) => toggleList("operations", v)} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Approximate annual revenue"><SelectField value={form.annualRevenue} onChange={(v) => update("annualRevenue", v)} options={REVENUE_RANGES} placeholder="Select range" /></Field>
                <Field label="Average monthly revenue"><Input type="number" min="0" value={form.monthlyRevenue} onChange={(e) => update("monthlyRevenue", e.target.value)} /></Field>
                <Field label="Average monthly expenses"><Input type="number" min="0" value={form.monthlyExpenses} onChange={(e) => update("monthlyExpenses", e.target.value)} /></Field>
                <Field label="Profitability"><SelectField value={form.profitability} onChange={(v) => update("profitability", v)} options={PROFITABILITY} placeholder="Select status" /></Field>
              </div>
              <MultiSection title="Tax deduction profile" options={DEDUCTION_AREAS} selected={form.deductionAreas} onToggle={(v) => toggleList("deductionAreas", v)} />
              <MultiSection title="Business goals" options={BUSINESS_GOALS} selected={form.goals} onToggle={(v) => toggleList("goals", v)} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Applying for funding?"><SelectField value={form.applyingFunding} onChange={(v) => update("applyingFunding", v)} options={["yes", "no", "maybe"]} /></Field>
                <Field label="Desired funding amount"><Input type="number" min="0" value={form.desiredFundingAmount} onChange={(e) => update("desiredFundingAmount", e.target.value)} /></Field>
                <Field label="Expected timeline"><Input value={form.fundingTimeline} onChange={(e) => update("fundingTimeline", e.target.value)} placeholder="3-6 months" /></Field>
              </div>
              <MultiSection title="Funding purpose" options={FUNDING_PURPOSES} selected={form.fundingPurposes} onToggle={(v) => toggleList("fundingPurposes", v)} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Do you have a CPA?"><SelectField value={form.hasCpa} onChange={(v) => update("hasCpa", v)} options={["no", "yes"]} /></Field>
                <Field label="Match with BookSmart CPA?"><SelectField value={form.wantsCpaMatch} onChange={(v) => update("wantsCpaMatch", v)} options={["yes", "no"]} /></Field>
                <Field label="BookSmart bookkeeper?"><SelectField value={form.wantsBookkeeper} onChange={(v) => update("wantsBookkeeper", v)} options={["no", "yes"]} /></Field>
              </div>
              <MultiSection title="AI notifications" options={AI_NOTIFICATIONS} selected={form.aiNotifications} onToggle={(v) => toggleList("aiNotifications", v)} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Upload documents now or later?"><SelectField value={form.uploadDocumentsNow} onChange={(v) => update("uploadDocumentsNow", v)} options={["later", "now"]} /></Field>
                <Field label="Enable MFA?"><SelectField value={form.enableMfa} onChange={(v) => update("enableMfa", v)} options={["no", "yes"]} /></Field>
                <Field label="Invite team members?"><SelectField value={form.inviteTeamMembers} onChange={(v) => update("inviteTeamMembers", v)} options={["no", "yes"]} /></Field>
              </div>
              <MultiSection title="Documents" options={DOCUMENT_TYPES} selected={form.documents} onToggle={(v) => toggleList("documents", v)} />
              <div className="rounded-lg border border-border/60 p-4 space-y-3">
                <CheckRow label="I certify that the information is accurate." checked={form.certifyAccurate} onChange={(v) => update("certifyAccurate", v)} />
                <CheckRow label="I authorize BookSmart to analyze my financial data." checked={form.authorizeAnalysis} onChange={(v) => update("authorizeAnalysis", v)} />
                <CheckRow label="I accept the Terms of Service." checked={form.acceptTerms} onChange={(v) => update("acceptTerms", v)} />
                <CheckRow label="I accept the Privacy Policy." checked={form.acceptPrivacy} onChange={(v) => update("acceptPrivacy", v)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={() => (step === 0 ? onOpenChange(false) : setStep((current) => current - 1))} disabled={saving}>
            {step === 0 ? "Cancel" : <><ChevronLeft className="mr-2 h-4 w-4" /> Back</>}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Business & Start Survey
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder = "Select",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return <SelectItem key={value} value={value}>{label}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{label}</span>
    </label>
  );
}

function MultiSection({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="md:col-span-2">
      <Label>{title}</Label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <CheckRow key={option} label={option} checked={selected.includes(option)} onChange={() => onToggle(option)} />
        ))}
      </div>
    </div>
  );
}
