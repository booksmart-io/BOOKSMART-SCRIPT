import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Owner = { name: string; title: string; percentage: string };

type AdditionalOwnersInputProps = {
  value: string;
  onChange: (value: string) => void;
};

const emptyOwner = (): Owner => ({ name: "", title: "", percentage: "" });

function serializeOwners(owners: Owner[]) {
  return owners
    .filter((owner) => owner.name.trim() || owner.title.trim() || owner.percentage.trim())
    .map((owner) => `Name: ${owner.name.trim()}; Title: ${owner.title.trim()}; Ownership: ${owner.percentage.trim()}%`)
    .join("\n");
}

function parseOwners(value: string): Owner[] {
  if (!value.trim()) return [];
  return value.split(/\r?\n/).filter(Boolean).map((line) => {
    const structured = line.match(/^Name:\s*(.*?);\s*Title:\s*(.*?);\s*Ownership:\s*(.*?)%?$/i);
    if (!structured) return { name: line, title: "", percentage: "" };
    return { name: structured[1], title: structured[2], percentage: structured[3].replace(/%$/, "") };
  });
}

export function AdditionalOwnersInput({ value, onChange }: AdditionalOwnersInputProps) {
  const [owners, setOwners] = useState<Owner[]>(() => parseOwners(value));

  useEffect(() => {
    if (value !== serializeOwners(owners)) setOwners(parseOwners(value));
  }, [value]); // Keep a newly added blank row visible before the user types.

  const commit = (next: Owner[]) => {
    setOwners(next);
    onChange(serializeOwners(next));
  };

  const updateOwner = (index: number, field: keyof Owner, fieldValue: string) => {
    const next = owners.map((owner, ownerIndex) => ownerIndex === index ? { ...owner, [field]: fieldValue } : owner);
    commit(next);
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex w-full items-center justify-between gap-4">
        <Label>Additional owners</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => commit([...owners, emptyOwner()])}>
          <Plus className="mr-2 h-4 w-4" /> Add owner
        </Button>
      </div>

      {owners.map((owner, index) => (
        <div key={index} className="grid min-w-0 gap-4 rounded-md border border-border/50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] sm:items-start">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`additional-owner-name-${index}`}>Owner Full Name</Label>
            <Input
              id={`additional-owner-name-${index}`}
              value={owner.name}
              onChange={(event) => updateOwner(index, "name", event.target.value)}
              placeholder="Owner Full Name"
              className="min-w-0 bg-card text-base"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`additional-owner-title-${index}`}>Owner Title</Label>
            <Input
              id={`additional-owner-title-${index}`}
              value={owner.title}
              onChange={(event) => updateOwner(index, "title", event.target.value)}
              placeholder="Owner"
              className="min-w-0 bg-card text-base"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`additional-owner-percentage-${index}`}>Ownership Percentage</Label>
            <Input
              id={`additional-owner-percentage-${index}`}
              type="number"
              min="0"
              max="100"
              value={owner.percentage}
              onChange={(event) => updateOwner(index, "percentage", event.target.value)}
              placeholder="0"
              className="min-w-0 bg-card text-base"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => commit(owners.filter((_, ownerIndex) => ownerIndex !== index))}
            aria-label={`Remove additional owner ${index + 1}`}
            className="h-8 w-8 text-muted-foreground hover:text-destructive sm:mt-6"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
