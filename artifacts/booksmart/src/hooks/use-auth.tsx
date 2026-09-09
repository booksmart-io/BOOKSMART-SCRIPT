import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { User, Session } from "@supabase/supabase-js";
import { hasLegalConsent } from "@/lib/legal-consent";

export type UserProfile = {
  id: string;          // Supabase auth UUID
  numericId: number | null;  // public.users.id (bigint) — used in all FK columns
  email: string;
  full_name: string;
  role: "user" | "cpa" | "admin";
  token_balance: number;
  phone?: string;
  img_url?: string | null;
  verification_status?: "pending" | "approved" | "rejected" | string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  requiresLegalConsent: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  requiresLegalConsent: false,
});

async function auditSession(accessToken: string, event: "signed_in" | "signed_out") {
  try {
    await fetch("/api/security-audit/session", { method: "POST", keepalive: event === "signed_out", headers: {
      Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json",
    }, body: JSON.stringify({ event }) });
  } catch { /* Authentication remains usable if audit transport is temporarily unavailable. */ }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresLegalConsent, setRequiresLegalConsent] = useState(false);

  useEffect(() => {
    // Mirrors the old Flutter app's `getInitialRoute()`: a single, sequential
    // session → profile fetch on startup (see .migration-backup/lib/utils/initial_utils.dart).
    // The previous implementation also called fetchProfile() a second time
    // from onAuthStateChange's initial `INITIAL_SESSION` event, racing the
    // two concurrent lookups and occasionally causing a transient PGRST116
    // ("0 rows") on the `users` table before the session was fully synced —
    // which silently dropped numericId/orgId to null.
    let cancelled = false;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(session);
      setUser(session?.user || null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // Skip the initial re-fire — `init()` above already handles first load.
      if (event === "INITIAL_SESSION") return;

      setSession(session);
      setUser(session?.user || null);

      if (event === "SIGNED_OUT" || !session?.user) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      // Only re-fetch the profile row on events that can actually change it
      // (sign-in as a different user, or an explicit profile update).
      // TOKEN_REFRESHED only rotates the access token — the underlying
      // users row is unchanged, so re-fetching it just reintroduces the race.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (event === "SIGNED_IN") void auditSession(session.access_token, "signed_in");
        fetchProfile(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setAppUserProfile = (
    authUuid: string,
    appUser: {
      id: number;
      email?: string | null;
      role?: string | null;
      first_name?: string | null;
      middle_name?: string | null;
      last_name?: string | null;
      phone_number?: string | null;
      token_balance?: number | null;
      img_url?: string | null;
      verification_status?: string | null;
    },
  ) => {
    const parts = [appUser.first_name, appUser.middle_name, appUser.last_name]
      .filter(Boolean)
      .join(" ");

    setProfile({
      id: authUuid,
      numericId: appUser.id,
      email: appUser.email ?? "",
      full_name: (parts || appUser.email) ?? "",
      role: (appUser.role as UserProfile["role"]) ?? "user",
      token_balance: appUser.token_balance ?? 0,
      phone: appUser.phone_number ?? undefined,
      img_url: appUser.img_url ?? null,
      verification_status: appUser.verification_status ?? null,
    });
  };

  const fetchProfile = async (authUuid: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const meta = authUser?.user_metadata ?? {};
      const authEmail = authUser?.email ?? "";

      // 1. Try public.users (Flutter schema) — integer id + auth_id UUID
      //    Columns: id, auth_id, email, role, first_name, middle_name,
      //             last_name, phone_number, img_url, token_balance
      const { data: appUser, error: appUserError } = await supabase
        .from("users")
        .select("id, auth_id, email, role, first_name, middle_name, last_name, phone_number, token_balance, img_url, verification_status")
        .eq("auth_id", authUuid)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!appUserError && appUser) {
        setRequiresLegalConsent(false);
        setAppUserProfile(authUuid, appUser as Parameters<typeof setAppUserProfile>[1]);
        return;
      }

      // Log the error so we can debug RLS / column issues without silently swallowing
      if (appUserError) {
        console.warn("fetchProfile: users table lookup failed:", appUserError.message, appUserError.code);
      }

      // Email-based account linking is performed only by /api/auth/ensure-profile.
      // Never adopt a profile or backfill its identity from a browser email lookup.

      // 2. Try profiles table (alternative schema)
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUuid)
        .single();

      if (!profileError && profileRow) {
        setRequiresLegalConsent(false);
        setProfile({
          ...(profileRow as Omit<UserProfile, "numericId">),
          numericId: null,
        });
        return;
      }

      // 3. No `users` or `profiles` row yet — this is a first-time OAuth
      // sign-in (Google, etc.), which has no explicit "sign up" step like
      // the email/password form does. Provision the `users` row now,
      // mirroring `createUserRow()` from the old Flutter app, so numericId
      // (and therefore the org lookup) resolves on this same load instead
      // of silently staying null.
      const fullName: string = meta.full_name ?? meta.name ?? "";

      const isOAuthUser = authUser?.app_metadata?.provider
        && authUser.app_metadata.provider !== "email";
      if (isOAuthUser && !hasLegalConsent(meta)) {
        setRequiresLegalConsent(true);
        setProfile({
          id: authUuid,
          numericId: null,
          email: authEmail,
          full_name: fullName,
          role: (meta.role as UserProfile["role"]) ?? "user",
          token_balance: 0,
          img_url: null,
        });
        return;
      }
      setRequiresLegalConsent(false);

      // Provision through the service-role API only after Auth confirms the
      // email. Pending signups have no session and can never reach this call.
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.access_token) {
        const response = await fetch("/api/auth/ensure-profile", {
          method: "POST",
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        });
        const body = await response.json().catch(() => ({})) as {
          profile?: Parameters<typeof setAppUserProfile>[1];
          message?: string;
        };
        if (response.ok && body.profile) {
          setAppUserProfile(authUuid, body.profile);
          return;
        }
        console.warn("fetchProfile: verified profile provisioning failed:", body.message ?? response.statusText);
      }

      // Do not fall back to a browser-side insert. A failed server provision
      // must be retried instead of bypassing the confirmation guarantee.
      setProfile({
        id: authUuid,
        numericId: null,
        email: authEmail,
        full_name: fullName,
        role: (meta.role as UserProfile["role"]) ?? "user",
        token_balance: meta.token_balance ?? 0,
        phone: meta.phone,
        img_url: null,
        verification_status: (meta.verification_status as string | undefined) ?? null,
      });
      return;

        // 23505 = unique_violation — another tab/request already created the
        // row for this auth_id between our lookup and insert. Just re-fetch it.
      // Last resort: degrade to a metadata-only profile (numericId null).
      // Dashboard/org features will be limited until the users row exists.
    } catch (e) {
      console.error("fetchProfile error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) await auditSession(data.session.access_token, "signed_out");
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    const authUuid = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!authUuid) throw new Error("No authenticated user is available.");
    await fetchProfile(authUuid);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isLoading, signOut, refreshProfile, requiresLegalConsent }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
