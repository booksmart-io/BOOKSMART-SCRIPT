import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function routeForRole(role?: string) {
  if (role === "cpa") return "/cpa/profile";
  if (role === "admin") return "/admin";
  return "/user/profile";
}

function getPendingEmail() {
  return window.localStorage.getItem("booksmart_pending_signup_email") ?? "";
}

export default function VerifyEmail() {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState<"resend" | "check" | null>(null);
  const [, setLocation] = useLocation();

  const resendEmail = async () => {
    setLoading("resend");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? getPendingEmail();
      if (!email) {
        setLocation("/login");
        return;
      }

      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) throw error;
      toast.success(`A new confirmation email has been sent to ${email}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to resend confirmation email");
    } finally {
      setLoading(null);
    }
  };

  const verifyCode = async () => {
    const email = getPendingEmail();
    const cleanOtp = otp.trim();
    if (!email) {
      toast.error("Your pending signup email was not found. Please sign up again.");
      setLocation("/sign-up");
      return;
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }

    setLoading("check");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: cleanOtp,
        type: "email",
      });
      if (error) throw error;

      const user = data.user;

      if (!user) {
        throw new Error("The verification code could not be confirmed.");
      }

      window.localStorage.removeItem("booksmart_pending_signup_email");
      toast.success("Your email has been verified.");
      setLocation(routeForRole(user.user_metadata?.role));
    } catch (error: any) {
      toast.error(error.message || "Failed to check verification status");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="BookSmart" className="h-12" />
        </div>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Verify Email</CardTitle>
            <CardDescription className="text-center">
              Enter the 6-digit code sent to {getPendingEmail() || "your email"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Verification code"
              placeholder="000000"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-xl tracking-[0.35em] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <Button className="w-full" onClick={verifyCode} disabled={loading !== null || otp.length !== 6}>
              {loading === "check" ? "Verifying..." : "Verify Email"}
            </Button>
            <Button className="w-full" onClick={resendEmail} disabled={loading !== null}>
              {loading === "resend" ? "Sending..." : "Resend Email"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Please check your inbox and spam folder if you do not see the email.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
