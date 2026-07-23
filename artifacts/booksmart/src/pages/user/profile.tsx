import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BriefcaseBusiness, Building2, Camera, Landmark, MapPin, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { checkAddBusiness } from "@/lib/plan-limits";

type UserRow = {
  id: number;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  img_url: string | null;
};

type OrgRow = {
  id: number;
  name: string | null;
  org_type: string | null;
  industry: string | null;
  ein_tin: string | null;
  state: number | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  debts?: Record<string, unknown> | null;
};

type StateRow = { id: number; name: string; code: string };

const ENTITY_TYPES = [
  "Sole Proprietorship",
  "Single Member LLC",
  "Multi Member LLC",
  "Partnership",
  "S Corporation",
  "C Corporation",
  "Independent Contractor / Freelancer",
  "Nonprofit",
  "Other",
];

const INDUSTRIES = [
  "Construction",
  "Real Estate",
  "Restaurant",
  "Retail",
  "Medical",
  "Legal",
  "Accounting",
  "Financial Services",
  "Marketing",
  "Technology",
  "Consulting",
  "Transportation",
  "Cleaning Services",
  "E Commerce",
  "Online Business",
  "Other",
];

const TAX_PREPARERS = ["Myself", "CPA", "Tax Preparer", "Bookkeeper"];
const BUSINESS_STATUS = ["Startup", "Seasonal", "Temporarily Closed"];
const EMPLOYEE_COUNTS = ["Just Me", "2 to 5", "6 to 10", "11 to 25", "26 to 50", "51 to 100", "100+"];
const LOCATION_TYPES = ["Home Office", "Commercial Office", "Retail Store", "Warehouse", "Mobile Business", "Virtual Office"];
const PAYMENT_PLATFORMS = ["Stripe", "Square", "PayPal", "Shopify", "Amazon", "Etsy", "Clover", "Toast", "Venmo", "Cash App", "Zelle", "Other"];
const ACCOUNTING_SOFTWARE = ["QuickBooks", "Xero", "Wave", "FreshBooks", "Zoho", "Sage", "None"];
const PAYROLL_PROVIDERS = ["Gusto", "ADP", "Paychex", "Rippling", "Justworks", "None"];
const BUSINESS_OPERATIONS = ["Sell Products", "Sell Services", "Have Employees", "Issue 1099s"];
const REVENUE_RANGES = ["Under $25,000", "$25K to $50K", "$50K to $100K", "$100K to $250K", "$250K to $500K", "$500K to $1M", "$1M to $5M", "$5M+"];
const PROFITABILITY = ["Profitable", "Breaking Even", "Losing Money", "Unsure"];
const BUSINESS_GOALS = ["Bookkeeping", "Tax Savings", "AI Financial Insights", "Cash Flow", "Budgeting", "Financial Reports", "CPA Access", "Tax Preparation", "Loan Readiness", "Business Credit", "Financial Forecasting", "Expense Tracking", "Receipt Management", "Bank Reconciliation"];
const FUNDING_PURPOSES = ["Working Capital", "Equipment", "Vehicle", "Commercial Property", "SBA Loan", "Line of Credit", "Expansion", "Startup", "Inventory"];
const AI_NOTIFICATIONS = ["Tax Savings", "Missing Deductions", "Large Expenses", "Cash Flow Issues", "Upcoming Tax Deadlines", "Funding Opportunities", "Business Health Score Changes", "Monthly Reports"];
const DOCUMENT_TYPES = ["Prior Tax Return", "Bank Statements", "Credit Card Statements", "Profit & Loss", "Balance Sheet", "Articles of Incorporation", "EIN Letter", "Business License", "Sales Tax Permit"];
const EMPLOYEE_TYPES = ["1099", "W-2 Employee", "Self / Single"];

const BUSINESS_STEPS = [
  { title: "Company", icon: Building2 },
  { title: "Address", icon: MapPin },
  { title: "Tax", icon: Landmark },
  { title: "Operations", icon: BriefcaseBusiness },
  { title: "Legal", icon: ShieldCheck },
];

const profileSurveyKey = "booksmart:start-business-survey";

