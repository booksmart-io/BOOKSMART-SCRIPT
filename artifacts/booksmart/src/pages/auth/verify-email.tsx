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

  const checkConfirmation = async () => {
    setLoading("check");
    try {
      await supabase.auth.refreshSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLocation("/login");
        return;
      }

      if (user.email_confirmed_at) {
        window.localStorage.removeItem("booksmart_pending_signup_email");
        toast.success("Your email has been verified.");
        setLocation(routeForRole(user.user_metadata?.role));
      } else {
        toast.info("Your email is still not verified. Please check your inbox.");
      }
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
              A confirmation link has been sent to {getPendingEmail() || "your email"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={resendEmail} disabled={loading !== null}>
              {loading === "resend" ? "Sending..." : "Resend Email"}
            </Button>
            <Button className="w-full" variant="outline" onClick={checkConfirmation} disabled={loading !== null}>
              {loading === "check" ? "Checking..." : "I have confirmed"}
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
