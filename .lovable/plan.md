

## Fix: App Stuck on "Loading..." -- Auth Deadlock

### Problem

The app is permanently stuck showing "Loading..." because of a deadlock in the authentication initialization.

With `@supabase/supabase-js` v2.46+, `getSession()` uses the Web Locks API internally. The current code in `src/hooks/useAuth.tsx` sets up `onAuthStateChange` first (which fires an `INITIAL_SESSION` event and acquires a lock), then calls `getSession()` which tries to acquire the same lock. This creates a deadlock, so `loading` never becomes `false` and the app never loads.

### Solution

Restructure the auth initialization to rely **solely on `onAuthStateChange`** for both the initial session and ongoing auth changes. Remove the separate `getSession()` call entirely.

The `onAuthStateChange` callback already fires an `INITIAL_SESSION` event with the current session (or null). We handle `loading` directly inside that callback.

### Changes

**File: `src/hooks/useAuth.tsx`**

Replace the current dual-path approach (onAuthStateChange + getSession) with a single-path approach:

1. Handle the **first** auth state change event as the "initial load" -- set `loading` to `false` after processing it
2. Remove the separate `initializeAuth` / `getSession()` call entirely
3. Wrap `fetchRoles` in try/catch so a failed roles fetch doesn't prevent the app from loading

```text
Current flow (deadlocks):
  onAuthStateChange (acquires lock) --> getSession (waits for same lock) --> DEADLOCK

Fixed flow:
  onAuthStateChange fires INITIAL_SESSION --> handle session + roles --> set loading=false
```

**Specific code changes:**

- Add an `initializedRef` boolean ref to track whether the first event has been processed
- In the `onAuthStateChange` callback, after processing each event, check if `!initializedRef.current` -- if so, set `loading = false` and mark as initialized
- For the initial event with a user, fetch roles and THEN set loading to false (using async handling with setTimeout to avoid the Supabase deadlock warning)
- Remove the `initializeAuth` async function and its call
- Add try/catch around `fetchRoles` so that if the user_roles query fails, the app still loads

No other files need changes. The ProtectedRoute and the rest of the app will work correctly once `loading` transitions to `false`.
