export interface PocSiteInput {
  id: string;
  site_name?: string | null;
  postcode?: string | null;
  client_site_code?: string | null;
  socket_count?: number | null;
  proposed_kw?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface PocSiteEnriched extends PocSiteInput {
  address: string | null;
  siteId: string | null;
  kwPerSocket: number | null;
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
  if (!s.socket_count || s.socket_count <= 0) missing.push("Number of Sockets");
  if (!s.proposed_kw || s.proposed_kw <= 0) missing.push("Socket Power Rating");
  return { ok: missing.length === 0, missing };
}

export function enrichSiteForPoc(s: PocSiteInput): PocSiteEnriched {
  const kwPerSocket =
    s.proposed_kw && s.socket_count && s.socket_count > 0
      ? Number((s.proposed_kw / s.socket_count).toFixed(2))
      : null;
  return {
    ...s,
    address: s.site_name?.trim() || null,
    siteId: s.client_site_code?.trim() || null,
    kwPerSocket,
  };
}