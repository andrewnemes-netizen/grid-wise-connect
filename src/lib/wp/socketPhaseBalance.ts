// Socket group + phase balance helper.
// 3-phase sockets split their kW evenly across L1/L2/L3.
// 1-phase sockets go to whichever phase currently carries the lowest cumulative load.

export interface SocketGroup {
  id?: string;
  quantity: number;
  power_rating_kw: number;
  phases: 1 | 3;
  sort_order?: number;
}

export interface ExpandedSocket {
  index: number;
  power_rating_kw: number;
  phases: 1 | 3;
  // For 1-phase this is the phase it was assigned to (L1/L2/L3).
  // For 3-phase this is null (split across all three).
  assignedPhase: "L1" | "L2" | "L3" | null;
}

export interface PhaseBalanceResult {
  totals: { L1: number; L2: number; L3: number };
  totalConnectedKw: number;
  totalSockets: number;
  breakdownLabel: string; // e.g. "3× 7kW (1φ), 1× 22kW (3φ)"
  sockets: ExpandedSocket[];
  perPhaseSockets: { L1: ExpandedSocket[]; L2: ExpandedSocket[]; L3: ExpandedSocket[] };
}

export function expandSocketGroups(groups: SocketGroup[]): SocketGroup[] {
  return [...groups].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function balancePhases(groups: SocketGroup[]): PhaseBalanceResult {
  // Build individual socket entries.
  const sockets: Omit<ExpandedSocket, "index" | "assignedPhase">[] = [];
  for (const g of groups) {
    const qty = Math.max(0, Math.floor(g.quantity));
    for (let i = 0; i < qty; i++) {
      sockets.push({ power_rating_kw: Number(g.power_rating_kw), phases: g.phases as 1 | 3 });
    }
  }

  // Sort largest -> smallest by per-phase contribution so LPT balancing is stable.
  const withContribution = sockets.map((s, i) => ({
    ...s,
    _perPhase: s.phases === 3 ? s.power_rating_kw / 3 : s.power_rating_kw,
    _origIdx: i,
  }));
  withContribution.sort((a, b) => b._perPhase - a._perPhase);

  const totals = { L1: 0, L2: 0, L3: 0 };
  const perPhaseSockets = { L1: [] as ExpandedSocket[], L2: [] as ExpandedSocket[], L3: [] as ExpandedSocket[] };
  const assigned: ExpandedSocket[] = [];

  const lowestPhase = (): "L1" | "L2" | "L3" => {
    // Deterministic tie-break: L1 < L2 < L3.
    const entries: Array<["L1" | "L2" | "L3", number]> = [
      ["L1", totals.L1],
      ["L2", totals.L2],
      ["L3", totals.L3],
    ];
    entries.sort((a, b) => a[1] - b[1]);
    return entries[0][0];
  };

  let idx = 0;
  for (const s of withContribution) {
    if (s.phases === 3) {
      const share = s.power_rating_kw / 3;
      totals.L1 += share;
      totals.L2 += share;
      totals.L3 += share;
      const expanded: ExpandedSocket = {
        index: idx++,
        power_rating_kw: s.power_rating_kw,
        phases: 3,
        assignedPhase: null,
      };
      assigned.push(expanded);
      perPhaseSockets.L1.push(expanded);
      perPhaseSockets.L2.push(expanded);
      perPhaseSockets.L3.push(expanded);
    } else {
      const phase = lowestPhase();
      totals[phase] += s.power_rating_kw;
      const expanded: ExpandedSocket = {
        index: idx++,
        power_rating_kw: s.power_rating_kw,
        phases: 1,
        assignedPhase: phase,
      };
      assigned.push(expanded);
      perPhaseSockets[phase].push(expanded);
    }
  }

  const totalSockets = sockets.length;
  const totalConnectedKw = sockets.reduce((sum, s) => sum + s.power_rating_kw, 0);

  // Human readable breakdown label.
  const breakdownLabel = groups
    .filter((g) => g.quantity > 0)
    .map((g) => `${g.quantity}× ${trimNum(g.power_rating_kw)}kW (${g.phases}φ)`)
    .join(", ");

  return { totals, totalConnectedKw, totalSockets, breakdownLabel, sockets: assigned, perPhaseSockets };
}

function trimNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatKw(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}kW`;
}