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

  const rolesRef = useRef<AppRole[]>([]);
  const lastUserIdRef = useRef<string | null>(null);
  const explicitSignOutRef = useRef(false);

  const fetchRoles = useCallback(async (userId: string) => {
    if (userId === lastUserIdRef.current && rolesRef.current.length > 0) return;
    try {
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
    } catch (e) {
      console.error("Failed to fetch roles:", e);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Listener for ONGOING auth changes only — does NOT control loading
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;

        // Only update state if user actually changed — prevents cascading
        // re-renders when Supabase refreshes the token on window focus
        const newUserId = newSession?.user?.id ?? null;
        const prevUserId = lastUserIdRef.current;

        setSession(newSession);

        if (newUserId !== prevUserId) {
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
      }
    );

    // INITIAL load — this is the sole controller of the loading state
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          await fetchRoles(initialSession.user.id);
        }
      } catch (e) {
        console.error("Auth initialization error:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRoles]);

  const signOut = useCallback(async () => {
    explicitSignOutRef.current = true;
    lastUserIdRef.current = null;
    rolesRef.current = [];
    await supabase.auth.signOut();
  }, []);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

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
