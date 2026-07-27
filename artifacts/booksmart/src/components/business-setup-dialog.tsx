import { useEffect, useMemo, useState } from "react";
import { Loader2, Building2, MapPin, Landmark, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AdditionalOwnersInput } from "@/components/additional-owners-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { checkAddBusiness } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";
import {
  BUSINESS_ENTITY_TYPES as ENTITY_TYPES,
  BUSINESS_INDUSTRIES as INDUSTRIES,
  NAICS_BY_INDUSTRY,
} from "@/lib/business-information-options";
import {
  firstBusinessInformationError,
  cpaQuestionVisibility,
  validateBusinessInformation,
  type BusinessInformationFormData,
} from "@/lib/business-information-schema";
import { buildBusinessInformationPayload } from "@/lib/business-information-payload";

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

const INITIAL_FORM: BusinessInformationFormData = {
  legalName: "",
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
  currentCpaCompany: "",
  currentCpaPhone: "",
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
  employeeType: "",
  annualRevenue: "",
  monthlyRevenue: "",
  monthlyExpenses: "",
  profitability: "",
  goals: [] as string[],
  applyingFunding: "maybe",
  fundingPurposes: [] as string[],
  desiredFundingAmount: "",
  fundingTimeline: "",
  operationsNotes: "",
  hasCpa: "",
  wantsCpaMatch: "",
  wantsBookkeeper: "no",
  certifyAccurate: false,
  authorizeAnalysis: false,
  acceptTerms: false,
  acceptPrivacy: false,
};

