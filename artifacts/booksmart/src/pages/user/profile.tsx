import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, FileUp, Landmark, MapPin, PenLine } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AdditionalOwnersInput } from "@/components/additional-owners-input";
import { isValidUsPhone } from "@/lib/phone-validation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ProfileAvatarUploader } from "@/components/profile-avatar-uploader";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { checkAddBusiness } from "@/lib/plan-limits";
import BusinessDocumentUpload, { type ExtractedBusinessDocument } from "@/components/business-document-upload";
import {
  buildBusinessDocumentPrefill,
  preserveEnteredBusinessDocumentFields,
} from "@/lib/business-document-prefill";
import {
  BUSINESS_ENTITY_TYPES as ENTITY_TYPES,
  BUSINESS_ESTABLISHED_YEARS,
  BUSINESS_INDUSTRIES as INDUSTRIES,
  NAICS_BY_INDUSTRY,
} from "@/lib/business-information-options";
import {
  firstBusinessInformationError,
  cpaQuestionVisibility,
  formatEinInput,
  validateBusinessInformation,
  type BusinessInformationFormData,
} from "@/lib/business-information-schema";
import { buildBusinessInformationPayload, businessAddressForReload, cpaInformationForReload } from "@/lib/business-information-payload";

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

const AI_NOTIFICATIONS = ["Tax Savings", "Missing Deductions", "Large Expenses", "Cash Flow Issues", "Upcoming Tax Deadlines", "Funding Opportunities", "Business Health Score Changes", "Monthly Reports"];
const DOCUMENT_TYPES = ["Prior Tax Return", "Bank Statements", "Credit Card Statements", "Profit & Loss", "Balance Sheet", "Articles of Incorporation", "EIN Letter", "Business License", "Sales Tax Permit"];

