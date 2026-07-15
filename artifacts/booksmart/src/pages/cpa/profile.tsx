import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Camera, Check, ChevronDown, FileText, Loader2, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useLocation } from "wouter";

type CpaRow = {
  id: number;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  img_url: string | null;
  certifications: string[] | null;
  license_number: string | null;
  career_start_date: string | null;
  professional_bio: string | null;
  specialties: string[] | null;
  state_focuses: string[] | null;
  certification_proof_url: string | null;
  license_copy_url: string | null;
  terms_agreed: boolean | null;
  verification_status: string | null;
};

const steps = ["Personal Information", "Professional Details", "Verification & Agreement"];

const CPA_CERTIFICATION_OPTIONS = ["CPA", "EA", "CFP", "CMA", "CIA", "CGMA", "ChFC", "PFS", "Other"];

const CPA_SPECIALTY_OPTIONS = [
  "Individual Income Tax",
  "Small Business Tax",
  "Corporate Tax",
  "Partnership & LLC Tax",
  "Multi-State Taxation",
  "International Tax",
  "Trusts & Estates",
  "CFO Services",
  "Cryptocurrency Taxation",
  "Sales & Use Tax",
  "Payroll Tax Compliance",
  "Tax Strategy & Planning",
  "Bookkeeping & Accounting",
  "Audit & Assurance",
  "Financial Planning",
  "Estate Planning",
  "Business Valuation",
  "IRS Representation",
  "Non-Profit Accounting",
];

const US_STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

function yearsFromCareerStart(value: string | null) {
  if (!value) return "";
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const years = new Date().getFullYear() - start.getFullYear();
  return String(Math.max(1, years));
}

function careerStartFromYears(value: string) {
  const years = Math.max(1, Math.floor(Number(value)));
  const currentYear = new Date().getFullYear();
  const startYear = years <= 1 ? currentYear : currentYear - years;
  return new Date(Date.UTC(startYear, 0, 1)).toISOString();
}

