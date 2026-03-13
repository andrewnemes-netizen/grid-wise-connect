
Goal: fix the infinite loading screen on desktop/laptop so users are redirected correctly to login when not signed in, and can reach the GIS map when signed in.

What I found
- The issue is reproducible: route `/` stays on `Loading...`.
- The auth timeout fix in `useAuth` is present and working as intended.
- The remaining blocker is in `ProtectedRoute` (`src/App.tsx`):
  - When auth finishes and there is no user, `profileState` is set to `"loading"`.
  - Render order currently checks `profileState === "loading"` before checking `!user`.
  - That creates a permanent loading loop for signed-out desktop sessions.
- This explains why mobile can work (likely cached logged-in session), while laptop browsers (fresh/unsigned) get stuck.

Implementation plan

1) Fix the route gating logic in `src/App.tsx`
- Update `ProtectedRoute` render conditions so authentication state is evaluated first:
  - Keep loading screen only while `loading === true`.
  - If `!user`, immediately redirect to `/auth` (do not depend on `profileState`).
  - Only then handle profile states for authenticated users.
- Expected condition order:
  1. `if (loading) ...`
  2. `if (!user) return <Navigate to="/auth" replace />`
  3. `if (profileState === "loading") ...`
  4. pending/incomplete/complete branches

2) Prevent unnecessary “loading” state for signed-out users
- In the `useEffect` branch `(!loading && !user)`, set profile state to a neutral non-blocking value (or leave unchanged) instead of `"loading"`.
- This avoids any future reintroduction of the same lock.

3) Add defensive profile-check handling (small hardening)
- Wrap `checkProfile()` query handling with explicit fallback behavior if query fails/returns unexpected shape:
  - For authenticated users, fail closed to `"incomplete"` (or a safe fallback state), never infinite loading.
- Keep current UX unchanged for approved users.

4) Verification checklist (desktop-focused)
- Test on Chrome/Edge/Firefox desktop in fresh session:
  - Open `/` while signed out → should redirect to `/auth` quickly (no endless loader).
- Sign in on desktop:
  - Approved + complete profile → map renders.
  - Incomplete profile → complete-profile screen appears.
  - Unapproved profile → pending-approval screen appears.
- Refresh `/` after login and after logout to confirm no regressions.
- Confirm mobile behavior remains unchanged.

Technical notes
- File to modify: `src/App.tsx` only.
- No backend/database changes required.
- No auth provider/API contract changes required.
- This is a client-side route-state bug, not a map rendering engine failure.

Risk and mitigation
- Risk: changing route order could affect onboarding flow.
- Mitigation: explicit branch testing for all 4 user states (signed out, incomplete, pending, complete) before finalizing.
