import { useState, useEffect, useRef, createContext, useContext } from "react";
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

  const fetchRoles = async (userId: string) => {
    // Skip if we already fetched for this user and have roles
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

    // Listener for ONGOING auth changes — only update if user actually changed
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;
        // Only update state if user ID changed — token refreshes for same user are silent
        const newUserId = newSession?.user?.id ?? null;
        const currentUserId = lastUserIdRef.current;
        if (newUserId === currentUserId && newSession) {
          // Same user, just a token refresh — update session silently without triggering re-renders
          setSession(newSession);
          return;
        }
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

    // INITIAL load (controls loading state)
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, hasRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
