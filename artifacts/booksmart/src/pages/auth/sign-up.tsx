import { useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GoogleIcon } from "@/components/icons/google-icon";
import { toast } from "sonner";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"user" | "cpa">("user");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      // Supabase OAuth doesn't distinguish sign-up vs. sign-in — the same call
      // creates a new account on first use. Role defaults to "user"; CPAs who
      // sign up via Google can change their role afterwards in Settings, or
      // use the email/password form above to pick "Certified CPA" up front.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Failed to sign up with Google");
      setGoogleLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error: signUpError, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          }
        }
      });
      
      if (signUpError) throw signUpError;
      
      if (data.user) {
        // Also try to insert into profiles if it doesn't happen automatically via triggers
        await supabase.from("profiles").insert({
          id: data.user.id,
          email,
          full_name: fullName,
          role: role,
          token_balance: 0
        }).select().single();
      }

      toast.success("Account created successfully. Please log in.");
      setLocation("/login");
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
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
            <CardTitle className="text-2xl font-bold text-center">Create an Account</CardTitle>
            <CardDescription className="text-center">Join BookSmart command center</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              
              <div className="space-y-3 pt-2">
                <Label>I am joining as a:</Label>
                <RadioGroup value={role} onValueChange={(val: "user" | "cpa") => setRole(val)} className="flex gap-4">
                  <Label htmlFor="r1" className="flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer">
                    <RadioGroupItem value="user" id="r1" />
                    <span>Freelancer / Business</span>
                  </Label>
                  <Label htmlFor="r2" className="flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer">
                    <RadioGroupItem value="cpa" id="r2" />
                    <span>Certified CPA</span>
                  </Label>
                </RadioGroup>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? "Creating account..." : "Sign Up"}
              </Button>
            </form>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </Button>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Log in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