export default function CpaProfile() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [stateFocuses, setStateFocuses] = useState<string[]>([]);
  const [certificationProofUrl, setCertificationProofUrl] = useState("");
  const [licenseCopyUrl, setLicenseCopyUrl] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState<string | null>(null);

  const { data: cpaRow, isLoading } = useQuery<CpaRow | null>({
    queryKey: ["cpa_profile", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,email,first_name,middle_name,last_name,phone_number,img_url,certifications,license_number,career_start_date,professional_bio,specialties,state_focuses,certification_proof_url,license_copy_url,terms_agreed,verification_status")
        .eq("id", numericId!)
        .single();
      if (error) throw error;
      return data as CpaRow;
    },
  });

  useEffect(() => {
    if (!cpaRow) return;
    setFirstName(cpaRow.first_name ?? "");
    setMiddleName(cpaRow.middle_name ?? "");
    setLastName(cpaRow.last_name ?? "");
    setEmail(cpaRow.email ?? profile?.email ?? "");
    setPhone(cpaRow.phone_number ?? "");
    setCertifications(cpaRow.certifications ?? []);
    setLicenseNumber(cpaRow.license_number ?? "");
    setYearsExperience(yearsFromCareerStart(cpaRow.career_start_date));
    setBio(cpaRow.professional_bio ?? "");
    setSpecialties(cpaRow.specialties ?? []);
    setStateFocuses(cpaRow.state_focuses ?? []);
    setCertificationProofUrl(cpaRow.certification_proof_url ?? "");
    setLicenseCopyUrl(cpaRow.license_copy_url ?? "");
    setTermsAgreed(cpaRow.terms_agreed ?? false);
  }, [cpaRow, profile?.email]);

  const validateStep = (targetStep = step) => {
    if (targetStep === 0) {
      if (!firstName.trim() || !lastName.trim()) return "First and last name are required.";
      if (!email.trim() || !email.includes("@")) return "Valid email required.";
    }
    if (targetStep === 1) {
      if (!licenseNumber.trim()) return "License number is required for CPA.";
      if (!yearsExperience || Number(yearsExperience) < 1) return "Years of experience is required.";
      if (!bio.trim()) return "Professional bio is required.";
    }
    if (targetStep === 2 && !termsAgreed) {
      return "You must certify that the information is accurate.";
    }
    return null;
  };

  const uploadVerificationDocument = async (
    file: File,
    kind: "certification" | "license",
    onUploaded: (url: string) => void
  ) => {
    setUploadingDocument(kind);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("originalName", `cpa-${kind}-${file.name}`);

      const uploadRes = await fetch("/api/document-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({})) as { message?: string };
        throw new Error(errBody.message ?? `Upload failed (${uploadRes.status})`);
      }
      const { publicUrl } = await uploadRes.json() as { publicUrl: string; storagePath: string };
      onUploaded(publicUrl);
      toast.success(`${kind === "certification" ? "Certification proof" : "License copy"} uploaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingDocument(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (numericId === null) throw new Error("No user ID available");

      const validationError = validateStep(2) ?? validateStep(1) ?? validateStep(0);
      if (validationError) throw new Error(validationError);

      const status = cpaRow?.verification_status === "approved" ? "approved" : "pending";
      const payload = {
        email: email.trim(),
        role: "cpa",
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        phone_number: phone.trim() || null,
        certifications,
        license_number: licenseNumber.trim(),
        career_start_date: careerStartFromYears(yearsExperience),
        professional_bio: bio.trim(),
        specialties,
        state_focuses: stateFocuses,
        certification_proof_url: certificationProofUrl.trim() || null,
        license_copy_url: licenseCopyUrl.trim() || null,
        terms_agreed: termsAgreed,
        verification_status: status,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("users").update(payload).eq("id", numericId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved successfully");
      queryClient.invalidateQueries({ queryKey: ["cpa_profile", numericId] });
      if (cpaRow?.verification_status !== "approved") {
        setLocation("/cpa/under-review");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save profile");
    },
  });

  const continueStep = () => {
    const error = validateStep();
    if (error) {
      toast.error(error);
      return;
    }
    if (step < 2) setStep((value) => value + 1);
    else saveMutation.mutate();
  };

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "C";

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-10 flex items-center gap-5">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-foreground" onClick={() => setLocation("/cpa")}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">CPA Profile Setup</h1>
      </div>

      <p className="mb-12 text-base font-semibold text-foreground">Complete your CPA profile to join our network</p>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-0">
          <CpaSection index={0} title="Personal Information" active={step === 0} onClick={() => setStep(0)}>
            <div className="space-y-8 pt-3">
              <div className="flex justify-center">
                <div className="relative">
                  <Avatar className="h-28 w-28 bg-white text-muted-foreground">
                    {cpaRow?.img_url && <AvatarImage src={cpaRow.img_url} />}
                    <AvatarFallback className="bg-white text-muted-foreground">
                      {initials === "C" ? <Camera className="h-8 w-8 text-muted-foreground/70" /> : <span className="text-3xl font-bold text-primary">{initials}</span>}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                    onClick={() => toast.info("Photo upload is not available yet.")}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="First Name *" value={firstName} onChange={setFirstName} hideLabel />
                <Field label="Middle Name" value={middleName} onChange={setMiddleName} hideLabel />
                <Field label="Last Name *" value={lastName} onChange={setLastName} hideLabel />
              </div>
              <Field label="Email *" value={email} onChange={setEmail} type="email" hideLabel />
              <Field label="Phone Number" value={phone} onChange={setPhone} hideLabel />

              <div className="flex justify-end">
                <Button type="button" onClick={continueStep}>Next Step</Button>
              </div>
            </div>
          </CpaSection>

          <CpaSection index={1} title="Professional Details" active={step === 1} onClick={() => setStep(1)}>
            <div className="space-y-5">
              <MultiSelectField
                label="Certifications"
                hint="Select Certifications"
                options={CPA_CERTIFICATION_OPTIONS}
                selected={certifications}
                onChange={setCertifications}
              />
              <Field label="License Number *" value={licenseNumber} onChange={setLicenseNumber} hideLabel />
              <Field label="Years of Experience *" value={yearsExperience} onChange={setYearsExperience} type="number" min={1} hideLabel />
              <div className="space-y-2">
                <Label>Professional Bio *</Label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about your experience and expertise..."
                  className="min-h-32 bg-card text-base"
                />
              </div>
              <MultiSelectField
                label="Specialties"
                hint="Select Specialties"
                options={CPA_SPECIALTY_OPTIONS}
                selected={specialties}
                onChange={setSpecialties}
              />
              <MultiSelectField
                label="State Focuses"
                hint="Select States Where Licensed"
                options={US_STATE_OPTIONS}
                selected={stateFocuses}
                onChange={setStateFocuses}
              />
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>Back</Button>
                <Button type="button" onClick={continueStep}>Next Step</Button>
              </div>
            </div>
          </CpaSection>

          <CpaSection index={2} title="Verification & Agreement" active={step === 2} onClick={() => setStep(2)} last>
            <div className="space-y-8">
              <div className="pl-1">
                <h2 className="mb-3 text-xl font-bold">Upload Verification Documents</h2>
                <p className="text-base font-medium text-foreground">Please upload copies of your certifications and license for verification:</p>
              </div>

              <div className="space-y-5">
                <DocumentRow
                  icon={<FileText className="h-6 w-6" />}
                  title="Certification Proof"
                  value={certificationProofUrl}
                  onChange={setCertificationProofUrl}
                  uploading={uploadingDocument === "certification"}
                  onFileSelect={(file) => uploadVerificationDocument(file, "certification", setCertificationProofUrl)}
                />
                <DocumentRow
                  icon={<BriefcaseBusiness className="h-6 w-6" />}
                  title="License Copy"
                  value={licenseCopyUrl}
                  onChange={setLicenseCopyUrl}
                  uploading={uploadingDocument === "license"}
                  onFileSelect={(file) => uploadVerificationDocument(file, "license", setLicenseCopyUrl)}
                />
              </div>

              <div className="border-t border-foreground/70 pt-10">
                <label className="flex cursor-pointer items-start gap-5 pl-5">
                  <Checkbox checked={termsAgreed} onCheckedChange={(checked) => setTermsAgreed(checked === true)} className="mt-1 h-5 w-5" />
                  <span className="text-base font-medium text-foreground">
                    I certify that all information provided is accurate and complete. I agree to the CPA Network Terms of Service and Privacy Policy.
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-5">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button type="button" onClick={continueStep} disabled={saveMutation.isPending || uploadingDocument !== null}>
                  {saveMutation.isPending ? "Saving..." : uploadingDocument ? "Uploading..." : "Submit for Review"}
                </Button>
              </div>
            </div>
          </CpaSection>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hideLabel = false,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hideLabel?: boolean;
  min?: number;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={hideLabel ? "sr-only" : ""}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        value={value}
        placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 bg-card text-base"
      />
    </div>
  );
}

function CpaSection({
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
        {active && <div className="pl-0">{children}</div>}
      </section>
    </div>
  );
}

function DocumentRow({
  icon,
  title,
  value,
  onChange,
  uploading,
  onFileSelect,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  onChange: (value: string) => void;
  uploading: boolean;
  onFileSelect: (file: File) => void;
}) {
  const uploaded = value.trim().length > 0;
  const inputId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-upload`;
  const fileName = uploaded ? decodeURIComponent(value.split("/").pop() ?? "Uploaded file").replace(/^\d+_cpa-(certification|license)-/, "") : "";
  return (
    <div className="flex min-h-[64px] items-center gap-4 rounded-lg bg-card px-4">
      <div className="text-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-medium">{title}</p>
        <input
          id={inputId}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelect(file);
            event.currentTarget.value = "";
          }}
        />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploaded ? "Replace file" : "Choose file"}
          </label>
          <span className="max-w-xl truncate text-sm text-muted-foreground">
            {uploading ? "Uploading..." : uploaded ? fileName || "File uploaded" : "PDF, image, or Word document"}
          </span>
        </div>
      </div>
      {uploaded && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange("")} disabled={uploading}>
          <Trash2 className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

function MultiSelectField({
  label,
  hint,
  options,
  selected,
  onChange,
}: {
  label: string;
  hint: string;
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (option: string) => {
    onChange(selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option]);
  };

  const removeOption = (option: string) => {
    onChange(selected.filter((item) => item !== option));
  };

  return (
    <div className="relative space-y-2">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{hint}</span>
          ) : (
            selected.map((item) => (
              <span
                key={item}
                className="inline-flex max-w-full items-center gap-1 rounded bg-card px-2 py-1 text-xs text-foreground"
              >
                <span className="truncate">{item}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${item}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeOption(item);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      removeOption(item);
                    }
                  }}
                  className="rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-popover p-2 shadow-xl">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search here ..."
              className="h-9 pl-9"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No options found</p>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(option)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className={checked ? "font-semibold text-primary" : "text-foreground"}>{option}</span>
                    {checked && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
