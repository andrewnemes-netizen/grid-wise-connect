/**
 * End-to-end style behavioural tests for the mandatory per-user Outlook
 * sending flow. Covers the shared `OutlookNotConnectedInline` component
 * used by `SendQuotationDialog`, `SendSurveyDialog`, and `SendForPocDialog`,
 * plus a full loop through `SendQuotationDialog` proving:
 *
 *   1. A first send that returns `outlook_not_connected` surfaces the inline
 *      "Connect Outlook & retry" prompt.
 *   2. Form field values entered by the user are NOT wiped when the prompt
 *      appears (no lost work).
 *   3. Clicking "Connect Outlook & retry" triggers the connect popup helper
 *      and, on success, retries the same send without user re-input.
 *   4. Non-admins never see the "Send from EcoPower shared account" button;
 *      admins do, and clicking it invokes the shared-fallback retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------- Mocks ---------------- //

// PDF generation — pure noop, don't drag jsPDF into JSDOM.
vi.mock("@/lib/quotation-pdf", () => ({
  generateQuotationPdf: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  downloadQuotationPdf: vi.fn(),
}));

// Auth mock — role is flipped between tests via `setRole`.
let currentRole: string | null = null;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: {},
    loading: false,
    roles: currentRole ? [currentRole] : [],
    orgId: null,
    orgName: null,
    isPlatformAdmin: false,
    hasRole: (r: string) => r === currentRole,
    signOut: vi.fn(),
  }),
}));

// Outlook connect popup helper — resolves true (user finished OAuth).
const connectMock = vi.fn(async () => true);
vi.mock("@/hooks/useOutlookConnect", () => ({
  useOutlookConnect: () => connectMock,
  isOutlookNotConnected: (d: any) => !!d && d.error === "outlook_not_connected",
  OutlookNotConnectedError: class extends Error {},
}));

// Supabase client — programmable per-test invocation queue.
const invokeQueue: Array<{ data: any; error: any }> = [];
const invokeMock = vi.fn<(...args: any[]) => Promise<{ data: any; error: any }>>(
  async (..._args: any[]) => {
    const next = invokeQueue.shift() ?? { data: { ok: true }, error: null };
    return next;
  },
);

vi.mock("@/integrations/supabase/client", () => {
  // Minimal chainable stub for `supabase.from("quotation_sends").select().eq().order().limit()`
  const fromChain: any = {
    select: () => fromChain,
    eq: () => fromChain,
    order: () => fromChain,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    supabase: {
      functions: { invoke: (...args: any[]) => invokeMock(...args) },
      storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
      from: () => fromChain,
    },
  };
});

// ---------------- Helpers ---------------- //

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  invokeQueue.length = 0;
  invokeMock.mockClear();
  connectMock.mockClear();
  connectMock.mockImplementation(async () => true);
  currentRole = null;
});

// ---------------- OutlookNotConnectedInline: role-gated shared-fallback ---------------- //

import { OutlookNotConnectedInline } from "@/components/outlook/OutlookNotConnectedInline";

describe("OutlookNotConnectedInline (shared by all three send dialogs)", () => {
  it("shows connect prompt and does NOT expose shared-account button to non-admins", () => {
    render(<OutlookNotConnectedInline onRetry={vi.fn()} onSendShared={vi.fn()} context="quotation" />);
    expect(screen.getByText(/Your Outlook account isn't connected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Outlook & retry/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /shared account/i })).not.toBeInTheDocument();
  });

  it("exposes the admin-only shared-account button when the user has the admin role", () => {
    currentRole = "admin";
    render(<OutlookNotConnectedInline onRetry={vi.fn()} onSendShared={vi.fn()} context="site survey" />);
    expect(screen.getByRole("button", { name: /Send from EcoPower shared account/i })).toBeInTheDocument();
  });

  it("calls onRetry after the connect popup resolves successfully", async () => {
    const onRetry = vi.fn();
    render(<OutlookNotConnectedInline onRetry={onRetry} context="POC assignment" />);
    await userEvent.click(screen.getByRole("button", { name: /Connect Outlook & retry/i }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it("does not call onRetry if the user cancels the popup", async () => {
    const onRetry = vi.fn();
    connectMock.mockImplementationOnce(async () => false);
    render(<OutlookNotConnectedInline onRetry={onRetry} context="quotation" />);
    await userEvent.click(screen.getByRole("button", { name: /Connect Outlook & retry/i }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    expect(onRetry).not.toHaveBeenCalled();
  });
});

// ---------------- SendQuotationDialog: full notConnected → connect → retry loop ---------------- //

import { SendQuotationDialog } from "@/components/delivery/estimate/SendQuotationDialog";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  estimate: { id: "est-1", ref: "Q-001", name: "Quote 1" },
  groups: [],
  lines: [],
  siteName: "Depot A",
};

describe("SendQuotationDialog — mandatory Outlook flow (end-to-end)", () => {
  it("surfaces inline prompt on outlook_not_connected, preserves form state, then retries on connect", async () => {
    // First invoke: not connected. Second invoke: success.
    invokeQueue.push({ data: { error: "outlook_not_connected" }, error: null });
    invokeQueue.push({ data: { ok: true, message_id: "abc" }, error: null });

    const onOpenChange = vi.fn();
    renderWithQuery(<SendQuotationDialog {...baseProps} onOpenChange={onOpenChange} />);

    // Fill the form with distinctive values.
    const nameInput = screen.getByLabelText(/Client name/i) as HTMLInputElement;
    const emailInput = screen.getByLabelText(/Client email/i) as HTMLInputElement;
    const subjectInput = screen.getByLabelText(/^Subject$/i) as HTMLInputElement;

    await userEvent.type(nameInput, "Liam French");
    await userEvent.type(emailInput, "liam@ecopoweruk.com");
    await userEvent.clear(subjectInput);
    await userEvent.type(subjectInput, "Custom subject line");

    // Click "Send to client".
    await userEvent.click(screen.getByRole("button", { name: /Send to client/i }));

    // Inline prompt appears.
    await waitFor(() =>
      expect(screen.getByText(/Your Outlook account isn't connected/i)).toBeInTheDocument(),
    );

    // Form state has NOT been wiped.
    expect(nameInput.value).toBe("Liam French");
    expect(emailInput.value).toBe("liam@ecopoweruk.com");
    expect(subjectInput.value).toBe("Custom subject line");

    // Non-admin: no shared-account button here.
    expect(screen.queryByRole("button", { name: /shared account/i })).not.toBeInTheDocument();

    // First invoke has happened once with use_shared_fallback undefined.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe("send-quotation");
    expect(invokeMock.mock.calls[0][1].body.use_shared_fallback).toBeUndefined();
    expect(invokeMock.mock.calls[0][1].body.recipient_email).toBe("liam@ecopoweruk.com");

    // Click connect-and-retry — should call popup helper then re-invoke.
    await userEvent.click(screen.getByRole("button", { name: /Connect Outlook & retry/i }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    // Retry re-used the same form values (proves no state loss round-trip).
    expect(invokeMock.mock.calls[1][1].body.recipient_email).toBe("liam@ecopoweruk.com");
    expect(invokeMock.mock.calls[1][1].body.subject).toBe("Custom subject line");

    // On success the dialog closes.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("admin can trigger shared-account fallback from the inline prompt", async () => {
    currentRole = "admin";
    invokeQueue.push({ data: { error: "outlook_not_connected" }, error: null });
    invokeQueue.push({ data: { ok: true }, error: null });

    renderWithQuery(<SendQuotationDialog {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/Client email/i), "admin@ecopoweruk.com");
    await userEvent.click(screen.getByRole("button", { name: /Send to client/i }));
    await waitFor(() =>
      expect(screen.getByText(/Your Outlook account isn't connected/i)).toBeInTheDocument(),
    );

    const sharedBtn = screen.getByRole("button", { name: /Send from EcoPower shared account/i });
    await userEvent.click(sharedBtn);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock.mock.calls[1][1].body.use_shared_fallback).toBe(true);
    // Connect popup was NOT invoked on the shared-fallback path.
    expect(connectMock).not.toHaveBeenCalled();
  });
});

// ---------------- SendSurveyDialog: same loop, different edge function ---------------- //

// Reset the supabase mock's `from()` to serve a single row for the sites query.
vi.mock("@/components/portfolio/SendSurveyDialog", async (importOriginal) => importOriginal());

import { SendSurveyDialog } from "@/components/portfolio/SendSurveyDialog";
import { supabase } from "@/integrations/supabase/client";

describe("SendSurveyDialog — inline prompt + retry", () => {
  it("surfaces the prompt on outlook_not_connected and retries via connect", async () => {
    // Override `supabase.from("sites").select(...).in(...)` to return one site.
    const originalFrom = (supabase as any).from;
    (supabase as any).from = (table: string) => {
      if (table === "sites") {
        return {
          select: () => ({
            in: async () => ({
              data: [
                { id: "site-1", site_name: "Depot A", postcode: "SW1", surveyor_email: "sv@example.com" },
              ],
              error: null,
            }),
          }),
        };
      }
      return originalFrom(table);
    };

    invokeQueue.push({ data: { error: "outlook_not_connected" }, error: null });
    invokeQueue.push({ data: { ok: true, results: [], failed: 0 }, error: null });

    renderWithQuery(<SendSurveyDialog open onOpenChange={vi.fn()} siteIds={["site-1"]} />);

    // Wait for the site to load, then click Send Invitations.
    await waitFor(() => expect(screen.getByText("Depot A")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Send Invitations/i }));

    await waitFor(() =>
      expect(screen.getByText(/Your Outlook account isn't connected/i)).toBeInTheDocument(),
    );

    // First invoke went through with no shared fallback.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe("send-site-survey");
    expect(invokeMock.mock.calls[0][1].body.use_shared_fallback).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: /Connect Outlook & retry/i }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    (supabase as any).from = originalFrom;
  });
});

// ---------------- SendForPocDialog: parent-owned notConnectedSlot ---------------- //
//
// `SendForPocDialog` renders whatever the parent passes as `notConnectedSlot`.
// In production that slot is the same `OutlookNotConnectedInline` component
// exercised above — so covering the slot + the shared component together is
// what proves the POC path end-to-end. Here we assert that the slot renders
// inside the dialog and its retry action fires without unmounting the form.

import { SendForPocDialog } from "@/components/wp/SendForPocDialog";
import { MemoryRouter } from "react-router-dom";

describe("SendForPocDialog — parent-supplied notConnected slot renders inside dialog", () => {
  it("renders the inline Outlook prompt via notConnectedSlot and its retry callback fires", async () => {
    const onRetry = vi.fn();
    renderWithQuery(
      <MemoryRouter>
        <SendForPocDialog
          open
          onOpenChange={vi.fn()}
          siteIds={[]}
          onConfirm={vi.fn()}
          notConnectedSlot={<OutlookNotConnectedInline onRetry={onRetry} context="POC assignment" />}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Your Outlook account isn't connected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Connect Outlook & retry/i }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});