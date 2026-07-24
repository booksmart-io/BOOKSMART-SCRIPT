import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

type ProfileAvatarUploaderProps = {
  currentUrl?: string | null;
  initials: string;
  emptyInitials?: string[];
  avatarClassName?: string;
  fallbackClassName?: string;
};

async function bearerToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  return token;
}

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return body?.message || fallback;
}

export function ProfileAvatarUploader({
  currentUrl,
  initials,
  emptyInitials = ["?"],
  avatarClassName,
  fallbackClassName,
}: ProfileAvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  };

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const refreshAvatarConsumers = async () => {
    await Promise.all([
      refreshProfile(),
      queryClient.invalidateQueries({ queryKey: ["profile_user"] }),
      queryClient.invalidateQueries({ queryKey: ["cpa_profile"] }),
      queryClient.invalidateQueries({ queryKey: ["cpa_list_v2"] }),
      queryClient.invalidateQueries({ queryKey: ["admin_cpas"] }),
    ]);
  };

  const choosePhoto = () => {
    if (!busy) inputRef.current?.click();
  };

  const uploadPhoto = async (file: File) => {
    setError("");
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Profile photos must be 5 MB or smaller.");
      return;
    }

    clearPreview();
    const localUrl = URL.createObjectURL(file);
    previewUrlRef.current = localUrl;
    setPreviewUrl(localUrl);
    setBusy(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${await bearerToken()}` },
        body: form,
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The profile photo could not be uploaded."));

      await refreshAvatarConsumers();
      clearPreview();
      toast.success("Profile photo updated.");
    } catch (uploadError) {
      clearPreview();
      const message = uploadError instanceof Error ? uploadError.message : "The profile photo could not be uploaded.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    if (!currentUrl || busy) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/avatar", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await bearerToken()}` },
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The profile photo could not be removed."));

      await refreshAvatarConsumers();
      toast.success("Profile photo removed.");
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : "The profile photo could not be removed.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const showCameraFallback = emptyInitials.includes(initials);
  const displayedUrl = previewUrl ?? currentUrl;

  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div className="relative">
        <Avatar className={cn("h-28 w-28 bg-white text-muted-foreground", avatarClassName)}>
          {displayedUrl && <AvatarImage src={displayedUrl} alt="Profile photo" className="object-cover" />}
          <AvatarFallback className={cn("bg-white text-muted-foreground", fallbackClassName)}>
            {showCameraFallback
              ? <Camera className="h-8 w-8 text-muted-foreground/70" />
              : <span className="text-3xl font-bold text-primary">{initials}</span>}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={currentUrl ? "Change profile photo" : "Add profile photo"}
          onClick={choosePhoto}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadPhoto(file);
        }}
      />

      <div className="flex w-full flex-col items-stretch gap-2 min-[360px]:w-auto min-[360px]:flex-row min-[360px]:items-center">
        <Button type="button" variant="outline" size="sm" onClick={choosePhoto} disabled={busy} className="min-h-11">
          {currentUrl ? "Change photo" : "Add photo"}
        </Button>
        {currentUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void removePhoto()} disabled={busy} className="min-h-11 text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-4 w-4" />
            Remove photo
          </Button>
        )}
      </div>
      {error && <p className="max-w-full break-words text-center text-xs text-destructive sm:max-w-xs" role="alert">{error}</p>}
      <p className="sr-only" aria-live="polite">{busy ? "Updating profile photo" : ""}</p>
    </div>
  );
}