type FormState = BusinessInformationFormData;
const STEPS = [
  { title: "Company Identity", icon: Building2 },
  { title: "Address & Ownership", icon: MapPin },
  { title: "Tax / Registration", icon: Landmark },
];

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
  const cpaVisibility = cpaQuestionVisibility(form.hasCpa);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm((current) => ({ ...current, businessEmail: current.businessEmail || defaultEmail }));
  }, [open, defaultEmail]);

  const selectedStateName = useMemo(
    () => states.find((s) => String(s.id) === form.state)?.name ?? "",
    [states, form.state]
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateStep() {
    const errors = validateBusinessInformation(form);
    const fieldsByStep: Array<Array<keyof typeof errors>> = [
      ["legalName", "entityType", "industry", "yearEstablished", "startDate", "website", "businessEmail", "businessPhone"],
      ["state", "zip", "ownershipPercent"],
      ["einTin"],
    ];
    return firstBusinessInformationError(Object.fromEntries(
      fieldsByStep[step].filter((key) => errors[key]).map((key) => [key, errors[key]]),
    ));
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
      const allErrors = validateBusinessInformation(form);
      const allError = firstBusinessInformationError(allErrors);
      if (allError) throw new Error(allError);
      const payload = buildBusinessInformationPayload({
        form,
        stateName: selectedStateName || null,
        ownerId,
      });

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
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[900px] sm:w-[calc(100vw-2rem)] sm:max-w-4xl sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <p className="text-sm text-muted-foreground lg:col-span-2">Identify the registered business and provide contact details used for its BookSmart profile.</p>
              <Field label="Legal business name *"><Input value={form.legalName} onChange={(e) => update("legalName", e.target.value)} placeholder="Acme LLC" /></Field>
              <Field label="Entity type *"><SelectField value={form.entityType} onChange={(v) => update("entityType", v)} options={ENTITY_TYPES} placeholder="Select entity" /></Field>
              <Field label="Industry *"><SelectField value={form.industry} onChange={(v) => { update("industry", v); update("naics", NAICS_BY_INDUSTRY[v] ?? ""); }} options={INDUSTRIES} placeholder="Select industry" openDownward /></Field>
              <Field label="NAICS code"><Input value={form.naics} onChange={(e) => update("naics", e.target.value)} placeholder="Auto-filled when available" /></Field>
              <Field label="Year established"><Input type="number" value={form.yearEstablished} onChange={(e) => update("yearEstablished", e.target.value)} placeholder="2024" /></Field>
              <Field label="Date business started"><Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field>
              <Field label="Business website"><Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://acme.com" /></Field>
              <Field label="Business email"><Input type="email" value={form.businessEmail} onChange={(e) => update("businessEmail", e.target.value)} /></Field>
              <Field label="Business phone"><PhoneInput value={form.businessPhone} onChange={(value) => update("businessPhone", value)} /></Field>
              <div className="min-w-0 lg:col-span-2"><Field label="Products or services"><Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe what this business sells or provides." /></Field></div>
            </div>
          )}

          {step === 1 && (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <p className="text-sm text-muted-foreground lg:col-span-2">Use the registered business address and identify the primary legal owner.</p>
              <Field label="Street"><Input value={form.street} onChange={(e) => update("street", e.target.value)} /></Field>
              <Field label="Suite"><Input value={form.suite} onChange={(e) => update("suite", e.target.value)} /></Field>
              <Field label="City"><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></Field>
              <Field label="State *"><SelectField value={form.state} onChange={(v) => update("state", v)} options={states.map((s) => ({ value: String(s.id), label: s.name }))} placeholder="Select state" /></Field>
              <Field label="ZIP"><Input value={form.zip} onChange={(e) => update("zip", e.target.value)} /></Field>
              <Field label="Country"><Input value={form.country} onChange={(e) => update("country", e.target.value)} /></Field>
              <div className="grid min-w-0 gap-4 lg:col-span-2 sm:grid-cols-3">
                <Field label="Owner full name"><Input value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} /></Field>
                <Field label="Owner title"><Input value={form.ownerTitle} onChange={(e) => update("ownerTitle", e.target.value)} /></Field>
                <Field label="Ownership percentage"><Input type="number" min="0" max="100" value={form.ownershipPercent} onChange={(e) => update("ownershipPercent", e.target.value)} /></Field>
              </div>
              <div className="min-w-0 lg:col-span-2">
                <AdditionalOwnersInput value={form.additionalOwners} onChange={(value) => update("additionalOwners", value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <p className="text-sm text-muted-foreground lg:col-span-2">Provide the identifiers used to match the business with its registration and tax records.</p>
              <Field label="EIN / Tax ID *"><Input value={form.einTin} onChange={(e) => update("einTin", e.target.value)} placeholder="12-3456789" /></Field>
              <Field label="State of incorporation"><SelectField value={form.stateIncorporation} onChange={(v) => update("stateIncorporation", v)} options={states.map((s) => ({ value: s.name, label: s.name }))} placeholder="Select state" /></Field>
              <div className="min-w-0 space-y-4 rounded-lg border border-border/60 bg-card/40 p-4 lg:col-span-2">
                <div>
                  <h4 className="font-semibold text-foreground">CPA Information</h4>
                  <p className="mt-1 text-sm text-muted-foreground">Tell us about your current CPA relationship so BookSmart can better support your accounting needs.</p>
                </div>
                <Field label="Do you currently have a CPA?">
                  <SelectField value={form.hasCpa} onChange={(value) => update("hasCpa", value)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} placeholder="Select Yes or No" />
                </Field>
                {cpaVisibility.showCurrentCpa && (
                  <div className="grid min-w-0 gap-4 lg:grid-cols-3">
                    <Field label="CPA name (optional)">
                      <Input value={form.currentCpa} onChange={(event) => update("currentCpa", event.target.value)} placeholder="CPA name" />
                    </Field>
                    <Field label="CPA company (optional)">
                      <Input value={form.currentCpaCompany} onChange={(event) => update("currentCpaCompany", event.target.value)} placeholder="CPA company" />
                    </Field>
                    <Field label="CPA phone number (optional)">
                      <PhoneInput value={form.currentCpaPhone} onChange={(value) => update("currentCpaPhone", value)} />
                    </Field>
                  </div>
                )}
                {cpaVisibility.showCpaMatch && (
                  <Field label="Would you like BookSmart to help you find a CPA?">
                    <SelectField value={form.wantsCpaMatch} onChange={(value) => update("wantsCpaMatch", value)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} placeholder="Select Yes or No" />
                  </Field>
                )}
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => (step === 0 ? onOpenChange(false) : setStep((current) => current - 1))} disabled={saving} className="w-full sm:w-auto">
            {step === 0 ? "Cancel" : <><ChevronLeft className="mr-2 h-4 w-4" /> Back</>}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="w-full sm:w-auto">Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
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
    <div className="min-w-0 space-y-2">
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
  openDownward = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
  openDownward?: boolean;
}) {
  const sortedOptions = [...options].sort((a, b) => {
    const aLabel = typeof a === "string" ? a : a.label;
    const bLabel = typeof b === "string" ? b : b.label;
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
  });
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-0"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent
        className="max-h-72 overflow-y-auto overscroll-contain"
        side={openDownward ? "bottom" : undefined}
        align={openDownward ? "start" : undefined}
        avoidCollisions={!openDownward}
      >
        {sortedOptions.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return <SelectItem key={value} value={value}>{label}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}