const BUSINESS_STEPS = [
  { title: "Company Identity", icon: Building2 },
  { title: "Address & Ownership", icon: MapPin },
  { title: "Tax / Registration", icon: Landmark },
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
  const [setupMethod, setSetupMethod] = useState<"upload" | "manual" | null>(null);
  const [extractionNotice, setExtractionNotice] = useState("");
  const [extractionContext, setExtractionContext] = useState<{
    registeredAgent: string | null;
    organizers: string[];
    warnings: string[];
  } | null>(null);
  const saveInFlight = useRef(false);

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
  const [yearEstablished, setYearEstablished] = useState("");
  const [startDate, setStartDate] = useState("");
  const [suite, setSuite] = useState("");
  const [country, setCountry] = useState("United States");
  const [ownerName, setOwnerName] = useState("");
  const [ownerTitle, setOwnerTitle] = useState("Owner");
  const [ownershipPercent, setOwnershipPercent] = useState("100");
  const [additionalOwners, setAdditionalOwners] = useState("");
  const [stateIncorporation, setStateIncorporation] = useState("");
  const [stateRegistrationNumber, setStateRegistrationNumber] = useState("");
  const [hasCpa, setHasCpa] = useState("");
  const [wantsCpaMatch, setWantsCpaMatch] = useState("");
  const [currentCpa, setCurrentCpa] = useState("");
  const [currentCpaCompany, setCurrentCpaCompany] = useState("");
  const [currentCpaPhone, setCurrentCpaPhone] = useState("");
  const [primaryBank, setPrimaryBank] = useState("");
  const [bankAccountCount, setBankAccountCount] = useState("");
  const [connectBankNow, setConnectBankNow] = useState("later");
  const [businessCreditCards, setBusinessCreditCards] = useState("no");
  const [loans, setLoans] = useState("no");
  const [lineOfCredit, setLineOfCredit] = useState("no");
  const [aiNotifications, setAiNotifications] = useState<string[]>([]);
  const [uploadDocumentsNow, setUploadDocumentsNow] = useState("later");
  const [documents, setDocuments] = useState<string[]>([]);
  const [enableMfa, setEnableMfa] = useState("no");
  const [inviteTeamMembers, setInviteTeamMembers] = useState("no");

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
    setSetupMethod("manual");
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
        street?: string | null;
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
      cpa_profile?: { has_cpa?: boolean | null; wants_cpa_match?: boolean | null; current_cpa?: string | null; current_cpa_company?: string | null; current_cpa_phone?: string | null; wants_bookkeeper?: boolean | null };
      ai_preferences?: string[] | null;
      documents?: { upload_now?: boolean | null; requested_documents?: string[] | null };
      security?: { enable_mfa?: boolean | null; invite_team_members?: boolean | null };
      legal?: { certified_accurate?: boolean | null; authorized_analysis?: boolean | null; accepted_terms?: boolean | null; accepted_privacy?: boolean | null };
    } | undefined;
    setBusinessDescription(onboarding?.business_description ?? "");
    const reloadedAddress = businessAddressForReload({
      coreStreet: orgRow.street,
      onboardingProfile: onboarding as Record<string, unknown> | undefined,
    });
    setStreet(reloadedAddress.street);
    setNaics(onboarding?.naics_code ?? "");
    setYearEstablished(onboarding?.year_established ?? "");
    setStartDate(onboarding?.date_business_started ?? "");
    setSuite(reloadedAddress.suite);
    setCountry(onboarding?.address?.country ?? "United States");
    setOwnerName(onboarding?.ownership?.owner_name ?? "");
    setOwnerTitle(onboarding?.ownership?.owner_title ?? "Owner");
    setOwnershipPercent(String(onboarding?.ownership?.ownership_percent ?? 100));
    setAdditionalOwners(onboarding?.ownership?.additional_owners_notes ?? "");
    setStateIncorporation(onboarding?.tax?.state_of_incorporation ?? "");
    setStateRegistrationNumber(onboarding?.tax?.state_registration_number ?? "");
    const cpaInformation = cpaInformationForReload(onboarding as Record<string, unknown> | undefined);
    setHasCpa(cpaInformation.hasCpa);
    setWantsCpaMatch(cpaInformation.wantsCpaMatch);
    setCurrentCpa(cpaInformation.currentCpa);
    setCurrentCpaCompany(cpaInformation.currentCpaCompany);
    setCurrentCpaPhone(cpaInformation.currentCpaPhone);
    setConnectBankNow(onboarding?.banking?.connect_bank_now ? "yes" : "later");
    setPrimaryBank(onboarding?.banking?.primary_bank ?? "");
    setBankAccountCount(onboarding?.banking?.bank_account_count ?? "");
    setBusinessCreditCards(onboarding?.banking?.business_credit_cards ? "yes" : "no");
    setLoans(onboarding?.banking?.loans ? "yes" : "no");
    setLineOfCredit(onboarding?.banking?.line_of_credit ? "yes" : "no");
    setAiNotifications(onboarding?.ai_preferences ?? []);
    setUploadDocumentsNow(onboarding?.documents?.upload_now ? "now" : "later");
    setDocuments(onboarding?.documents?.requested_documents ?? []);
    setEnableMfa(onboarding?.security?.enable_mfa ? "yes" : "no");
    setInviteTeamMembers(onboarding?.security?.invite_team_members ? "yes" : "no");
  }, [orgRow, userRow?.email, profile?.email]);

  const validatePersonal = () => {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (phone.trim() && !isValidUsPhone(phone)) return "Enter a valid 10-digit U.S. phone number.";
    return null;
  };

  const applyExtractedBusiness = (extracted: ExtractedBusinessDocument) => {
    const extractedPrefill = buildBusinessDocumentPrefill(extracted, states);
    const prefill = preserveEnteredBusinessDocumentFields({
      businessName, orgType, stateId, stateIncorporation, yearEstablished, startDate,
      street, suite, city, zip, country, stateRegistrationNumber,
    }, extractedPrefill);
    setBusinessName(prefill.businessName ?? "");
    setOrgType(prefill.orgType ?? "");
    setStateId(prefill.stateId ?? "");
    setStateIncorporation(prefill.stateIncorporation ?? "");
    setYearEstablished(prefill.yearEstablished ?? "");
    setStartDate(prefill.startDate ?? "");
    setStreet(prefill.street ?? "");
    setSuite(prefill.suite ?? "");
    setCity(prefill.city ?? "");
    setZip(prefill.zip ?? "");
    setCountry(prefill.country ?? "");
    setStateRegistrationNumber(prefill.stateRegistrationNumber ?? "");

    setExtractionContext({
      registeredAgent: extracted.registeredAgent?.name ?? null,
      organizers: extracted.organizers.map((organizer) => organizer.name).filter((name): name is string => !!name),
      warnings: extracted.warnings ?? [],
    });
    setExtractionNotice("We found some information in your business document. Please review it before continuing.");
    setSetupMethod("manual");
    setBusinessStep(0);
  };

  const businessInformationForm = (): BusinessInformationFormData => ({
    legalName: businessName, entityType: orgType, industry, naics, description: businessDescription,
    status: "", yearEstablished, startDate, employees: "", contractors: "", website,
    businessEmail, businessPhone, street, suite, city, state: stateId, zip, country,
    mailingSame: true, locationType: "", ownerName, ownerTitle, ownershipPercent, additionalOwners,
    einTin, federalTaxClass: "", stateIncorporation, stateRegistrationNumber, businessLicenseNumber: "",
    salesTaxPermit: "no", salesTaxNumber: "", payrollTaxNumber: "", taxYear: "Calendar",
    fiscalYearEnd: "", taxPreparer: "", currentCpa, currentCpaCompany, currentCpaPhone, connectBankNow, primaryBank,
    bankAccountCount, businessCreditCards, loans, lineOfCredit, paymentPlatforms: [],
    accountingSoftware: "", payrollProvider: "", operations: [], employeeType: "",
    annualRevenue: "", monthlyRevenue: "", monthlyExpenses: "", profitability: "", goals: [],
    applyingFunding: "maybe", fundingPurposes: [], desiredFundingAmount: "", fundingTimeline: "",
    operationsNotes: "", hasCpa, wantsCpaMatch, wantsBookkeeper: "no",
    certifyAccurate: false, authorizeAnalysis: false, acceptTerms: false, acceptPrivacy: false,
  });

  const validateBusiness = () =>
    firstBusinessInformationError(validateBusinessInformation(businessInformationForm()));

  const validateBusinessStep = () => {
    const errors = validateBusinessInformation(businessInformationForm());
    const fieldsByStep: Array<Array<keyof typeof errors>> = [
      ["legalName", "entityType", "industry", "yearEstablished", "website", "businessEmail", "businessPhone"],
      ["state", "zip", "ownershipPercent"],
      ["einTin", "currentCpa", "currentCpaCompany", "currentCpaPhone"],
    ];
    return firstBusinessInformationError(Object.fromEntries(
      fieldsByStep[businessStep].filter((key) => errors[key]).map((key) => [key, errors[key]]),
    ));
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
      const payload = buildBusinessInformationPayload({
        form: businessInformationForm(),
        stateName: selectedStateName,
        existingDebts,
        completedFromProfile: true,
        onboardingExtras: {
          ai_preferences: aiNotifications,
          documents: {
            upload_now: uploadDocumentsNow === "now",
            requested_documents: documents,
          },
          security: {
            enable_mfa: enableMfa === "yes",
            invite_team_members: inviteTeamMembers === "yes",
          },
        },
      });

      // Initial onboarding is allowed to create only the first organization.
      // Re-query at save time so a refresh, prior attempt, or another completed
      // onboarding request reuses the existing business instead of inserting.
      const { data: ownedOrganizations, error: ownedOrganizationsError } = await supabase
        .from("organizations")
        .select("id")
        .eq("owner_id", numericId)
        .order("id", { ascending: true })
        .limit(1);
      if (ownedOrganizationsError) throw ownedOrganizationsError;
      const existingOrgId = orgRow?.id ?? (ownedOrganizations?.[0] as { id?: number } | undefined)?.id ?? null;

      if (existingOrgId) {
        const { error } = await supabase
          .from("organizations")
          .update(payload)
          .eq("id", existingOrgId)
          .eq("owner_id", numericId);
        if (error) throw error;
        return { orgId: existingOrgId, created: false };
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
      // Prevent AuthGuard from redirecting straight back to the profile page
      // while its previously cached zero-organization result is refetching.
      qc.setQueryData<number>(["auth_guard_organization_count", numericId], (current) =>
        Math.max(current ?? 0, 1),
      );
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
    onSettled: () => {
      saveInFlight.current = false;
    },
  });

  const saveProfile = () => {
    if (saveInFlight.current || saveMutation.isPending) return;
    saveInFlight.current = true;
    saveMutation.mutate();
  };

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
  const cpaVisibility = cpaQuestionVisibility(hasCpa);

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto w-full max-w-6xl px-3 pt-4 sm:px-4 sm:pt-6">
        <h1 className="mb-3 text-center text-2xl font-bold tracking-tight sm:mb-4">Set Up Your Profile</h1>
        <p className="mb-7 text-center text-sm text-muted-foreground sm:mb-10">
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
                <ProfileAvatarUploader currentUrl={userRow?.img_url} initials={initials} />

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <TextField label="First Name *" value={firstName} onChange={setFirstName} hideLabel />
                  <TextField label="Middle Name" value={middleName} onChange={setMiddleName} hideLabel />
                  <TextField label="Last Name *" value={lastName} onChange={setLastName} hideLabel />
                </div>
                <PhoneField label="Phone Number" value={phone} onChange={setPhone} />

                <div className="flex justify-end">
                  <Button type="button" onClick={continuePersonal} className="w-full sm:w-auto">Next Step</Button>
                </div>
              </div>
            </ProfileSection>

            <ProfileSection index={1} title="Business Information" active={step === 1} onClick={() => setStep(1)} last>
              <div className="space-y-5">
                {setupMethod === null && !orgRow ? (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold">Set up your business</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose how you would like to provide your business information.
                      </p>
                    </div>
                    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setSetupMethod("upload")}
                        className="relative min-w-0 rounded-xl border border-primary bg-primary/5 p-4 pt-14 text-left transition-colors hover:bg-primary/10 sm:p-5 sm:pt-5"
                      >
                        <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                          Recommended
                        </span>
                        <FileUp className="mb-4 h-7 w-7 text-primary" />
                        <h3 className="font-semibold">Upload Business Document</h3>
                        <p className="mt-2 break-words text-sm text-muted-foreground sm:pr-2">
                          Upload Articles of Organization, a Certificate of Formation, Articles of Incorporation,
                          or a similar official registration document. BookSmart will prefill what it can find.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSetupMethod("manual")}
                        className="min-w-0 rounded-xl border border-border/70 bg-card/35 p-4 text-left transition-colors hover:border-primary/60 sm:p-5"
                      >
                        <PenLine className="mb-4 h-7 w-7 text-primary" />
                        <h3 className="font-semibold">Enter Details Manually</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Continue with the existing business setup form and enter the information yourself.
                        </p>
                      </button>
                    </div>
                  </div>
                ) : setupMethod === "upload" && !orgRow ? (
                  <BusinessDocumentUpload
                    onExtracted={applyExtractedBusiness}
                    onManual={() => setSetupMethod("manual")}
                  />
                ) : (
                  <>
                {extractionNotice && (
                  <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
                    <p className="font-medium text-foreground">{extractionNotice}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Extracted values are editable below and will not be saved until you select Save &amp; Continue.
                    </p>
                    {extractionContext && (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {extractionContext.registeredAgent && <p>Registered agent found: {extractionContext.registeredAgent}</p>}
                        {extractionContext.organizers.length > 0 && <p>Organizers found: {extractionContext.organizers.join(", ")}</p>}
                        {extractionContext.warnings.map((warning) => <p key={warning}>Note: {warning}</p>)}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      className="mt-2 h-auto p-0"
                      onClick={() => {
                        setExtractionNotice("");
                        setExtractionContext(null);
                        setSetupMethod("upload");
                      }}
                    >
                      Try Another Document
                    </Button>
                  </div>
                )}
                <div>
                  <div className="hidden gap-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-2 xl:grid-cols-4">
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
                  <div className="flex min-w-0 items-center justify-between gap-3 text-sm sm:hidden">
                    <span className="min-w-0 break-words font-semibold text-foreground">{BUSINESS_STEPS[businessStep].title}</span>
                    <span className="shrink-0 text-muted-foreground">Step {businessStep + 1} of {BUSINESS_STEPS.length}</span>
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
                  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                    <p className="text-sm text-muted-foreground xl:col-span-2">Identify the registered business and provide contact details used for its BookSmart profile.</p>
                    <TextField label="Legal Business Name *" value={businessName} onChange={setBusinessName} hideLabel />
                    <SelectField label="Business Type *" value={orgType} onChange={setOrgType} options={ENTITY_TYPES} placeholder="Select business type" preserveOrder />
                    <SelectField label="Industry *" value={industry} onChange={(value) => { setIndustry(value); setNaics(NAICS_BY_INDUSTRY[value] ?? ""); }} options={INDUSTRIES} placeholder="Select industry" openDownward />
                    <TextField label="NAICS Code" value={naics} onChange={setNaics} hideLabel />
                    <SelectField label="Year Established" value={yearEstablished} onChange={setYearEstablished} options={BUSINESS_ESTABLISHED_YEARS} placeholder="Select year" preserveOrder openDownward />
                    <TextField label="Website" value={website} onChange={setWebsite} hideLabel />
                    <TextField label="Business Email" value={businessEmail} onChange={setBusinessEmail} type="email" hideLabel />
                    <PhoneField label="Business Phone" value={businessPhone} onChange={setBusinessPhone} />
                    <div className="min-w-0 space-y-2 xl:col-span-2">
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
                  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                    <p className="text-sm text-muted-foreground xl:col-span-2">Use the registered business address and identify the primary legal owner.</p>
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
                    <div className="grid min-w-0 gap-4 xl:col-span-2 sm:grid-cols-3">
                      <TextField label="Owner Full Name" value={ownerName} onChange={setOwnerName} hideLabel />
                      <TextField label="Owner Title" value={ownerTitle} onChange={setOwnerTitle} hideLabel />
                      <TextField label="Ownership Percentage" value={ownershipPercent} onChange={setOwnershipPercent} type="number" hideLabel />
                    </div>
                    <div className="min-w-0 xl:col-span-2">
                      <AdditionalOwnersInput primaryPercentage={ownershipPercent} value={additionalOwners} onChange={setAdditionalOwners} />
                    </div>
                  </div>
                )}

                {businessStep === 2 && (
                  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                    <p className="text-sm text-muted-foreground xl:col-span-2">Provide the identifiers used to match the business with its registration and tax records.</p>
                    <TextField
                      label="EIN / TIN *"
                      value={einTin}
                      onChange={(value) => setEinTin(formatEinInput(value))}
                      placeholder="12-3456789"
                      helperText="Enter the 9-digit EIN shown on your IRS letter (example: 12-3456789)."
                      inputMode="numeric"
                      maxLength={10}
                      hideLabel
                    />
                    <SelectField
                      label="State of Incorporation"
                      value={stateIncorporation}
                      onChange={setStateIncorporation}
                      options={states.map((state) => ({ value: state.name, label: state.name }))}
                      placeholder="Select state"
                    />
                    <div className="min-w-0 space-y-4 rounded-lg border border-border/60 bg-card/40 p-4 xl:col-span-2">
                      <div>
                        <h4 className="font-semibold text-foreground">CPA Information</h4>
                        <p className="mt-1 text-sm text-muted-foreground">Tell us about your current CPA relationship so BookSmart can better support your accounting needs.</p>
                      </div>
                      <SelectField label="Do you currently have a CPA?" value={hasCpa} onChange={setHasCpa} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} placeholder="Select Yes or No" />
                      {cpaVisibility.showCurrentCpa && (
                        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
                          <TextField label="CPA Name *" value={currentCpa} onChange={setCurrentCpa} hideLabel />
                          <TextField label="CPA Company *" value={currentCpaCompany} onChange={setCurrentCpaCompany} hideLabel />
                          <PhoneField label="CPA Phone Number *" value={currentCpaPhone} onChange={setCurrentCpaPhone} />
                        </div>
                      )}
                      {cpaVisibility.showCpaMatch && (
                        <SelectField label="Would you like BookSmart to help you find a CPA?" value={wantsCpaMatch} onChange={setWantsCpaMatch} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} placeholder="Select Yes or No" />
                      )}
                    </div>
                  </div>
                )}


                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                  {businessStep === 0 ? (
                    <Button type="button" variant="outline" onClick={() => setStep(0)}>Back</Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setBusinessStep((current) => Math.max(0, current - 1))}>Back</Button>
                  )}
                  {businessStep < BUSINESS_STEPS.length - 1 ? (
                    <Button type="button" onClick={continueBusinessStep}>Next Step</Button>
                  ) : (
                    <Button type="button" onClick={saveProfile} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Saving..." : orgRow?.id ? "Save Changes" : "Save & Continue"}
                    </Button>
                  )}
                </div>
                  </>
                )}
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
  placeholder,
  helperText,
  inputMode,
  maxLength,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  helperText?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  hideLabel?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder ?? label}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-describedby={helperText ? `${id}-help` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 min-w-0 bg-card text-base"
      />
      {helperText && <p id={`${id}-help`} className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

function PhoneField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <PhoneInput id={id} value={value} onChange={onChange} className="h-12 min-w-0 bg-card text-base" />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  openDownward = false,
  preserveOrder = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
  openDownward?: boolean;
  preserveOrder?: boolean;
}) {
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  if (!preserveOrder) {
    normalized.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-12 min-w-0 bg-card text-base">
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent
          className={openDownward ? "max-h-72 overflow-y-auto overscroll-contain" : undefined}
          side={openDownward ? "bottom" : undefined}
          align={openDownward ? "start" : undefined}
          avoidCollisions={!openDownward}
        >
          {normalized.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
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
    <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-x-5">
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
      <section className="min-w-0 pb-8 sm:pb-10">
        <button
          type="button"
          onClick={onClick}
          className={`mb-6 flex w-full items-center rounded-md text-left transition-colors ${
            active ? "bg-card/35 px-3 py-4 sm:px-5 sm:py-5" : "px-0 py-1 hover:text-primary"
          }`}
        >
          <span className="min-w-0 break-words text-lg font-bold text-foreground sm:text-xl">{title}</span>
        </button>
        {active && <div>{children}</div>}
      </section>
    </div>
  );
}
