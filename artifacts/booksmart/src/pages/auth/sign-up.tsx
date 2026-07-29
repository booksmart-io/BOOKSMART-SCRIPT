import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { createLegalConsentMetadata, LEGAL_CONSENT_REQUIRED_MESSAGE } from "@/lib/legal-consent";
import { toast } from "sonner";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"user" | "cpa">("user");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [, setLocation] = useLocation();
  const referralParam = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("ref")
    : null;
  const referralCpaId = referralParam && Number.isFinite(Number(referralParam)) && Number(referralParam) > 0
    ? Number(referralParam)
    : null;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Enter your email");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (!password) {
      toast.error("Enter your password");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!confirmPassword) {
      toast.error("Confirm your password");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!agreedToLegal) {
      toast.error(LEGAL_CONSENT_REQUIRED_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();

      // A deleted or expired account can leave a stale token in local storage.
      // Clear only this browser's session before creating a new account so the
      // router cannot mistake the previous, confirmed user for the new signup.
      await supabase.auth.signOut({ scope: "local" });

      const { error: signUpError, data } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            role,
            verification_status: role === "cpa" ? "pending" : null,
            referred_by_cpa_id: role === "user" ? referralCpaId : null,
            ...createLegalConsentMetadata(),
          },
        },
      });

      if (signUpError) throw signUpError;

      // Supabase intentionally returns an obfuscated user with no identities
      // when email enumeration protection encounters an existing account.
      // Do not treat that response as a newly confirmed signup.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("An account with this email already exists. Sign in or reset your password instead.");
      }

      toast.success("We sent a 6-digit verification code to your email.");
      window.localStorage.setItem("booksmart_pending_signup_email", cleanEmail);
      // Always show the verification step. Whether confirmation is required is
      // controlled by Supabase, but onboarding must never bypass this screen.
      setLocation("/verify-email");
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-4 py-8 sm:px-8">
        <form onSubmit={handleSignUp} className="w-full">
          <div className="mb-9 text-center">
            <h1 className="text-lg font-bold text-foreground">Create Account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign up to get started with BookSmart</p>
            {referralCpaId && (
              <p className="mt-2 text-xs font-medium text-primary">CPA referral detected</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label
              htmlFor="signup-as-cpa"
              className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1"
            >
              <span className="text-sm text-foreground">Sign up as CPA</span>
              <Switch
                id="signup-as-cpa"
                checked={role === "cpa"}
                onCheckedChange={(checked) => setRole(checked ? "cpa" : "user")}
              />
            </label>

            <label
              htmlFor="legal-consent"
              className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-border/60 px-3 py-3 text-sm leading-5"
            >
              <Checkbox
                id="legal-consent"
                checked={agreedToLegal}
                onCheckedChange={(checked) => setAgreedToLegal(checked === true)}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 break-words">
                I agree to the Terms of Service and Privacy Policy and authorize BookSmart to process my information to provide its services.
              </span>
            </label>

            <Button type="button" variant="ghost" className="w-full" onClick={() => setLocation("/login")}>
              I Don't Agree
            </Button>

            <Button type="submit" className="mt-4 w-full rounded-[10px] text-base" disabled={loading}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
          </div>

          <p className="mt-9 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-primary hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
