import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LayoutTemplate, Search, Plus, Copy, Eye, FileText, Mail, MessageSquare } from "lucide-react";

const TEMPLATES = [
  { icon: FileText, color: "#3b82f6", name: "Tax Season Checklist", category: "Document", desc: "Complete list of documents needed for tax preparation.", uses: 24 },
  { icon: Mail, color: "#8b5cf6", name: "Onboarding Welcome Email", category: "Email", desc: "Welcome email template for new client onboarding.", uses: 18 },
  { icon: MessageSquare, color: "#10b981", name: "Monthly Check-in Message", category: "Message", desc: "Quick monthly check-in to keep clients engaged.", uses: 31 },
  { icon: FileText, color: "#f59e0b", name: "Q1 Financial Review", category: "Report", desc: "Quarterly financial health summary template.", uses: 12 },
  { icon: Mail, color: "#ef4444", name: "Missing Documents Reminder", category: "Email", desc: "Politely remind clients to upload outstanding documents.", uses: 29 },
  { icon: MessageSquare, color: "#FFC72B", name: "Tax Filing Update", category: "Message", desc: "Update clients on their tax filing status and next steps.", uses: 15 },
];

const CATEGORY_COLOR: Record<string, string> = {
  Document: "bg-blue-500/15 text-blue-400 border-blue-400/30",
  Email: "bg-purple-500/15 text-purple-400 border-purple-400/30",
  Message: "bg-emerald-500/15 text-emerald-400 border-emerald-400/30",
  Report: "bg-amber-500/15 text-amber-400 border-amber-400/30",
};

export default function CpaTemplates() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reusable communication and document templates for your clients.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs bg-[#FFC72B] hover:bg-primary/90 text-primary-foreground font-semibold">
          <Plus className="h-3.5 w-3.5" /> New Template
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Templates", value: String(TEMPLATES.length), color: "text-white" },
          { label: "Documents", value: "2", color: "text-blue-400" },
          { label: "Emails", value: "2", color: "text-purple-400" },
          { label: "Messages", value: "2", color: "text-emerald-400" },
        ].map(s => (
          <Card key={s.label} className="border-border/60 bg-card">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 bg-card border-border text-foreground text-xs placeholder:text-muted-foreground"
        />
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(tmpl => (
          <Card key={tmpl.name}
            className={`border-border/60 bg-card cursor-pointer transition-all hover:border-border/60 ${selected === tmpl.name ? "ring-1 ring-[#FFC72B]/50 border-[#FFC72B]/40" : ""}`}
            onClick={() => setSelected(tmpl.name === selected ? null : tmpl.name)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${tmpl.color}20`, border: `1px solid ${tmpl.color}40` }}>
                  <tmpl.icon className="h-4.5 w-4.5" style={{ height: 18, width: 18, color: tmpl.color }} />
                </div>
                <Badge className={`text-[9px] ${CATEGORY_COLOR[tmpl.category]}`}>{tmpl.category}</Badge>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{tmpl.name}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{tmpl.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Used {tmpl.uses}×</span>
                <div className="flex items-center gap-1">
                  <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-blue-400 hover:bg-foreground/5 transition-colors"
                    onClick={e => { e.stopPropagation(); }} title="Preview">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-foreground/5 transition-colors"
                    onClick={e => { e.stopPropagation(); }} title="Copy">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <LayoutTemplate className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No templates found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
