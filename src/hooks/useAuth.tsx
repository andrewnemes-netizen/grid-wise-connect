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
  const sessionRef = useRef<Session | null>(null);
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explicitSignOutRef = useRef(false);
  const initializedRef = useRef(false);

  const fetchRoles = async (userId: string) => {
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
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;
        const newUserId = newSession?.user?.id ?? null;
        const currentUserId = lastUserIdRef.current;

        // Same user token refresh — store silently, NO state updates
        if (newUserId && newUserId === currentUserId) {
          if (signOutTimerRef.current) {
            clearTimeout(signOutTimerRef.current);
            signOutTimerRef.current = null;
          }
          sessionRef.current = newSession;
          // On first event (initial session), still need to finish loading
          if (!initializedRef.current) {
            initializedRef.current = true;
            setSession(newSession);
            setUser(newSession?.user ?? null);
            setTimeout(async () => {
              if (isMounted) {
                await fetchRoles(newUserId!);
                if (isMounted) setLoading(false);
              }
            }, 0);
          }
          return;
        }

        // New session with a user (sign-in or different user)
        if (newUserId) {
          if (signOutTimerRef.current) {
            clearTimeout(signOutTimerRef.current);
            signOutTimerRef.current = null;
          }
          sessionRef.current = newSession;
          setSession(newSession);
          setUser(newSession?.user ?? null);
          lastUserIdRef.current = newUserId;
          setTimeout(async () => {
            if (isMounted) {
              await fetchRoles(newUserId);
              if (!initializedRef.current) {
                initializedRef.current = true;
                if (isMounted) setLoading(false);
              }
            }
          }, 0);
          return;
        }

        // Sign-out event (newUserId is null)
        if (explicitSignOutRef.current) {
          explicitSignOutRef.current = false;
          sessionRef.current = null;
          setSession(null);
          setUser(null);
          lastUserIdRef.current = null;
          rolesRef.current = [];
          setRoles([]);
          if (!initializedRef.current) {
            initializedRef.current = true;
            setLoading(false);
          }
          return;
        }

        // Debounce transient SIGNED_OUT during token refresh
        if (!signOutTimerRef.current) {
          signOutTimerRef.current = setTimeout(() => {
            signOutTimerRef.current = null;
            if (!isMounted) return;
            if (sessionRef.current?.user) return;
            sessionRef.current = null;
            setSession(null);
            setUser(null);
            lastUserIdRef.current = null;
            rolesRef.current = [];
            setRoles([]);
            if (!initializedRef.current) {
              initializedRef.current = true;
              setLoading(false);
            }
          }, 3000);
        } else if (!initializedRef.current) {
          // If debounce is pending but we haven't initialized, set loading false after timeout
        }
      }
    );

    return () => {
      isMounted = false;
      if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    explicitSignOutRef.current = true;
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
