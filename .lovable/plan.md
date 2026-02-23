

## Fix: Auth initialization hanging on "Loading..."

### Problem
The `useAuth` hook calls `supabase.auth.getSession()` during initialization, which uses browser `navigator.locks` internally. In certain environments (preview iframe, sandboxed contexts), this lock never resolves, causing the app to stay stuck on "Loading..." forever. No network requests are ever made, confirming the SDK is hanging before reaching any API call.

### Solution
Add a timeout safety net to the auth initialization in `src/hooks/useAuth.tsx`. If `getSession()` doesn't resolve within 5 seconds, force `loading` to `false` so the app can proceed (redirecting unauthenticated users to `/auth`).

### Changes

**File: `src/hooks/useAuth.tsx`**

Wrap the `initializeAuth` function's `getSession()` call in a `Promise.race` with a timeout:

```typescript
const initializeAuth = async () => {
  try {
    // Race getSession against a timeout to prevent hanging in sandboxed environments
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
      await fetchRoles(initialSession.user.id);
    }
  } catch (e) {
    console.error("Auth initialization error:", e);
  } finally {
    if (isMounted) setLoading(false);
  }
};
```

This ensures unauthenticated users are redirected to the login page within 5 seconds maximum, even if the SDK's internal lock mechanism stalls. Authenticated users with a valid local session will resolve much faster than the timeout.

