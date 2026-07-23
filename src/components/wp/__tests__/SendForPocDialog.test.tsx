import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SendForPocDialog, type PocAssignment } from "../SendForPocDialog";

// Minimal supabase stub — the dialog issues two auxiliary queries (internal
// users, external contacts) plus the site enrichment RPC. Everything returns
// empty arrays so the tests can focus on the fee + review-step gate.
vi.mock("@/integrations/supabase/client", () => {
  const ok = { data: [], error: null };
  const chain: any = {
    select: () => chain, eq: () => chain, not: () => chain, in: () => chain,
    order: () => Promise.resolve(ok),
  };
  return {
    supabase: {
      from: () => chain,
      rpc: () => Promise.resolve(ok),
    },
  };
});

function renderDialog(overrides: Partial<Parameters<typeof SendForPocDialog>[0]> = {}) {
  const onConfirm = vi.fn(async (_: PocAssignment) => { /* noop */ });
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    siteIds: ["site-1", "site-2"],
    workPackageName: "WP-Test",
    onConfirm,
    adminOnly: true,
    ...overrides,
  };
  // Seed enriched site records so the readiness gate passes without hitting DB.
  // staleTime: Infinity prevents react-query from refetching over our seeded
  // enriched-site data and clobbering `allValid` with the empty stub.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(["poc-sites", "site-1,site-2"], [
    { id: "site-1", site_name: "Alpha", postcode: "AB1 2CD", lat: 51.5, lng: -0.1, socket_count: 2, proposed_kw: 22, socket_groups: [{ count: 2, kwPerSocket: 11 }], phase_totals: { L1: 11, L2: 11, L3: 0 } },
    { id: "site-2", site_name: "Beta", postcode: "BE1 2FG", lat: 51.6, lng: -0.2, socket_count: 2, proposed_kw: 22, socket_groups: [{ count: 2, kwPerSocket: 11 }], phase_totals: { L1: 11, L2: 11, L3: 0 } },
  ]);
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SendForPocDialog {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, onConfirm, props };
}

describe("SendForPocDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the PO fee preview with total = fee × sites when basis is per_site", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: /external/i }));
    await user.type(await screen.findByPlaceholderText(/designer@company\.com/i), "d@x.com");
    await user.type(screen.getByPlaceholderText(/e\.g\. 450/i), "500");

    const preview = await screen.findByTestId("po-preview");
    expect(preview.textContent).toMatch(/£1,000\.00/);
    expect(preview.textContent).toMatch(/2 sites/);
  });

  it("rejects zero/negative fee and blocks proceeding", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: /external/i }));
    await user.type(await screen.findByPlaceholderText(/designer@company\.com/i), "d@x.com");
    await user.type(screen.getByPlaceholderText(/e\.g\. 450/i), "0");

    expect(await screen.findByText(/positive number/i)).toBeInTheDocument();
    expect(screen.getByTestId("poc-next-btn")).toBeDisabled();
  });

  it("requires the review step before onConfirm fires (no auto-send)", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    await user.click(screen.getByRole("tab", { name: /external/i }));
    await user.type(await screen.findByPlaceholderText(/designer@company\.com/i), "d@x.com");
    await user.type(screen.getByPlaceholderText(/e\.g\. 450/i), "300");

    await user.click(screen.getByTestId("poc-next-btn"));
    await screen.findByTestId("poc-review-step");
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("poc-confirm-send"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const arg = onConfirm.mock.calls[0][0] as PocAssignment;
    expect(arg.mode).toBe("external");
    expect(arg.po).toEqual(expect.objectContaining({ fee: 300, feeBasis: "per_site" }));
  });

  it("adminOnly=false skips PO fields entirely (legacy assign & email)", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ adminOnly: false });
    await user.click(screen.getByRole("tab", { name: /external/i }));
    await user.type(await screen.findByPlaceholderText(/designer@company\.com/i), "d@x.com");

    expect(screen.queryByPlaceholderText(/e\.g\. 450/i)).toBeNull();

    await user.click(screen.getByTestId("poc-next-btn"));
    await screen.findByTestId("poc-review-step");
    await user.click(screen.getByTestId("poc-confirm-send"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect((onConfirm.mock.calls[0][0] as PocAssignment).po).toBeUndefined();
  });
});