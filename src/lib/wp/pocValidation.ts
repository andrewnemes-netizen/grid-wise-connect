import { balancePhases, type SocketGroup } from "@/lib/wp/socketPhaseBalance";

export interface PocSiteInput {
  id: string;
  site_name?: string | null;
  postcode?: string | null;
  client_site_code?: string | null;
  socket_count?: number | null;
  proposed_kw?: number | null;
  lat?: number | null;
  lng?: number | null;
  socket_groups?: SocketGroup[] | null;
}

export interface PocSiteEnriched extends PocSiteInput {
  address: string | null;
  siteId: string | null;
  kwPerSocket: number | null;
  socketGroups: SocketGroup[];
  breakdownLabel: string;
  totalConnectedKw: number;
  totalSockets: number;
  phaseTotals: { L1: number; L2: number; L3: number };
  phaseAssignments: { L1: string[]; L2: string[]; L3: string[] };
}

export interface PocValidationResult {
  ok: boolean;
  missing: string[];
}

export function validateSiteForPoc(s: PocSiteInput): PocValidationResult {
  const missing: string[] = [];
  if (!s.site_name?.trim()) missing.push("Site Address");
  if (!s.postcode?.trim()) missing.push("Postcode");
  if (typeof s.lat !== "number" || !isFinite(s.lat)) missing.push("Feeder Pillar Latitude");
  if (typeof s.lng !== "number" || !isFinite(s.lng)) missing.push("Feeder Pillar Longitude");
  const groups = Array.isArray(s.socket_groups) ? s.socket_groups : [];
  const totalQty = groups.reduce((a, g) => a + (g.quantity || 0), 0);
  const totalKw = groups.reduce((a, g) => a + (g.quantity || 0) * (g.power_rating_kw || 0), 0);
  const legacyOk = (s.socket_count ?? 0) > 0 && (s.proposed_kw ?? 0) > 0;
  if (totalQty <= 0 && !legacyOk) missing.push("Socket Groups (add at least one)");
  if (totalKw <= 0 && !legacyOk) missing.push("Socket Power Rating");
  return { ok: missing.length === 0, missing };
}

export function enrichSiteForPoc(s: PocSiteInput): PocSiteEnriched {
  const groups: SocketGroup[] = Array.isArray(s.socket_groups) && s.socket_groups.length > 0
    ? s.socket_groups.map((g) => ({
        quantity: Number(g.quantity),
        power_rating_kw: Number(g.power_rating_kw),
        phases: (Number(g.phases) === 3 ? 3 : 1) as 1 | 3,
        sort_order: g.sort_order ?? 0,
      }))
    : (s.socket_count && s.proposed_kw && s.socket_count > 0
        ? [{
            quantity: s.socket_count,
            power_rating_kw: Number((s.proposed_kw / s.socket_count).toFixed(2)),
            phases: (s.proposed_kw / s.socket_count) >= 10 ? 3 : 1,
            sort_order: 0,
          }]
        : []);
  const balance = balancePhases(groups);
  const kwPerSocket = balance.totalSockets > 0
    ? Number((balance.totalConnectedKw / balance.totalSockets).toFixed(2))
    : null;
  const fmt = (n: number) => `${Math.round(n * 100) / 100}kW`;
  const phaseAssignments = {
    L1: balance.perPhaseSockets.L1.map((x) => fmt(x.phases === 3 ? x.power_rating_kw / 3 : x.power_rating_kw) + (x.phases === 3 ? "*" : "")),
    L2: balance.perPhaseSockets.L2.map((x) => fmt(x.phases === 3 ? x.power_rating_kw / 3 : x.power_rating_kw) + (x.phases === 3 ? "*" : "")),
    L3: balance.perPhaseSockets.L3.map((x) => fmt(x.phases === 3 ? x.power_rating_kw / 3 : x.power_rating_kw) + (x.phases === 3 ? "*" : "")),
  };
  return {
    ...s,
    address: s.site_name?.trim() || null,
    siteId: s.client_site_code?.trim() || null,
    kwPerSocket,
    socketGroups: groups,
    breakdownLabel: balance.breakdownLabel,
    totalConnectedKw: balance.totalConnectedKw,
    totalSockets: balance.totalSockets,
    phaseTotals: balance.totals,
    phaseAssignments,
  };
}