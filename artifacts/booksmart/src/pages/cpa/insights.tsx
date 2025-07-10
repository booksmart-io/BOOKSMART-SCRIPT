import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, TrendingUp, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const HEALTH_DONUT = [
  { name: "Excellent (90–100)", value: 5, color: "#22c55e" },
  { name: "Good (70–89)", value: 12, color: "#3b82f6" },
  { name: "Fair (50–69)", value: 7, color: "#f59e0b" },
  { name: "Needs Attention (0–49)", value: 4, color: "#ef4444" },
];

const REVENUE_TREND = [
  { month: "Oct", revenue: 185000 },
  { month: "Nov", revenue: 210000 },
  { month: "Dec", revenue: 198000 },
  { month: "Jan", revenue: 230000 },
  { month: "Feb", revenue: 245000 },
  { month: "Mar", revenue: 268000 },
  { month: "Apr", revenue: 312000 },
];

const TAX_READINESS = [
  { name: "Smith Designs LLC", score: 85, color: "#22c55e" },
  { name: "Prime Build Co.", score: 65, color: "#f59e0b" },
  { name: "Bloom Wellness", score: 52, color: "#ef4444" },
  { name: "Wilson Consulting", score: 91, color: "#22c55e" },
  { name: "White Legal LLC", score: 73, color: "#f59e0b" },
];

function fmtShort(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function CpaInsights() {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Insights</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Analytics and intelligence across your client portfolio.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Avg. Health Score", value: "78", sub: "Across 28 clients", color: "text-emerald-400", icon: TrendingUp, bg: "bg-emerald-500/15" },
          { label: "Tax Ready Clients", value: "19", sub: "68% of portfolio", color: "text-blue-400", icon: CheckCircle2, bg: "bg-blue-500/15" },
          { label: "At-Risk Clients", value: "4", sub: "Need attention", color: "text-rose-400", icon: AlertCircle, bg: "bg-rose-500/15" },
          { label: "Portfolio Revenue", value: "$108K", sub: "This month", color: "text-primary", icon: Users, bg: "bg-primary/15" },
        ].map(s => (
          <Card key={s.label} className="border-border/60 bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`h-4.5 w-4.5 ${s.color}`} style={{ height: 18, width: 18 }} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Revenue trend */}
        <div className="xl:col-span-2 space-y-4">
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white">Portfolio Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={REVENUE_TREND} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} horizontal={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6E86AD" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6E86AD" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={44} />
                  <Tooltip
                    formatter={(v: number) => fmtShort(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "#EAF2FF" }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#FFC72B" radius={[3, 3, 0, 0]} barSize={24} fillOpacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tax readiness by client */}
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white">Tax Readiness by Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {TAX_READINESS.map(c => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-36 truncate flex-shrink-0">{c.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-foreground/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${c.score}%`, background: c.color }} />
                  </div>
                  <span className="text-[11px] font-semibold w-8 text-right flex-shrink-0" style={{ color: c.color }}>{c.score}%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Health overview donut */}
        <div className="space-y-4">
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white">Health Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center mb-3">
                <div className="relative">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={HEALTH_DONUT} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                        paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                        {HEALTH_DONUT.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-white">28</span>
                    <span className="text-[10px] text-muted-foreground">Clients</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {HEALTH_DONUT.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-[11px] text-muted-foreground">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-foreground">{d.value}</span>
                      <span className="text-[10px] text-muted-foreground">({Math.round(d.value / 28 * 100)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Key insights */}
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" /> Key Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { color: "#22c55e", text: "Wilson Consulting has the highest health score (91) — schedule a strategy review." },
                { color: "#f59e0b", text: "Bloom Wellness tax readiness is below 60% — request missing documents." },
                { color: "#3b82f6", text: "Portfolio revenue grew 19% MoM in April — above target." },
                { color: "#ef4444", text: "4 clients need immediate attention — low health scores detected." },
              ].map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: ins.color }} />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{ins.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
