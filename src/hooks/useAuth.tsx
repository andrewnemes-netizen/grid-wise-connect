import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "engineer" | "client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  orgId: string | null;
  orgName: string | null;
  isPlatformAdmin: boolean;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  roles: [],
  orgId: null,
  orgName: null,
  isPlatformAdmin: false,
  hasRole: () => false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const rolesRef = useRef<AppRole[]>([]);
  const lastUserIdRef = useRef<string | null>(null);
  const explicitSignOutRef = useRef(false);

  const fetchRolesAndOrg = useCallback(async (userId: string) => {
    if (userId === lastUserIdRef.current && rolesRef.current.length > 0) return;
    try {
      const [rolesRes, orgRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("org_members").select("org_id, organisations(name)").eq("user_id", userId).limit(1).single(),
        supabase.from("profiles").select("is_platform_admin").eq("user_id", userId).limit(1).single(),
      ]);

      if (rolesRes.data) {
        const newRoles = rolesRes.data.map((r) => r.role as AppRole).sort();
        const oldRoles = [...rolesRef.current].sort();
        lastUserIdRef.current = userId;
        if (JSON.stringify(newRoles) !== JSON.stringify(oldRoles)) {
          rolesRef.current = newRoles;
          setRoles(newRoles);
        }
      }

      if (orgRes.data) {
        setOrgId(orgRes.data.org_id);
        setOrgName((orgRes.data as any).organisations?.name ?? null);
      } else {
        setOrgId(null);
        setOrgName(null);
      }

      setIsPlatformAdmin(profileRes.data?.is_platform_admin === true);
    } catch (e) {
      console.error("Failed to fetch roles/org:", e);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setTimeout(() => {
            if (isMounted) fetchRolesAndOrg(newSession.user.id);
          }, 0);
        } else {
          lastUserIdRef.current = null;
          rolesRef.current = [];
          setRoles([]);
          setOrgId(null);
          setOrgName(null);
          setIsPlatformAdmin(false);
        }
      }
    );

    const initializeAuth = async () => {
      try {
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 5000)
        );
        const { data: { session: initialSession } } = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise,
        ]);
        if (!isMounted) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          await fetchRolesAndOrg(initialSession.user.id);
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
  }, [fetchRolesAndOrg]);

  const signOut = useCallback(async () => {
    explicitSignOutRef.current = true;
    lastUserIdRef.current = null;
    rolesRef.current = [];
    await supabase.auth.signOut();
  }, []);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, roles, orgId, orgName, isPlatformAdmin, hasRole, signOut }),
    [user, session, loading, roles, orgId, orgName, isPlatformAdmin, hasRole, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
