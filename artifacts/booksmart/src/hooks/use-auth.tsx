import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { User, Session } from "@supabase/supabase-js";

export type UserProfile = {
  id: string;          // Supabase auth UUID
  numericId: number | null;  // public.users.id (bigint) — used in all FK columns
  email: string;
  full_name: string;
  role: "user" | "cpa" | "admin";
  token_balance: number;
  phone?: string;
  img_url?: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        fetchProfile(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (authUuid: string) => {
    try {
      // 1. Try public.users (Flutter schema) — integer id + auth_id UUID
      //    Columns: id, auth_id, email, role, first_name, middle_name,
      //             last_name, phone_number, img_url, token_balance
      const { data: appUser, error: appUserError } = await supabase
        .from("users")
        .select("id, auth_id, email, role, first_name, middle_name, last_name, phone_number, token_balance, img_url")
        .eq("auth_id", authUuid)
        .single();

      if (!appUserError && appUser) {
        const parts = [appUser.first_name, appUser.middle_name, appUser.last_name]
          .filter(Boolean)
          .join(" ");
        setProfile({
          id: authUuid,
          numericId: appUser.id as number,
          email: appUser.email ?? "",
          full_name: (parts || appUser.email) ?? "",
          role: (appUser.role as UserProfile["role"]) ?? "user",
          token_balance: appUser.token_balance ?? 0,
          phone: appUser.phone_number,
          img_url: appUser.img_url,
        });
        return;
      }

      // Log the error so we can debug RLS / column issues without silently swallowing
      if (appUserError) {
        console.warn("fetchProfile: users table lookup failed:", appUserError.message, appUserError.code);
      }

      // 2. Try profiles table (alternative schema)
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUuid)
        .single();

      if (!profileError && profileRow) {
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
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const meta = authUser?.user_metadata ?? {};
      const fullName: string = meta.full_name ?? meta.name ?? "";
      const [firstName, ...rest] = fullName.split(" ").filter(Boolean);

      const { data: createdUser, error: createError } = await supabase
        .from("users")
        .insert({
          auth_id: authUuid,
          email: authUser?.email ?? "",
          role: (meta.role as UserProfile["role"]) ?? "user",
          first_name: firstName ?? "",
          last_name: rest.join(" "),
          phone_number: meta.phone ?? "",
        })
        .select("id, email, role, first_name, last_name, phone_number, token_balance")
        .single();

      if (!createError && createdUser) {
        setProfile({
          id: authUuid,
          numericId: createdUser.id as number,
          email: createdUser.email ?? "",
          full_name: fullName || createdUser.email || "",
          role: (createdUser.role as UserProfile["role"]) ?? "user",
          token_balance: createdUser.token_balance ?? 0,
          phone: createdUser.phone_number,
          img_url: null,
        });
        return;
      }

      if (createError) {
        console.warn("fetchProfile: auto-provisioning users row failed:", createError.message, createError.code);

        // 23505 = unique_violation — another tab/request already created the
        // row for this auth_id between our lookup and insert. Just re-fetch it.
        if (createError.code === "23505") {
          const { data: existingUser, error: refetchError } = await supabase
            .from("users")
            .select("id, email, role, first_name, last_name, phone_number, token_balance")
            .eq("auth_id", authUuid)
            .single();
          if (!refetchError && existingUser) {
            setProfile({
              id: authUuid,
              numericId: existingUser.id as number,
              email: existingUser.email ?? "",
              full_name: fullName || existingUser.email || "",
              role: (existingUser.role as UserProfile["role"]) ?? "user",
              token_balance: existingUser.token_balance ?? 0,
              phone: existingUser.phone_number,
              img_url: null,
            });
            return;
          }
        }
      }

      // Last resort: degrade to a metadata-only profile (numericId null).
      // Dashboard/org features will be limited until the users row exists.
      setProfile({
        id: authUuid,
        numericId: null,
        email: authUser?.email ?? "",
        full_name: fullName,
        role: (meta.role as UserProfile["role"]) ?? "user",
        token_balance: meta.token_balance ?? 0,
        phone: meta.phone,
        img_url: null,
      });
    } catch (e) {
      console.error("fetchProfile error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
