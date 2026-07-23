## Problem
Liam (`liam.french@ecopoweruk.com`) cannot load the project because the `Gridwise (Lovable) Entra` Microsoft Outlook App User Connector client is owned by `andrew.nemes@ecopoweruk.com` and has not been shared with Liam. This is a workspace-level access control issue, not a code bug.

## Goal
Give Liam immediate access so he can open the project and use the per-user Outlook connection flow.

## Plan

### Step 1: Add Liam to the workspace (if not already)
- Andrew opens Lovable.
- Clicks top-right **avatar** → **Workspace Settings** → **People**.
- Clicks **Invite**.
- Enters `liam.french@ecopoweruk.com`.
- Sets role to **Editor** (or higher).
- Sends invitation.
- Liam accepts the invite and refreshes Lovable.

### Step 2: Grant Liam access to the App User Connector client
- In the same **Workspace Settings**, open **App User Connectors** (separate from the standard Connectors list).
- Open the existing client named `Gridwise (Lovable) Entra`.
- Find the **Access / Permissions / Members** section.
- Add `liam.french@ecopoweruk.com` as a member with access.
- Save.

### Step 3: Verify Liam can access the project
- Liam refreshes the browser.
- He should no longer see the "This project uses app user clients you can't access" screen.
- He can now open Gridwise Connect.

### Step 4: Connect Liam's personal Outlook
- Liam navigates to the per-user Outlook connect page in the app.
- Completes Microsoft consent.
- The app stores his connection key via the gateway.

### Step 5: End-to-end test
- Liam triggers a test survey/POC email to `liam.french@ecopoweruk.com`.
- Confirm the email arrives from his own Outlook mailbox.

## Notes
- This plan requires no code changes.
- If the App User Connector client UI does not show a members/sharing option, the workspace plan may restrict client usage to the owner only. In that case, transfer ownership to a shared admin identity or recreate the client under a shared workspace owner account.
- Standard project sharing (Share button) is not enough; the App User Connector client must be shared separately.