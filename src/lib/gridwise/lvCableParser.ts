/**
 * GRIDWISE — LV Cable Type Parser, Scorer & Compatibility Checker
 *
 * Parses the CONDUCTING_SECTION_TYPE string from NPG LV underground cable
 * assets into structured fields, then scores/ranks candidates for a
 * 55 kVA / 80 A EV charging connection.
 */

// ── Types ───────────────────────────────────────────────────

export type CableFamily =
  | "copper_pilc"
  | "aluminium_pilc"
  | "waveform"
  | "hybrid"
  | "consac"
  | "unknown";

export interface ParsedCable {
  raw: string;
  sizeValue: number | null;
  sizeUnit: "sq_in" | "sq_mm" | null;
  material: "copper" | "aluminium" | "unknown";
  constructionType: "pilc" | "waveform" | "hybrid" | "consac" | "cne" | "unknown";
  coreCount: number | null;
  isUnknown: boolean;
  isServiceLike: boolean;
  isMainLike: boolean;
  family: CableFamily;
}

export interface LvCableMatch {
  cableId: string;
  assetId: string;
  conductingSectionType: string;
  feederName: string;
  sourceSiteName: string;
  distanceM: number;
  score: number;
  snapLon: number;
  snapLat: number;
  directKva: number;
  ductedKva: number;
  greenCompatible: boolean;
  evCompatible: boolean;
  parsedFamily: string;
  parsedSizeValue: number | null;
  parsedSizeUnit: string | null;
  parsedMaterial: string;
  parsedConstruction: string;
  isUnknown: boolean;
  isServiceLike: boolean;
  isMainLike: boolean;
}

// ── Parser ──────────────────────────────────────────────────

export function parseConductingSectionType(raw: string): ParsedCable {
  const value = (raw || "").toUpperCase().trim();

  const isUnknown = value.includes("UNKNOWN");

  const sqInMatch = value.match(/(\d+(?:\.\d+)?)\s*SQ\.?\s*IN/);
  const sqMmMatch = value.match(/(\d+(?:\.\d+)?)\s*SQ\.?\s*MM/);
  const coreMatch = value.match(/(\d+)\s*CORE/);

  const sizeValue = sqInMatch
    ? Number(sqInMatch[1])
    : sqMmMatch
      ? Number(sqMmMatch[1])
      : null;

  const sizeUnit: ParsedCable["sizeUnit"] = sqInMatch ? "sq_in" : sqMmMatch ? "sq_mm" : null;

  const hasCopper = value.includes("COPPER");
  const hasAluminium = value.includes("ALUMINIUM");
  const hasPilc = value.includes("PILC");
  const hasWaveform = value.includes("WAVEFORM");
  const hasConsac = value.includes("CONSAC");
  const hasCne = value.includes("CNE") || value.includes("CONCENTRIC");
  const hasSinglePhase = value.includes("SINGLE PHASE");
  const hasService = value.includes("SERVICE");

  let material: ParsedCable["material"] = "unknown";
  if (hasCopper) material = "copper";
  if (hasAluminium) material = "aluminium";
  if (hasWaveform && material === "unknown") material = "aluminium";

  let constructionType: ParsedCable["constructionType"] = "unknown";
  if (hasPilc) constructionType = "pilc";
  else if (hasWaveform) constructionType = "waveform";
  else if (hasConsac) constructionType = "consac";
  else if (hasCne) constructionType = "cne";

  let family: CableFamily = "unknown";
  if (constructionType === "pilc" && material === "copper") family = "copper_pilc";
  else if (constructionType === "pilc" && material === "aluminium") family = "aluminium_pilc";
  else if (constructionType === "waveform") family = "waveform";
  else if (constructionType === "consac") family = "consac";
  else if (constructionType === "cne") family = "hybrid";

  const coreCount = coreMatch ? Number(coreMatch[1]) : null;

  const isServiceLike =
    hasSinglePhase ||
    hasService ||
    hasCne ||
    (sizeUnit === "sq_mm" && sizeValue !== null && sizeValue <= 35);

  const isMainLike =
    !isUnknown &&
    !isServiceLike &&
    (
      constructionType === "waveform" ||
      constructionType === "pilc" ||
      constructionType === "consac" ||
      (coreCount !== null && coreCount >= 3)
    );

  return {
    raw,
    sizeValue,
    sizeUnit,
    material,
    constructionType,
    coreCount,
    isUnknown,
    isServiceLike,
    isMainLike,
    family,
  };
}

// ── Scorer ──────────────────────────────────────────────────

export function scoreCableCandidate(params: {
  compatible: boolean;
  isMainLike: boolean;
  isServiceLike: boolean;
  isUnknown: boolean;
  ductedKva?: number | null;
  distanceM: number;
}): number {
  let score = 0;
  if (params.compatible) score += 1000;
  if (params.isMainLike) score += 250;
  if ((params.ductedKva ?? 0) >= 190) score += 150;
  else if ((params.ductedKva ?? 0) >= 130) score += 75;
  if (params.isServiceLike) score -= 500;
  if (params.isUnknown) score -= 1000;
  score -= params.distanceM * 2;
  return score;
}

// ── RPC result mapper ───────────────────────────────────────

export function mapRpcToLvCableMatch(row: Record<string, unknown>): LvCableMatch {
  return {
    cableId: String(row.cable_id ?? ""),
    assetId: String(row.asset_id ?? ""),
    conductingSectionType: String(row.conducting_section_type ?? ""),
    feederName: String(row.feeder_name ?? ""),
    sourceSiteName: String(row.source_site_name ?? ""),
    distanceM: Number(row.distance_m ?? 0),
    score: Number(row.score ?? 0),
    snapLon: Number(row.snap_lon ?? 0),
    snapLat: Number(row.snap_lat ?? 0),
    directKva: Number(row.direct_kva ?? 0),
    ductedKva: Number(row.ducted_kva ?? 0),
    greenCompatible: Boolean(row.green_compatible),
    evCompatible: Boolean(row.ev_compatible),
    parsedFamily: String(row.parsed_family ?? "unknown"),
    parsedSizeValue: row.parsed_size_value != null ? Number(row.parsed_size_value) : null,
    parsedSizeUnit: row.parsed_size_unit ? String(row.parsed_size_unit) : null,
    parsedMaterial: String(row.parsed_material ?? "unknown"),
    parsedConstruction: String(row.parsed_construction ?? "unknown"),
    isUnknown: Boolean(row.is_unknown),
    isServiceLike: Boolean(row.is_service_like),
    isMainLike: Boolean(row.is_main_like),
  };
}
