## Goal
End-to-end verify that the new `send-poc-assignment-email` Edge Function renders the `poc-assignment.tsx` template and successfully delivers via the Microsoft Outlook connector, replacing the broken `notify.ecopoweruk.com` queue path.

## Test steps

1. **Preflight — connector + secrets**
   - Confirm `MICROSOFT_OUTLOOK_API_KEY` and `LOVABLE_API_KEY` are present in project secrets.
   - Confirm the Microsoft Outlook connection is linked and gateway-backed.

2. **Function-level test (direct curl)**
   - Invoke `send-poc-assignment-email` via `supabase--curl_edge_functions` (POST) using the currently logged-in preview user's auth, with a real test recipient email supplied by the user.
   - Payload includes a representative `templateData` payload with 1 site, socket groups, phase totals, `workPackageName`, `dueDate`, and `actionUrl`.
   - Assert HTTP 200 + `{ success: true }`.
   - Read `send-poc-assignment-email` edge logs to confirm no Outlook 4xx/5xx.

3. **Failure-mode probes**
   - Call with missing Authorization → expect 401.
   - Call with invalid `recipientEmail` → expect 400.

4. **UI-level test (Playwright against preview)**
   - Navigate to `/wp/<wp>/sites/register`, open the "Send for PoC" bulk dialog on a site, select recipient, submit.
   - Screenshot the success toast.
   - Confirm the client-side call hits `send-poc-assignment-email` (not `send-transactional-email`) via network capture, and returns 200.

5. **Inbox verification**
   - Ask the user to confirm receipt in the recipient mailbox (rendered branded template, correct subject with WP name + site count, CC recipients present if supplied).

## Inputs I need from you
- A test **recipient email** to send to (yours is fine).
- A WP + site ID on the preview to trigger from, or permission to pick any existing site on `/wp/50cb31a7-.../sites/register`.
- Optional CC list.

## Report format
I'll return: curl status/body, edge log excerpt, Playwright screenshot of the success toast, network entry showing the new function URL, and any Outlook connector error text if it fails.

No code changes will be made — this is verification only.
