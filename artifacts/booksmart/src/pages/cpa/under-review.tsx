import { Link } from "wouter";
import { Clock, FileText, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function CpaUnderReview() {
  const { profile } = useAuth();
  const status = (profile?.verification_status ?? "pending").toLowerCase();
  const rejected = status === "rejected" || status === "denied";

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl border-border/60 bg-card">
        <CardContent className="flex flex-col items-center px-8 py-12 text-center">
          <div className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
            rejected ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
          }`}>
            {rejected ? <XCircle className="h-10 w-10" /> : <Clock className="h-10 w-10" />}
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            {rejected ? "Profile Needs Updates" : "CPA Profile Under Review"}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            {rejected
              ? "Your CPA application was not approved yet. Please update your profile details and resubmit it for another review."
              : "Thanks for submitting your CPA profile. BookSmart admin will review your credentials before your CPA tools are fully unlocked."}
          </p>

          <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-background/50 p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
              <p className="font-semibold">Review status</p>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{rejected ? "Rejected" : "Pending review"}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/50 p-4">
              <FileText className="mb-3 h-5 w-5 text-primary" />
              <p className="font-semibold">What you can do</p>
              <p className="mt-1 text-sm text-muted-foreground">Edit your profile while waiting for admin approval.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/cpa/profile">{rejected ? "Update Profile" : "Edit Profile"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
