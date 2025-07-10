import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FolderOpen, Search, Upload, FileText, Download, Eye, Trash2, CheckCircle2 } from "lucide-react";

const DOCS = [
  { client: "Taylor Smith", business: "Smith Designs LLC", name: "Q1 2025 P&L Statement.pdf", type: "P&L", size: "248 KB", date: "Apr 2, 2025", status: "Reviewed" },
  { client: "James Brown", business: "Prime Build Co.", name: "Bank Statement Mar 2025.pdf", type: "Bank", size: "512 KB", date: "Apr 5, 2025", status: "Pending" },
  { client: "Maria Chen", business: "Bloom Wellness", name: "Tax Documents 2024.pdf", type: "Tax", size: "1.2 MB", date: "Mar 28, 2025", status: "Reviewed" },
  { client: "David Wilson", business: "Wilson Consulting", name: "Invoice Records Q1.xlsx", type: "Invoice", size: "88 KB", date: "Apr 8, 2025", status: "Reviewed" },
  { client: "Laura White", business: "White Legal LLC", name: "Expense Report Mar 2025.pdf", type: "Expense", size: "340 KB", date: "Apr 10, 2025", status: "Pending" },
];

const CHECKLIST = [
  { item: "Q1 Profit & Loss Statement", done: true },
  { item: "Bank Statements (last 3 months)", done: true },
  { item: "Business Expense Records", done: true },
  { item: "Payroll Records", done: false },
  { item: "1099 Forms", done: false },
  { item: "Business License", done: true },
];

const TYPE_COLOR: Record<string, string> = {
  "P&L": "bg-blue-500/15 text-blue-400 border-blue-400/30",
  "Bank": "bg-purple-500/15 text-purple-400 border-purple-400/30",
  "Tax": "bg-emerald-500/15 text-emerald-400 border-emerald-400/30",
  "Invoice": "bg-amber-500/15 text-amber-400 border-amber-400/30",
  "Expense": "bg-rose-500/15 text-rose-400 border-rose-400/30",
};

export default function CpaDocuments() {
  const [search, setSearch] = useState("");

  const filtered = DOCS.filter(d =>
    d.client.toLowerCase().includes(search.toLowerCase()) ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.business.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and review client documents and financial records.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs bg-[#FFC72B] hover:bg-primary/90 text-primary-foreground font-semibold">
          <Upload className="h-3.5 w-3.5" /> Upload Document
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Documents", value: "47", color: "text-white" },
          { label: "Pending Review", value: "8", color: "text-amber-400" },
          { label: "Reviewed", value: "39", color: "text-emerald-400" },
          { label: "This Month", value: "12", color: "text-blue-400" },
        ].map(s => (
          <Card key={s.label} className="border-border/60 bg-card">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Documents list */}
        <div className="xl:col-span-2">
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-primary" /> Client Documents
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 w-52 bg-muted border-border text-foreground text-xs placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-[#123469]/30">
                {filtered.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.02] transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-muted border border-border/60 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{doc.name}</p>
                      <p className="text-[10px] text-muted-foreground">{doc.client} · {doc.business} · {doc.size} · {doc.date}</p>
                    </div>
                    <Badge className={`text-[9px] flex-shrink-0 ${TYPE_COLOR[doc.type]}`}>{doc.type}</Badge>
                    <Badge className={`text-[9px] flex-shrink-0 ${doc.status === "Reviewed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-400/30" : "bg-amber-500/15 text-amber-400 border-amber-400/30"}`}>
                      {doc.status}
                    </Badge>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-blue-400 hover:bg-foreground/5 transition-colors" title="View">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-foreground/5 transition-colors" title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-foreground/5 transition-colors" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="flex items-center justify-center py-10">
                    <p className="text-sm text-muted-foreground">No documents found.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Documents checklist */}
        <div>
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white">Documents Checklist</CardTitle>
              <p className="text-[11px] text-muted-foreground">Required documents for tax readiness</p>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {CHECKLIST.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${item.done ? "text-emerald-400" : "text-muted-foreground/40"}`} />
                  <span className={`text-xs ${item.done ? "text-foreground" : "text-muted-foreground"}`}>{item.item}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-border/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-muted-foreground">Completion</span>
                  <span className="text-[11px] font-semibold text-emerald-400">
                    {CHECKLIST.filter(c => c.done).length}/{CHECKLIST.length}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${(CHECKLIST.filter(c => c.done).length / CHECKLIST.length) * 100}%` }} />
                </div>
              </div>
              <Button size="sm" className="w-full gap-1.5 text-xs bg-muted hover:bg-muted border border-border text-white mt-2">
                Share Checklist
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
