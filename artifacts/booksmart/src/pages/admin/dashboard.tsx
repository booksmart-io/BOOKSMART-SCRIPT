import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building, Clock, ShieldCheck, Loader2 } from "lucide-react";

type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: string;
  verification_status: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function AdminDashboard() {
  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["admin_all_users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,email,first_name,last_name,role,created_at,verification_status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalUsers = allUsers.filter((u) => u.role === "user").length;
  const totalCpas = allUsers.filter((u) => u.role === "cpa" && u.verification_status === "approved").length;
  const pendingCpas = allUsers.filter((u) => u.role === "cpa" && u.verification_status === "pending").length;
  const recentSignups = [...allUsers].slice(0, 5);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-muted-foreground">Live platform metrics from your database.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-secondary/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              : <div className="text-2xl font-bold">{totalUsers.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground">Registered freelancers & SMBs</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-secondary/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified CPAs</CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              : <div className="text-2xl font-bold">{totalCpas}</div>}
            <p className="text-xs text-muted-foreground">Active in the CPA network</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-secondary/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending CPAs</CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              : <div className="text-2xl font-bold text-amber-400">{pendingCpas}</div>}
            <p className="text-xs text-muted-foreground">Awaiting verification</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-secondary/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
            <Building className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              : <div className="text-2xl font-bold">{allUsers.length}</div>}
            <p className="text-xs text-muted-foreground">Users + CPAs + Admins</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Recent Signups</CardTitle>
          <CardDescription>Latest platform registrations</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentSignups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No signups yet.</p>
          ) : (
            <div className="space-y-4">
              {recentSignups.map((u) => (
                <div key={u.id} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.email}
                    </span>
                    <span className="text-xs text-muted-foreground">{u.email} · {timeAgo(u.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.role === "cpa" && (
                      <Badge variant="outline" className={
                        u.verification_status === "pending"
                          ? "text-yellow-500 border-yellow-500/30"
                          : "text-emerald-500 border-emerald-500/30"
                      }>
                        {u.verification_status}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
