import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { createLegalConsentMetadata, LEGAL_CONSENT_REQUIRED_MESSAGE } from "@/lib/legal-consent";

export default function OAuthConsent() {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { refreshProfile } = useAuth();
  const [, setLocation] = useLocation();

  const accept = async () => {
    if (!agreed) {
      toast.error(LEGAL_CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: createLegalConsentMetadata() });
      if (error) throw error;
      await refreshProfile();
      setLocation("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record your agreement");
    } finally {
      setSaving(false);
    }
  };

  const decline = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg space-y-6 rounded-lg border border-border bg-card p-5 sm:p-8">
        <div>
          <h1 className="text-xl font-bold">Legal Agreement</h1>
          <p className="mt-2 text-sm text-muted-foreground">Review and accept before BookSmart creates your application profile.</p>
        </div>
        <label htmlFor="oauth-legal-consent" className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3 text-sm leading-5">
          <Checkbox id="oauth-legal-consent" checked={agreed} onCheckedChange={(value) => setAgreed(value === true)} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">I agree to the Terms of Service and Privacy Policy and authorize BookSmart to process my information to provide its services.</span>
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={decline} disabled={saving}>I Don't Agree</Button>
          <Button type="button" onClick={accept} disabled={saving}>{saving ? "Saving..." : "Agree & Continue"}</Button>
        </div>
      </div>
    </div>
  );
}
