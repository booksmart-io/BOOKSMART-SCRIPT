import { useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export type ExtractedBusinessDocument = {
  businessName: string | null;
  entityType: string | null;
  formationState: string | null;
  formationDate: string | null;
  principalAddress: {
    street: string | null;
    suite: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  registrationNumber: string | null;
  registeredAgent: {
    name: string | null;
    address: {
      street: string | null;
      suite: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
  } | null;
  organizers: Array<{ name: string | null }>;
  warnings: string[];
};

type Props = {
  onExtracted: (data: ExtractedBusinessDocument) => void;
  onManual: () => void;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The selected PDF could not be read."));
    reader.readAsDataURL(file);
  });
}

export default function BusinessDocumentUpload({ onExtracted, onManual }: Props) {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  const chooseFile = (selected: File | null) => {
    setError("");
    if (!selected) return;
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Choose a PDF business registration document.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("The PDF must be 10 MB or smaller.");
      return;
    }
    setFile(selected);
  };

  const extract = async () => {
    if (!file || !session?.access_token) {
      setError(file ? "Your session expired. Sign in again and retry." : "Choose a PDF first.");
      return;
    }
    setExtracting(true);
    setError("");
    try {
      const fileData = await fileToDataUrl(file);
      const response = await fetch("/api/business-document/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fileData,
          mimeType: "application/pdf",
          filename: file.name,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        extracted?: ExtractedBusinessDocument;
        message?: string;
      };
      if (!response.ok || !payload.extracted) {
        throw new Error(payload.message || "Extraction failed. Try another PDF or enter the details manually.");
      }
      onExtracted(payload.extracted);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed. Try another PDF or enter the details manually.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-5 rounded-xl border border-border/70 bg-card/35 p-3 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="break-words font-semibold">Upload an official registration PDF</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            The document is processed for this extraction only and is not saved to BookSmart document storage.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-primary/50 bg-background/40 px-4 text-center transition-colors hover:border-primary"
      >
        <Upload className="mb-2 h-6 w-6 text-primary" />
        <span className="max-w-full break-all font-medium sm:break-words">{file ? file.name : "Choose PDF"}</span>
        <span className="mt-1 text-xs text-muted-foreground">PDF only, up to 10 MB</span>
      </button>

      {error && (
        <div className="break-words rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button type="button" variant="ghost" onClick={onManual} disabled={extracting} className="w-full whitespace-normal sm:w-auto">
          Enter Details Manually
        </Button>
        {error && (
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={extracting} className="w-full whitespace-normal sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Another Document
          </Button>
        )}
        <Button type="button" onClick={extract} disabled={!file || extracting} className="w-full whitespace-normal sm:w-auto">
          {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          {extracting ? "Extracting..." : "Extract Business Information"}
        </Button>
      </div>
    </div>
  );
}
