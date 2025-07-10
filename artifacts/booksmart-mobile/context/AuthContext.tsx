import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserProfile = {
  id: string;
  numericId: number | null;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  role: "user" | "cpa" | "admin";
  token_balance: number;
  img_url?: string;
  phone?: string;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (authUuid: string) => {
    try {
      const { data: appUser, error } = await supabase
        .from("users")
        .select("id, auth_id, email, role, first_name, middle_name, last_name, phone_number, token_balance, img_url")
        .eq("auth_id", authUuid)
        .single();

      if (!error && appUser) {
        const parts = [appUser.first_name, appUser.middle_name, appUser.last_name]
          .filter(Boolean)
          .join(" ");
        setProfile({
          id: authUuid,
          numericId: appUser.id ?? null,
          email: appUser.email ?? "",
          full_name: parts || appUser.email || "User",
          first_name: appUser.first_name ?? "",
          last_name: appUser.last_name ?? "",
          role: appUser.role ?? "user",
          token_balance: appUser.token_balance ?? 0,
          img_url: appUser.img_url,
          phone: appUser.phone_number,
        });
      }
    } catch (_e) {
      // silently ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
