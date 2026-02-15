import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "engineer" | "client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  roles: [],
  hasRole: () => false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  
  // Refs to track state without causing re-renders
  const rolesRef = useRef<AppRole[]>([]);
  const lastUserIdRef = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const fetchRoles = async (userId: string) => {
    if (userId === lastUserIdRef.current && rolesRef.current.length > 0) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) {
      const newRoles = data.map((r) => r.role as AppRole).sort();
      const oldRoles = [...rolesRef.current].sort();
      lastUserIdRef.current = userId;
      if (JSON.stringify(newRoles) !== JSON.stringify(oldRoles)) {
        rolesRef.current = newRoles;
        setRoles(newRoles);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;
        const newUserId = newSession?.user?.id ?? null;
        const currentUserId = lastUserIdRef.current;

        // Same user token refresh — store silently in ref, NO state updates
        if (newUserId && newUserId === currentUserId) {
          console.log("[Auth] Silent token refresh for same user — no re-render");
          sessionRef.current = newSession;
          return;
        }

        console.log("[Auth] Auth state change:", _event, "userId:", newUserId, "prev:", currentUserId);
        sessionRef.current = newSession;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          setTimeout(() => {
            if (isMounted) fetchRoles(newSession.user.id);
          }, 0);
        } else {
          lastUserIdRef.current = null;
          rolesRef.current = [];
          setRoles([]);
        }
      }
    );

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        sessionRef.current = session;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          lastUserIdRef.current = session.user.id;
          await fetchRoles(session.user.id);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, roles, hasRole, signOut }),
    [user, session, loading, roles, hasRole, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
