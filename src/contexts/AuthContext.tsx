import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isAuthorized: boolean | null; // null = loading, true = has role or in sales_team, false = blocked
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isAuthorized: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAdminRole = async (userId: string) => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (!isMounted) return;
      if (error) {
        setIsAdmin(false);
        return;
      }

      setIsAdmin(!!data);
    };

    const autoAssignRole = async (userId: string, email: string) => {
      // Check if user already has a role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (existingRole) return; // already has a role

      // Match email against sales_team
      const { data: member } = await supabase
        .from("sales_team")
        .select("role")
        .ilike("email", email)
        .maybeSingle();
      if (!member) return;

      // Map sales_role to app_role
      const roleMap: Record<string, string> = {
        esn: "vendedor",
        gsn: "gsn",
        arquiteto: "arquiteto",
      };
      const appRole = roleMap[member.role];
      if (!appRole) return;

      await supabase.from("user_roles").insert({ user_id: userId, role: appRole as any });
    };

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        void loadAdminRole(nextSession.user.id);
        void autoAssignRole(nextSession.user.id, nextSession.user.email || "");
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        applySession(initialSession);
      })
      .catch(() => {
        if (!isMounted) return;
        setLoading(false);
        setIsAdmin(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