export default function Profile() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [activeOrgId, setActiveOrgId] = useActiveOrganizationId(numericId);
  const [step, setStep] = useState(0);
  const [businessStep, setBusinessStep] = useState(0);

  const { data: userRow, isLoading: userLoading } = useQuery<UserRow | null>({
    queryKey: ["profile_user", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, first_name, middle_name, last_name, phone_number, img_url")
        .eq("id", numericId!)
        .single();
      if (error) throw error;
      return data as UserRow;
    },
  });

  const { data: orgRow, isLoading: orgLoading } = useQuery<OrgRow | null>({
    queryKey: ["profile_org", numericId, activeOrgId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, org_type, industry, ein_tin, state, street, city, zip, phone, email, website, debts")
        .eq("owner_id", numericId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data as OrgRow[] | null, activeOrgId);
    },
  });

  const { data: states = [] } = useQuery<StateRow[]>({
    queryKey: ["states"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("states").select("id, name, code").order("name");
      if (error) throw error;
      return (data as StateRow[]) ?? [];
    },
  });

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [industry, setIndustry] = useState("");
  const [einTin, setEinTin] = useState("");
  const [stateId, setStateId] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [naics, setNaics] = useState("");
  const [businessStatus, setBusinessStatus] = useState("");
  const [yearEstablished, setYearEstablished] = useState("");
  const [startDate, setStartDate] = useState("");
  const [employees, setEmployees] = useState("");
  const [contractors, setContractors] = useState("");
  const [suite, setSuite] = useState("");
  const [country, setCountry] = useState("United States");
  const [locationType, setLocationType] = useState("");
  const [mailingSame, setMailingSame] = useState(true);
  const [ownerName, setOwnerName] = useState("");
  const [ownerTitle, setOwnerTitle] = useState("Owner");
  const [ownershipPercent, setOwnershipPercent] = useState("100");
  const [additionalOwners, setAdditionalOwners] = useState("");
  const [federalTaxClass, setFederalTaxClass] = useState("");
  const [stateIncorporation, setStateIncorporation] = useState("");
  const [stateRegistrationNumber, setStateRegistrationNumber] = useState("");
  const [businessLicenseNumber, setBusinessLicenseNumber] = useState("");
  const [salesTaxPermit, setSalesTaxPermit] = useState("no");
  const [salesTaxNumber, setSalesTaxNumber] = useState("");
  const [payrollTaxNumber, setPayrollTaxNumber] = useState("");
  const [taxYear, setTaxYear] = useState("Calendar");
  const [fiscalYearEnd, setFiscalYearEnd] = useState("");
  const [taxPreparer, setTaxPreparer] = useState("");
  const [currentCpa, setCurrentCpa] = useState("");
  const [primaryBank, setPrimaryBank] = useState("");
  const [bankAccountCount, setBankAccountCount] = useState("");
  const [connectBankNow, setConnectBankNow] = useState("later");
  const [businessCreditCards, setBusinessCreditCards] = useState("no");
  const [loans, setLoans] = useState("no");
  const [lineOfCredit, setLineOfCredit] = useState("no");
  const [accountingSoftware, setAccountingSoftware] = useState("");
  const [payrollProvider, setPayrollProvider] = useState("");
  const [paymentPlatforms, setPaymentPlatforms] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [employeeType, setEmployeeType] = useState("");
  const [annualRevenue, setAnnualRevenue] = useState("");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [profitability, setProfitability] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [applyingFunding, setApplyingFunding] = useState("maybe");
  const [fundingPurposes, setFundingPurposes] = useState<string[]>([]);
  const [desiredFundingAmount, setDesiredFundingAmount] = useState("");
  const [fundingTimeline, setFundingTimeline] = useState("");
  const [operationsNotes, setOperationsNotes] = useState("");
  const [hasCpa, setHasCpa] = useState("no");
  const [wantsCpaMatch, setWantsCpaMatch] = useState("yes");
  const [wantsBookkeeper, setWantsBookkeeper] = useState("no");
  const [aiNotifications, setAiNotifications] = useState<string[]>([]);
  const [uploadDocumentsNow, setUploadDocumentsNow] = useState("later");
  const [documents, setDocuments] = useState<string[]>([]);
  const [enableMfa, setEnableMfa] = useState("no");
  const [inviteTeamMembers, setInviteTeamMembers] = useState("no");
  const [certifyAccurate, setCertifyAccurate] = useState(false);
  const [authorizeAnalysis, setAuthorizeAnalysis] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  useEffect(() => {
    if (!userRow) return;
    setFirstName(userRow.first_name ?? "");
    setMiddleName(userRow.middle_name ?? "");
    setLastName(userRow.last_name ?? "");
    setPhone(userRow.phone_number ?? "");
    setBusinessEmail((current) => current || userRow.email || profile?.email || "");
  }, [userRow, profile?.email]);

  useEffect(() => {
    if (!orgRow) return;
    setBusinessName(orgRow.name ?? "");
    setOrgType(orgRow.org_type ?? "");
    setIndustry(orgRow.industry ?? "");
    setEinTin(orgRow.ein_tin ?? "");
    setStateId(orgRow.state ? String(orgRow.state) : "");
    setStreet(orgRow.street ?? "");
    setCity(orgRow.city ?? "");
    setZip(orgRow.zip ?? "");
    setBusinessPhone(orgRow.phone ?? "");
    setBusinessEmail(orgRow.email ?? userRow?.email ?? profile?.email ?? "");
    setWebsite(orgRow.website ?? "");
    const onboarding = orgRow.debts?.onboarding_profile as {
      business_description?: string | null;
      naics_code?: string | null;
      business_status?: string | null;
      year_established?: string | null;
      date_business_started?: string | null;
      employee_count?: string | null;
      independent_contractor_count?: string | null;
      address?: {
        suite?: string | null;
        country?: string | null;
        location_type?: string | null;
        mailing_same_as_business?: boolean | null;
      };
      ownership?: {
        owner_name?: string | null;
        owner_title?: string | null;
        ownership_percent?: number | null;
        additional_owners_notes?: string | null;
      };
      tax?: {
        federal_tax_classification?: string | null;
        state_of_incorporation?: string | null;
        state_registration_number?: string | null;
        business_license_number?: string | null;
        sales_tax_permit?: boolean | null;
        sales_tax_number?: string | null;
        payroll_tax_number?: string | null;
        tax_year?: string | null;
        fiscal_year_end?: string | null;
        tax_preparer?: string | null;
        current_cpa?: string | null;
      };
      banking?: {
        connect_bank_now?: boolean | null;
        primary_bank?: string | null;
        bank_account_count?: string | null;
        business_credit_cards?: boolean | null;
        loans?: boolean | null;
        line_of_credit?: boolean | null;
        payment_platforms?: string[] | null;
        accounting_software?: string | null;
        payroll_provider?: string | null;
      };
      operations?: string[] | null;
      financial_snapshot?: {
        approximate_annual_revenue?: string | null;
        average_monthly_revenue?: number | null;
        average_monthly_expenses?: number | null;
        profitability?: string | null;
      };
      employee_type?: string | null;
      goals?: string[] | null;
      funding?: {
        plans_to_apply?: string | null;
        purposes?: string[] | null;
        desired_amount?: number | null;
        timeline?: string | null;
      };
      operations_notes?: string | null;
      cpa_profile?: { has_cpa?: boolean | null; wants_cpa_match?: boolean | null; wants_bookkeeper?: boolean | null };
      ai_preferences?: string[] | null;
      documents?: { upload_now?: boolean | null; requested_documents?: string[] | null };
      security?: { enable_mfa?: boolean | null; invite_team_members?: boolean | null };
      legal?: { certified_accurate?: boolean | null; authorized_analysis?: boolean | null; accepted_terms?: boolean | null; accepted_privacy?: boolean | null };
    } | undefined;
    setBusinessDescription(onboarding?.business_description ?? "");
    setNaics(onboarding?.naics_code ?? "");
    setBusinessStatus(onboarding?.business_status ?? "");
    setYearEstablished(onboarding?.year_established ?? "");
    setStartDate(onboarding?.date_business_started ?? "");
    setEmployees(onboarding?.employee_count ?? "");
    setContractors(onboarding?.independent_contractor_count ?? "");
    setSuite(onboarding?.address?.suite ?? "");
    setCountry(onboarding?.address?.country ?? "United States");
    setLocationType(onboarding?.address?.location_type ?? "");
    setMailingSame(onboarding?.address?.mailing_same_as_business ?? true);
    setOwnerName(onboarding?.ownership?.owner_name ?? "");
    setOwnerTitle(onboarding?.ownership?.owner_title ?? "Owner");
    setOwnershipPercent(String(onboarding?.ownership?.ownership_percent ?? 100));
    setAdditionalOwners(onboarding?.ownership?.additional_owners_notes ?? "");
    setFederalTaxClass(onboarding?.tax?.federal_tax_classification ?? orgRow.org_type ?? "");
    setStateIncorporation(onboarding?.tax?.state_of_incorporation ?? "");
    setStateRegistrationNumber(onboarding?.tax?.state_registration_number ?? "");
    setBusinessLicenseNumber(onboarding?.tax?.business_license_number ?? "");
    setSalesTaxPermit(onboarding?.tax?.sales_tax_permit ? "yes" : "no");
    setSalesTaxNumber(onboarding?.tax?.sales_tax_number ?? "");
    setPayrollTaxNumber(onboarding?.tax?.payroll_tax_number ?? "");
    setTaxYear(onboarding?.tax?.tax_year ?? "Calendar");
    setFiscalYearEnd(onboarding?.tax?.fiscal_year_end ?? "");
    setTaxPreparer(onboarding?.tax?.tax_preparer ?? "");
    setCurrentCpa(onboarding?.tax?.current_cpa ?? "");
    setConnectBankNow(onboarding?.banking?.connect_bank_now ? "yes" : "later");
    setPrimaryBank(onboarding?.banking?.primary_bank ?? "");
    setBankAccountCount(onboarding?.banking?.bank_account_count ?? "");
    setBusinessCreditCards(onboarding?.banking?.business_credit_cards ? "yes" : "no");
    setLoans(onboarding?.banking?.loans ? "yes" : "no");
    setLineOfCredit(onboarding?.banking?.line_of_credit ? "yes" : "no");
    setPaymentPlatforms(onboarding?.banking?.payment_platforms ?? []);
    setAccountingSoftware(onboarding?.banking?.accounting_software ?? "");
    setPayrollProvider(onboarding?.banking?.payroll_provider ?? "");
    setOperations(onboarding?.operations ?? []);
    setEmployeeType(onboarding?.employee_type ?? "");
    setAnnualRevenue(onboarding?.financial_snapshot?.approximate_annual_revenue ?? "");
    setMonthlyRevenue(String(onboarding?.financial_snapshot?.average_monthly_revenue ?? ""));
    setMonthlyExpenses(String(onboarding?.financial_snapshot?.average_monthly_expenses ?? ""));
    setProfitability(onboarding?.financial_snapshot?.profitability ?? "");
    setGoals(onboarding?.goals ?? []);
    setApplyingFunding(onboarding?.funding?.plans_to_apply ?? "maybe");
    setFundingPurposes(onboarding?.funding?.purposes ?? []);
    setDesiredFundingAmount(String(onboarding?.funding?.desired_amount ?? ""));
    setFundingTimeline(onboarding?.funding?.timeline ?? "");
    setOperationsNotes(onboarding?.operations_notes ?? "");
    setHasCpa(onboarding?.cpa_profile?.has_cpa ? "yes" : "no");
    setWantsCpaMatch(onboarding?.cpa_profile?.wants_cpa_match === false ? "no" : "yes");
    setWantsBookkeeper(onboarding?.cpa_profile?.wants_bookkeeper ? "yes" : "no");
    setAiNotifications(onboarding?.ai_preferences ?? []);
    setUploadDocumentsNow(onboarding?.documents?.upload_now ? "now" : "later");
    setDocuments(onboarding?.documents?.requested_documents ?? []);
    setEnableMfa(onboarding?.security?.enable_mfa ? "yes" : "no");
    setInviteTeamMembers(onboarding?.security?.invite_team_members ? "yes" : "no");
    setCertifyAccurate(onboarding?.legal?.certified_accurate ?? false);
    setAuthorizeAnalysis(onboarding?.legal?.authorized_analysis ?? false);
    setAcceptTerms(onboarding?.legal?.accepted_terms ?? false);
    setAcceptPrivacy(onboarding?.legal?.accepted_privacy ?? false);
  }, [orgRow, userRow?.email, profile?.email]);

  const validatePersonal = () => {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    return null;
  };

  const validateBusiness = () => {
    if (!businessName.trim()) return "Business name is required.";
    if (!orgType) return "Business type is required.";
    if (!industry) return "Industry is required.";
    if (!einTin.trim()) return "EIN / TIN is required.";
    if (!stateId) return "Business state is required.";
    if (!certifyAccurate) return "Please certify that the business information is accurate.";
    return null;
  };

  const validateBusinessStep = () => {
    if (businessStep === 0) {
      if (!businessName.trim()) return "Business name is required.";
      if (!orgType) return "Business type is required.";
      if (!industry) return "Industry is required.";
    }
    if (businessStep === 1 && !stateId) return "Business state is required.";
    if (businessStep === 2) {
      if (!einTin.trim()) return "EIN / TIN is required.";
      if (!federalTaxClass) return "Federal tax classification is required.";
    }
    if (businessStep === 4 && (!certifyAccurate || !authorizeAnalysis || !acceptTerms || !acceptPrivacy)) return "Please complete all legal confirmations.";
    return null;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (numericId === null) throw new Error("No user ID available");
      const personalError = validatePersonal();
      if (personalError) throw new Error(personalError);
      const businessError = validateBusiness();
      if (businessError) throw new Error(businessError);

      const { error: userError } = await supabase
        .from("users")
        .update({
          first_name: firstName.trim(),
          middle_name: middleName.trim() || null,
          last_name: lastName.trim(),
          phone_number: phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", numericId);
      if (userError) throw userError;

      const selectedStateName = states.find((state) => String(state.id) === stateId)?.name ?? null;
      const existingDebts = orgRow?.debts && typeof orgRow.debts === "object" ? orgRow.debts : {};
      const onboardingProfile = {
        ...(existingDebts.onboarding_profile as Record<string, unknown> | undefined),
        business_description: businessDescription.trim() || null,
        naics_code: naics.trim() || null,
        business_status: businessStatus || null,
        year_established: yearEstablished || null,
        date_business_started: startDate || null,
        employee_count: employees || null,
        independent_contractor_count: contractors || null,
        address: {
          street: street.trim() || null,
          suite: suite.trim() || null,
          city: city.trim() || null,
          state: selectedStateName,
          zip: zip.trim() || null,
          country: country.trim() || null,
          mailing_same_as_business: mailingSame,
          location_type: locationType || null,
        },
        ownership: {
          owner_name: ownerName.trim() || null,
          owner_title: ownerTitle.trim() || null,
          ownership_percent: Number(ownershipPercent) || 100,
          additional_owners_notes: additionalOwners.trim() || null,
        },
        tax: {
          federal_tax_classification: federalTaxClass || null,
          state_of_incorporation: stateIncorporation || null,
          state_registration_number: stateRegistrationNumber.trim() || null,
          business_license_number: businessLicenseNumber.trim() || null,
          sales_tax_permit: salesTaxPermit === "yes",
          sales_tax_number: salesTaxNumber.trim() || null,
          payroll_tax_number: payrollTaxNumber.trim() || null,
          tax_year: taxYear,
          fiscal_year_end: fiscalYearEnd || null,
          tax_preparer: taxPreparer || null,
          current_cpa: currentCpa.trim() || null,
        },
        banking: {
          connect_bank_now: connectBankNow === "yes",
          primary_bank: primaryBank.trim() || null,
          bank_account_count: bankAccountCount.trim() || null,
          business_credit_cards: businessCreditCards === "yes",
          loans: loans === "yes",
          line_of_credit: lineOfCredit === "yes",
          payment_platforms: paymentPlatforms,
          accounting_software: accountingSoftware || null,
          payroll_provider: payrollProvider || null,
        },
        operations,
        employee_type: employeeType || null,
        financial_snapshot: {
          approximate_annual_revenue: annualRevenue || null,
          average_monthly_revenue: Number(monthlyRevenue) || null,
          average_monthly_expenses: Number(monthlyExpenses) || null,
          profitability: profitability || null,
        },
        goals,
        funding: {
          plans_to_apply: applyingFunding,
          purposes: fundingPurposes,
          desired_amount: Number(desiredFundingAmount) || null,
          timeline: fundingTimeline.trim() || null,
        },
        operations_notes: operationsNotes.trim() || null,
        cpa_profile: {
          has_cpa: hasCpa === "yes",
          wants_cpa_match: wantsCpaMatch === "yes",
          wants_bookkeeper: wantsBookkeeper === "yes",
        },
        ai_preferences: aiNotifications,
        documents: {
          upload_now: uploadDocumentsNow === "now",
          requested_documents: documents,
        },
        security: {
          enable_mfa: enableMfa === "yes",
          invite_team_members: inviteTeamMembers === "yes",
        },
        legal: {
          certified_accurate: certifyAccurate,
          authorized_analysis: authorizeAnalysis,
          accepted_terms: acceptTerms,
          accepted_privacy: acceptPrivacy,
        },
        business_profile_completed: true,
        completed_from_profile: true,
        completed_at: new Date().toISOString(),
      };
      const payload = {
        name: businessName.trim(),
        org_type: orgType,
        industry,
        ein_tin: einTin.trim(),
        state: Number(stateId),
        street: [street.trim(), suite.trim()].filter(Boolean).join(", "),
        city: city.trim(),
        zip: zip.trim(),
        phone: businessPhone.trim() || null,
        email: businessEmail.trim() || null,
        website: website.trim() || null,
        primary_state: selectedStateName,
        industry_niche: industry,
        debts: {
          ...existingDebts,
          onboarding_profile: onboardingProfile,
          business_profile_completed: true,
        },
      };

      if (orgRow?.id) {
        const { error } = await supabase.from("organizations").update(payload).eq("id", orgRow.id);
        if (error) throw error;
        return { orgId: orgRow.id, created: false };
      }

      await checkAddBusiness();
      const { data, error } = await supabase
        .from("organizations")
        .insert({ ...payload, owner_id: numericId })
        .select("id")
        .single();
      if (error) throw error;
      return { orgId: (data as { id: number }).id, created: true };
    },
    onSuccess: ({ orgId, created }) => {
      setActiveOrgId(orgId);
      if (created) window.sessionStorage.setItem(profileSurveyKey, String(orgId));
      toast.success(created ? "Profile and business saved. Continue with the business survey." : "Profile updated successfully.");
      qc.invalidateQueries({ queryKey: ["profile_user", numericId] });
      qc.invalidateQueries({ queryKey: ["profile_org", numericId] });
      qc.invalidateQueries({ queryKey: ["user_org", numericId] });
      qc.invalidateQueries({ queryKey: ["organizations_list", numericId] });
      qc.invalidateQueries({ queryKey: ["auth_guard_organization_count", numericId] });
      setLocation("/user");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save profile: ${error.message}`);
    },
  });

  const continuePersonal = () => {
    const error = validatePersonal();
    if (error) {
      toast.error(error);
      return;
    }
    setStep(1);
  };

  const continueBusinessStep = () => {
    const error = validateBusinessStep();
    if (error) {
      toast.error(error);
      return;
    }
    setBusinessStep((current) => Math.min(BUSINESS_STEPS.length - 1, current + 1));
  };

  const isLoading = userLoading || orgLoading;
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
  const CurrentBusinessIcon = BUSINESS_STEPS[businessStep].icon;

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6">
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight">Set Up Your Profile</h1>
        <p className="mb-10 text-center text-sm text-muted-foreground">
          Complete your profile and add your business before BookSmart starts the onboarding survey.
        </p>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : (
          <div className="space-y-0">
            <ProfileSection index={0} title="Personal Information" active={step === 0} onClick={() => setStep(0)}>
              <div className="space-y-8 pt-3">
                <div className="flex justify-center">
                  <div className="relative">
                    <Avatar className="h-28 w-28 bg-white text-muted-foreground">
                      {userRow?.img_url && <AvatarImage src={userRow.img_url} />}
                      <AvatarFallback className="bg-white text-muted-foreground">
                        {initials === "?" ? <Camera className="h-8 w-8 text-muted-foreground/70" /> : <span className="text-3xl font-bold text-primary">{initials}</span>}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                      aria-label="Profile photo upload is not available yet"
                      onClick={() => toast.info("Photo upload is not available yet.")}
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <TextField label="First Name *" value={firstName} onChange={setFirstName} hideLabel />
                  <TextField label="Middle Name" value={middleName} onChange={setMiddleName} hideLabel />
                  <TextField label="Last Name *" value={lastName} onChange={setLastName} hideLabel />
                </div>
                <TextField label="Phone Number" value={phone} onChange={setPhone} type="tel" hideLabel />

                <div className="flex justify-end">
                  <Button type="button" onClick={continuePersonal}>Next Step</Button>
                </div>
              </div>
            </ProfileSection>

            <ProfileSection index={1} title="Business Information" active={step === 1} onClick={() => setStep(1)} last>
              <div className="space-y-5">
                <div>
                  <div className="grid gap-2 text-xs font-medium text-muted-foreground sm:grid-cols-3 lg:grid-cols-5">
                    {BUSINESS_STEPS.map((item, index) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => setBusinessStep(index)}
                        className={`flex items-center justify-center gap-2 rounded-md border px-2 py-2 transition-colors ${
                          index === businessStep ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card/40 hover:border-primary/50"
                        }`}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${((businessStep + 1) / BUSINESS_STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CurrentBusinessIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{BUSINESS_STEPS[businessStep].title}</h3>
                    <p className="text-sm text-muted-foreground">Step {businessStep + 1} of {BUSINESS_STEPS.length}</p>
                  </div>
                </div>

                {businessStep === 0 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TextField label="Legal Business Name *" value={businessName} onChange={setBusinessName} hideLabel />
                    <SelectField label="Business Type *" value={orgType} onChange={setOrgType} options={ENTITY_TYPES} placeholder="Select business type" />
                    <SelectField label="Industry *" value={industry} onChange={setIndustry} options={INDUSTRIES} placeholder="Select industry" />
                    <TextField label="NAICS Code" value={naics} onChange={setNaics} hideLabel />
                    <SelectField label="Business Status" value={businessStatus} onChange={setBusinessStatus} options={BUSINESS_STATUS} placeholder="Select status" />
                    <TextField label="Year Established" value={yearEstablished} onChange={setYearEstablished} type="number" hideLabel />
                    <TextField label="Date Business Started" value={startDate} onChange={setStartDate} type="date" />
                    <SelectField label="Number of Employees" value={employees} onChange={setEmployees} options={EMPLOYEE_COUNTS} placeholder="Select count" />
                    <TextField label="Independent Contractors" value={contractors} onChange={setContractors} type="number" hideLabel />
                    <TextField label="Website" value={website} onChange={setWebsite} hideLabel />
                    <TextField label="Business Email" value={businessEmail} onChange={setBusinessEmail} type="email" hideLabel />
                    <TextField label="Business Phone" value={businessPhone} onChange={setBusinessPhone} type="tel" hideLabel />
                    <div className="space-y-2 lg:col-span-2">
                      <Label>Products or services</Label>
                      <Textarea
                        value={businessDescription}
                        onChange={(event) => setBusinessDescription(event.target.value)}
                        placeholder="Describe what this business sells or provides."
                        className="min-h-28 bg-card text-base"
                      />
                    </div>
                  </div>
                )}

                {businessStep === 1 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TextField label="Street" value={street} onChange={setStreet} hideLabel />
                    <TextField label="Suite" value={suite} onChange={setSuite} hideLabel />
                    <TextField label="City" value={city} onChange={setCity} hideLabel />
                    <SelectField
                      label="State *"
                      value={stateId}
                      onChange={setStateId}
                      options={states.map((state) => ({ value: String(state.id), label: state.name }))}
                      placeholder="Select state"
                    />
                    <TextField label="ZIP Code" value={zip} onChange={setZip} hideLabel />
                    <TextField label="Country" value={country} onChange={setCountry} hideLabel />
                    <SelectField label="Business Location Type" value={locationType} onChange={setLocationType} options={LOCATION_TYPES} placeholder="Select location" />
                    <CheckRow label="Mailing address is same as business address" checked={mailingSame} onChange={setMailingSame} className="self-end" />
                    <TextField label="Owner Full Name" value={ownerName} onChange={setOwnerName} hideLabel />
                    <TextField label="Owner Title" value={ownerTitle} onChange={setOwnerTitle} hideLabel />
                    <TextField label="Ownership Percentage" value={ownershipPercent} onChange={setOwnershipPercent} type="number" hideLabel />
                    <div className="space-y-2 lg:col-span-2">
                      <Label>Additional owners</Label>
                      <Textarea
                        value={additionalOwners}
                        onChange={(event) => setAdditionalOwners(event.target.value)}
                        placeholder="Name, email, ownership %, role"
                        className="min-h-24 bg-card text-base"
                      />
                    </div>
                  </div>
                )}

                {businessStep === 2 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TextField label="EIN / TIN *" value={einTin} onChange={setEinTin} hideLabel />
                    <SelectField
                      label="Federal Tax Classification *"
                      value={federalTaxClass}
                      onChange={setFederalTaxClass}
                      options={["Sole Proprietor", "Single Member LLC", "Partnership", "S Corporation", "C Corporation", "Nonprofit"]}
                      placeholder="Select classification"
                    />
                    <SelectField
                      label="State of Incorporation"
                      value={stateIncorporation}
                      onChange={setStateIncorporation}
                      options={states.map((state) => ({ value: state.name, label: state.name }))}
                      placeholder="Select state"
                    />
                    <TextField label="State Registration Number" value={stateRegistrationNumber} onChange={setStateRegistrationNumber} hideLabel />
                    <TextField label="Business License Number" value={businessLicenseNumber} onChange={setBusinessLicenseNumber} hideLabel />
                    <SelectField label="Sales Tax Permit" value={salesTaxPermit} onChange={setSalesTaxPermit} options={["no", "yes"]} />
                    {salesTaxPermit === "yes" && <TextField label="Sales Tax Number" value={salesTaxNumber} onChange={setSalesTaxNumber} hideLabel />}
                    <TextField label="Payroll Tax Number" value={payrollTaxNumber} onChange={setPayrollTaxNumber} hideLabel />
                    <SelectField label="Business Tax Year" value={taxYear} onChange={setTaxYear} options={["Calendar", "Fiscal"]} />
                    {taxYear === "Fiscal" && <TextField label="Fiscal Year End" value={fiscalYearEnd} onChange={setFiscalYearEnd} type="date" />}
                    <SelectField label="Who Prepares Your Taxes?" value={taxPreparer} onChange={setTaxPreparer} options={TAX_PREPARERS} placeholder="Select preparer" />
                    <TextField label="Current CPA" value={currentCpa} onChange={setCurrentCpa} hideLabel />
                    <SelectField label="Do You Have a CPA?" value={hasCpa} onChange={setHasCpa} options={["no", "yes"]} />
                    <SelectField label="Match with BookSmart CPA?" value={wantsCpaMatch} onChange={setWantsCpaMatch} options={["yes", "no"]} />
                    <SelectField label="BookSmart Bookkeeper?" value={wantsBookkeeper} onChange={setWantsBookkeeper} options={["no", "yes"]} />
                  </div>
                )}

                {businessStep === 3 && (
                  <div className="space-y-5">
                    <MultiSection title="Business Operations" options={BUSINESS_OPERATIONS} selected={operations} onToggle={(value) => toggleList(operations, setOperations, value)} />
                    <div className="grid gap-4 lg:grid-cols-2">
                      <SelectField label="Employee Type" value={employeeType} onChange={setEmployeeType} options={EMPLOYEE_TYPES} placeholder="Select employee type" />
                      <SelectField label="Approximate Annual Revenue" value={annualRevenue} onChange={setAnnualRevenue} options={REVENUE_RANGES} placeholder="Select range" />
                      <TextField label="Average Monthly Revenue" value={monthlyRevenue} onChange={setMonthlyRevenue} type="number" hideLabel />
                      <TextField label="Average Monthly Expenses" value={monthlyExpenses} onChange={setMonthlyExpenses} type="number" hideLabel />
                      <SelectField label="Profitability" value={profitability} onChange={setProfitability} options={PROFITABILITY} placeholder="Select status" />
                    </div>
                    <MultiSection title="Business Goals" options={BUSINESS_GOALS} selected={goals} onToggle={(value) => toggleList(goals, setGoals, value)} />
                    <div className="grid gap-4 lg:grid-cols-2">
                      <SelectField label="Applying for Funding?" value={applyingFunding} onChange={setApplyingFunding} options={["yes", "no", "maybe"]} />
                      <TextField label="Desired Funding Amount" value={desiredFundingAmount} onChange={setDesiredFundingAmount} type="number" hideLabel />
                      <TextField label="Expected Timeline" value={fundingTimeline} onChange={setFundingTimeline} hideLabel />
                    </div>
                    <MultiSection title="Funding Purpose" options={FUNDING_PURPOSES} selected={fundingPurposes} onToggle={(value) => toggleList(fundingPurposes, setFundingPurposes, value)} />
                    <div className="space-y-2">
                      <Label>Operations notes</Label>
                      <Textarea
                        value={operationsNotes}
                        onChange={(event) => setOperationsNotes(event.target.value)}
                        placeholder="Describe sales channels, employees, contractors, products, services, or bookkeeping setup."
                        className="min-h-32 bg-card text-base"
                      />
                    </div>
                  </div>
                )}

                {businessStep === 4 && (
                  <div className="space-y-5">
                    <div className="space-y-3 rounded-lg border border-border/60 p-4">
                      <CheckRow label="I certify that the information is accurate." checked={certifyAccurate} onChange={setCertifyAccurate} />
                      <CheckRow label="I authorize BookSmart to analyze my financial data." checked={authorizeAnalysis} onChange={setAuthorizeAnalysis} />
                      <CheckRow label="I accept the Terms of Service." checked={acceptTerms} onChange={setAcceptTerms} />
                      <CheckRow label="I accept the Privacy Policy." checked={acceptPrivacy} onChange={setAcceptPrivacy} />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  {businessStep === 0 ? (
                    <Button type="button" variant="outline" onClick={() => setStep(0)}>Back</Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setBusinessStep((current) => Math.max(0, current - 1))}>Back</Button>
                  )}
                  {businessStep < BUSINESS_STEPS.length - 1 ? (
                    <Button type="button" onClick={continueBusinessStep}>Next Step</Button>
                  ) : (
                    <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Saving..." : orgRow?.id ? "Save Changes" : "Save & Continue"}
                    </Button>
                  )}
                </div>
              </div>
            </ProfileSection>
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hideLabel?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 bg-card text-base"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
}) {
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-12 bg-card text-base">
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {normalized.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label className={`flex min-h-12 items-center gap-3 rounded-md border border-border/50 bg-card px-3 py-2 text-sm ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function MultiSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-2 lg:col-span-2">
      <Label>{title}</Label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <CheckRow key={option} label={option} checked={selected.includes(option)} onChange={() => onToggle(option)} />
        ))}
      </div>
    </div>
  );
}

function toggleList(current: string[], setValue: (next: string[]) => void, value: string) {
  setValue(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
}

function ProfileSection({
  index,
  title,
  active,
  onClick,
  children,
  last = false,
}: {
  index: number;
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-5">
      <div className="relative flex justify-center">
        {!last && <div className="absolute top-8 h-full w-px bg-primary/80" />}
        <button
          type="button"
          onClick={onClick}
          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
            active ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
          }`}
        >
          {index + 1}
        </button>
      </div>
      <section className={`min-w-0 pb-10 ${active ? "min-h-[220px]" : "min-h-[94px]"}`}>
        <button
          type="button"
          onClick={onClick}
          className={`mb-6 flex w-full items-center rounded-md text-left transition-colors ${
            active ? "bg-card/35 px-5 py-5" : "px-0 py-1 hover:text-primary"
          }`}
        >
          <span className="text-xl font-bold text-foreground">{title}</span>
        </button>
        {active && <div>{children}</div>}
      </section>
    </div>
  );
}
