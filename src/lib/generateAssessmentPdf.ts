/**
 * Branded PDF report generation for EcoPower site assessments.
 * Uses jsPDF to create a professional connection feasibility report.
 * Enhanced with electrical validation results and snapshot traceability.
 */
import jsPDF from "jspdf";
import { estimateConnectionCost, generateBom, type CostEstimate, type BomItem, type UnitRates } from "./connectionCosts";
import type { ElectricalValidationResult } from "./electricalEngine";

export interface PdfSections {
  coverPage?: boolean;
  executiveSummary?: boolean;
  siteDetails?: boolean;
  streetView?: boolean;
  routeMap?: boolean;
  scoreBreakdown?: boolean;
  aiSafetyNarrative?: boolean;
  evDeployment?: boolean;
  icpStrategy?: boolean;
  commercialViability?: boolean;
  electricalValidation?: boolean;
  costBreakdown?: boolean;
  bom?: boolean;
  designElements?: boolean;
  nearestSubstations?: boolean;
  constraintsDetected?: boolean;
  keyFindings?: boolean;
  nextSteps?: boolean;
}

const DEFAULT_SECTIONS: PdfSections = {
  coverPage: true,
  executiveSummary: true,
  siteDetails: true,
  streetView: true,
  routeMap: true,
  scoreBreakdown: true,
  aiSafetyNarrative: true,
  evDeployment: true,
  icpStrategy: true,
  commercialViability: true,
  electricalValidation: true,
  costBreakdown: true,
  bom: true,
  designElements: true,
  nearestSubstations: true,
  constraintsDetected: true,
  keyFindings: true,
  nextSteps: true,
};

interface SubstationInfo {
  site_name: string;
  site_id: string;
  utilisation_pct: number | null;
  firm_capacity_kw: number | null;
  max_demand_kw: number | null;
  transformer_headroom_kw: number | null;
  headroom_band: string | null;
  utilisation_band: string | null;
}

interface PdfInput {
  siteName?: string;
  postcode?: string;
  proposedKw: number;
  lat?: number;
  lng?: number;
  score: string;
  reasons: string[];
  nextSteps: string[];
  distances?: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  distanceBands?: { primary: string; feeder: string; capacity_segment: string };
  constraints?: {
    capacity_flag?: string;
    ndp_intersect?: boolean;
    ndp_within_1000m?: boolean;
    wayleave_intersect?: boolean;
    min_footway_m?: number | null;
    min_carriageway_m?: number | null;
  };
  mapScreenshot?: string;
  electricalResult?: ElectricalValidationResult | null;
  snapshotId?: string | null;
  designElements?: { type: string; count: number }[];
  sections?: PdfSections;
  skipSave?: boolean;
  unitRates?: UnitRates;
  voltageOverride?: import("./connectionCosts").VoltageOverride;
  nearestHeadroomKw?: number;
  streetViewCaptures?: { dataUrl: string; heading: number; pitch: number; label: string }[];

  // ── New intelligence data ──
  /** Master combined score 0–100 */
  masterScore?: number | null;
  /** INSTALL / REVIEW / AVOID */
  masterVerdict?: string | null;
  /** Traffic AADF value */
  trafficAadf?: number;
  /** Traffic demand label (HIGH/MEDIUM/LOW/NO DATA) */
  trafficLabel?: string;
  /** Number of nearby bus stops */
  nearbyBusStops?: number;
  /** Number of nearby rail stations */
  nearbyRailStations?: number;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Grid viability index 0–100 */
  gridViabilityIndex?: number;
  /** Safety incident count */
  safetyIncidents?: number;
  /** Safety risk label */
  safetyLabel?: string;
  /** AI-generated safety narrative */
  aiSafetyNarrative?: string | null;
  /** Deployment class e.g. Fast Deploy */
  deploymentClass?: string | null;
  /** Grid readiness e.g. Strong */
  gridReadiness?: string | null;
  /** Deployment friction e.g. Low */
  deploymentFriction?: string | null;
  /** Recommended scale e.g. Rapid (50–150kW) */
  recommendedScale?: string | null;
  /** Recommended voltage e.g. LV */
  recommendedVoltage?: string | null;
  /** Feeder constraint risk e.g. Low */
  feederConstraintRisk?: string | null;
  /** Reinforcement probability 0–100 */
  reinforcementProbability?: number;
  /** Cost band e.g. £ / ££ / £££ */
  costBand?: string | null;
  /** Cable length estimate (m) */
  cableLengthEst?: number | null;
  /** Civils complexity e.g. Low */
  civilsComplexity?: string | null;
  /** Best POC substation name */
  bestPoc?: string | null;
  /** Nearest substations array */
  nearestSubstations?: SubstationInfo[];
}

// EcoPower brand colours (HSL from design tokens → hex)
const BRAND = {
  green: "#3d6b2e",
  greenLight: "#e8f0e4",
  amber: "#d97706",
  red: "#dc2626",
  grey: "#6b7280",
  darkGreen: "#1f3a17",
  white: "#ffffff",
  black: "#1a2b14",
  blue: "#2563eb",
};

function scoreColor(score: string): string {
  return score === "GREEN" ? BRAND.green : score === "AMBER" ? BRAND.amber : BRAND.red;
}

function scoreLabel(score: string): string {
  return score === "GREEN" ? "Viable" : score === "AMBER" ? "Possible" : "Challenging";
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

export function generateAssessmentPdf(input: PdfInput): jsPDF {
  const sec = { ...DEFAULT_SECTIONS, ...input.sections };
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  const addPage = () => { doc.addPage(); y = margin; };
  const checkPage = (needed: number) => { if (y + needed > 275) addPage(); };
  const drawLine = (yPos: number, color = "#e5e7eb") => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageW - margin, yPos);
  };

  const sectionTitle = (title: string) => {
    checkPage(16);
    doc.setTextColor(BRAND.black);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, y);
    y += 6;
    drawLine(y);
    y += 4;
  };

  const metricRow = (label: string, value: string, labelWidth = 60) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.grey);
    doc.setFontSize(8);
    doc.text(label, margin + 2, y);
    doc.setTextColor(BRAND.black);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + labelWidth, y);
    doc.setFont("helvetica", "normal");
    y += 4.5;
  };

  const refId = input.snapshotId
    ? `SNP-${input.snapshotId.slice(0, 8).toUpperCase()}`
    : `EPE-${Date.now().toString(36).toUpperCase()}`;
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // ── COVER PAGE ──
  if (sec.coverPage) {
    doc.setFillColor(BRAND.darkGreen);
    doc.rect(0, 0, pageW, 297, "F");

    doc.setTextColor(BRAND.white);
    doc.setFontSize(32);
    doc.setFont("helvetica", "bold");
    doc.text("ECOPOWER", pageW / 2, 90, { align: "center" });
    doc.setFontSize(18);
    doc.setFont("helvetica", "normal");
    doc.text("ENERGY", pageW / 2, 102, { align: "center" });

    doc.setDrawColor(BRAND.green);
    doc.setLineWidth(1);
    doc.line(pageW / 2 - 30, 112, pageW / 2 + 30, 112);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.white);
    doc.text("Connection Feasibility Report", pageW / 2, 130, { align: "center" });

    if (input.siteName) {
      doc.setFontSize(20);
      doc.text(input.siteName, pageW / 2, 155, { align: "center" });
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, pageW / 2, 180, { align: "center" });
    doc.text(`Ref: ${refId}`, pageW / 2, 188, { align: "center" });

    doc.setFontSize(8);
    doc.text("Confidential — For Internal Use Only", pageW / 2, 270, { align: "center" });

    addPage();
  }

  // ── HEADER BAR ──
  const addHeaderBar = () => {
    doc.setFillColor(BRAND.darkGreen);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(BRAND.white);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("ECOPOWER ENERGY", margin, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Connection Feasibility Report", margin, 18);
    doc.setFontSize(8);
    doc.text(`Generated: ${dateStr}`, pageW - margin, 12, { align: "right" });
    doc.text(`Ref: ${refId}`, pageW - margin, 18, { align: "right" });
    y = 36;
  };

  addHeaderBar();

  // ── MASTER VERDICT BANNER ──
  if (input.masterScore != null && input.masterVerdict) {
    const verdictColor = input.masterVerdict === "INSTALL" ? BRAND.green : input.masterVerdict === "REVIEW" ? BRAND.amber : BRAND.red;
    doc.setFillColor(verdictColor);
    doc.roundedRect(margin, y, contentW, 22, 3, 3, "F");

    doc.setTextColor(BRAND.white);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(`${input.masterVerdict}`, margin + 8, y + 10);
    doc.setFontSize(28);
    doc.text(`${input.masterScore}`, pageW - margin - 8, y + 10, { align: "right" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const verdictDesc = input.masterVerdict === "INSTALL" ? "Recommended for Installation"
      : input.masterVerdict === "REVIEW" ? "Requires Further Review"
      : "Not Recommended";
    doc.text(verdictDesc, margin + 8, y + 18);
    doc.text("Combined Site Score (0–100)", pageW - margin - 8, y + 18, { align: "right" });

    y += 28;
  } else {
    // Fallback to original score banner
    const sc = scoreColor(input.score);
    doc.setFillColor(sc);
    doc.roundedRect(margin, y, contentW, 18, 3, 3, "F");
    doc.setTextColor(BRAND.white);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(input.score, margin + 8, y + 8);
    doc.setFontSize(10);
    doc.text(scoreLabel(input.score), margin + 8, y + 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const statusDesc =
      input.score === "GREEN" ? "Good connectivity — straightforward connection likely" :
      input.score === "AMBER" ? "Connection possible but may require reinforcement" :
      "Significant constraints — specialist review recommended";
    doc.text(statusDesc, pageW - margin - 4, y + 11, { align: "right" });
    y += 26;
  }

  // ── SCORE BREAKDOWN (4 Pillars) ──
  if (sec.scoreBreakdown) {
    checkPage(45);
    sectionTitle("Score Breakdown");

    const pillars = [
      {
        icon: "[T]",
        label: "Traffic Demand",
        value: input.trafficAadf != null ? `${input.trafficAadf.toLocaleString()} AADF` : "N/A",
        badge: input.trafficLabel || "NO DATA",
      },
      {
        icon: "[A]",
        label: "Accessibility",
        value: `${input.nearbyBusStops ?? 0} bus, ${input.nearbyRailStations ?? 0} rail`,
        badge: input.accessibilityLabel || "NO DATA",
      },
      {
        icon: "[G]",
        label: "Grid Feasibility",
        value: input.gridViabilityIndex != null ? `${input.gridViabilityIndex}/100` : "N/A",
        badge: input.score || "N/A",
      },
      {
        icon: "[S]",
        label: "Safety",
        value: `${input.safetyIncidents ?? 0} incidents`,
        badge: input.safetyLabel || "N/A",
      },
    ];

    const pillarW = contentW / 2;
    const startY = y;

    pillars.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const px = margin + col * pillarW;
      const py = startY + row * 16;

      // Pillar box
      doc.setFillColor("#f9fafb");
      doc.roundedRect(px, py, pillarW - 2, 14, 2, 2, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(BRAND.black);
      doc.text(`${p.icon} ${p.label}`, px + 3, py + 5);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.grey);
      doc.text(p.value, px + 3, py + 10);

      // Badge
      const badgeColor = p.badge === "HIGH" || p.badge === "GREEN" || p.badge === "LOW RISK" ? BRAND.green
        : p.badge === "MEDIUM" || p.badge === "AMBER" || p.badge === "MODERATE" ? BRAND.amber
        : p.badge === "LOW" || p.badge === "RED" || p.badge === "HIGH RISK" ? BRAND.red
        : BRAND.grey;
      doc.setFillColor(badgeColor);
      const badgeWidth = doc.getTextWidth(p.badge) + 4;
      doc.roundedRect(px + pillarW - badgeWidth - 5, py + 3, badgeWidth + 2, 5, 1, 1, "F");
      doc.setTextColor(BRAND.white);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text(p.badge, px + pillarW - 4, py + 6.5, { align: "right" });
    });

    y = startY + 34;
  }

  // ── ROUTE MAP SCREENSHOT ──
  if (sec.routeMap && input.mapScreenshot) {
    checkPage(90);
    sectionTitle("Route Map");

    try {
      const imgW = contentW;
      const imgH = imgW * 0.6;
      doc.addImage(input.mapScreenshot, "PNG", margin, y, imgW, imgH);

      // North Arrow
      const naX = margin + imgW - 8;
      const naY = y + 6;
      doc.setFillColor(BRAND.white);
      doc.circle(naX, naY, 5, "F");
      doc.setDrawColor(BRAND.grey);
      doc.setLineWidth(0.3);
      doc.circle(naX, naY, 5, "S");
      doc.setFillColor(BRAND.black);
      doc.triangle(naX, naY - 4, naX - 1.8, naY + 0.5, naX + 1.8, naY + 0.5, "F");
      doc.setFillColor(BRAND.grey);
      doc.triangle(naX, naY + 4, naX - 1.8, naY + 0.5, naX + 1.8, naY + 0.5, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(BRAND.black);
      doc.text("N", naX, naY - 5.5, { align: "center" });

      // Scale Bar
      const sbX = margin + 4;
      const sbY = y + imgH - 5;
      const totalDistM = input.distances?.primary_m ?? 500;
      let scaleM = 100;
      if (totalDistM > 2000) scaleM = 500;
      else if (totalDistM > 800) scaleM = 200;
      else if (totalDistM > 300) scaleM = 100;
      else scaleM = 50;
      const mapSpanM = Math.max(totalDistM * 2.5, scaleM * 3);
      const barW = (scaleM / mapSpanM) * imgW;
      const clampedBarW = Math.min(Math.max(barW, 12), 40);

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(sbX - 2, sbY - 4, clampedBarW + 8, 7, 1, 1, "F");
      doc.setDrawColor(BRAND.grey);
      doc.setLineWidth(0.2);
      doc.roundedRect(sbX - 2, sbY - 4, clampedBarW + 8, 7, 1, 1, "S");

      doc.setDrawColor(BRAND.black);
      doc.setLineWidth(0.6);
      doc.line(sbX, sbY, sbX + clampedBarW, sbY);
      doc.line(sbX, sbY - 1.5, sbX, sbY + 0.5);
      doc.line(sbX + clampedBarW, sbY - 1.5, sbX + clampedBarW, sbY + 0.5);
      const scaleLabelText = scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`;
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.black);
      doc.text(scaleLabelText, sbX + clampedBarW / 2, sbY - 1.5, { align: "center" });

      y += imgH + 4;
    } catch (e) {
      console.warn("Failed to add map screenshot to PDF:", e);
    }

    // Map Legend
    checkPage(40);
    doc.setTextColor(BRAND.black);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Map Key", margin, y);
    y += 4;

    const routeSymbols: { label: string; color: string; type: "filled-circle" | "dashed-line" }[] = [
      { label: "Point of Connection (Source)", color: "#3498db", type: "filled-circle" },
      { label: "New Supply Point", color: "#e74c3c", type: "filled-circle" },
      { label: "Proposed Cable Route", color: "#2ecc71", type: "dashed-line" },
    ];

    const networkLegend: { label: string; color: string; type: "line" | "circle" }[] = [
      { label: "HV Underground Cables", color: "#e74c3c", type: "line" },
      { label: "EHV Feeders", color: "#8b5cf6", type: "line" },
      { label: "HV Feeders (33kV)", color: "#f59e0b", type: "line" },
      { label: "HV Feeders (66kV)", color: "#06b6d4", type: "line" },
      { label: "Primary Substations", color: "#3b82f6", type: "circle" },
    ];

    const equipmentLegend: { label: string; color: string; symbol: string }[] = [
      { label: "Transformer", color: "#e74c3c", symbol: "T" },
      { label: "Ring Main Unit", color: "#3498db", symbol: "R" },
      { label: "Feeder Pillar", color: "#2ecc71", symbol: "F" },
      { label: "Cutout", color: "#f39c12", symbol: "C" },
      { label: "Joint", color: "#9b59b6", symbol: "J" },
      { label: "Pole", color: "#1abc9c", symbol: "P" },
      { label: "EV Charger", color: "#00b894", symbol: "E" },
    ];

    const colW = contentW / 2;

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.grey);
    doc.text("ROUTE SYMBOLS", margin + 2, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.black);
    routeSymbols.forEach((item) => {
      if (item.type === "filled-circle") {
        doc.setFillColor("#ffffff");
        doc.circle(margin + 6, y - 1.2, 2.4, "F");
        doc.setFillColor(item.color);
        doc.circle(margin + 6, y - 1.2, 1.8, "F");
      } else {
        doc.setDrawColor(item.color);
        doc.setLineWidth(1.2);
        (doc as any).setLineDashPattern([1.5, 1], 0);
        doc.line(margin + 2, y - 1, margin + 10, y - 1);
        (doc as any).setLineDashPattern([], 0);
      }
      doc.setFontSize(7);
      doc.setTextColor(BRAND.black);
      doc.text(item.label, margin + 13, y);
      y += 4;
    });

    y += 1;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.grey);
    doc.text("NETWORK LAYERS", margin + 2, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.black);
    networkLegend.forEach((item) => {
      if (item.type === "line") {
        doc.setDrawColor(item.color);
        doc.setLineWidth(1.2);
        doc.line(margin + 2, y - 1, margin + 10, y - 1);
      } else {
        doc.setFillColor(item.color);
        doc.circle(margin + 6, y - 1.2, 1.8, "F");
      }
      doc.setFontSize(7);
      doc.setTextColor(BRAND.black);
      doc.text(item.label, margin + 13, y);
      y += 4;
    });

    const rightStartY = y - ((routeSymbols.length * 4) + 5 + (networkLegend.length * 4) + 4);
    let rightY = rightStartY;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.grey);
    doc.text("DESIGN EQUIPMENT", margin + colW + 2, rightY);
    rightY += 4;

    doc.setFont("helvetica", "normal");
    equipmentLegend.forEach((item) => {
      doc.setFillColor(item.color);
      doc.circle(margin + colW + 6, rightY - 1.2, 2.2, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(BRAND.white);
      doc.text(item.symbol, margin + colW + 6, rightY - 0.4, { align: "center" });
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.black);
      doc.text(item.label, margin + colW + 13, rightY);
      rightY += 4;
    });

    y = Math.max(y, rightY) + 4;
  }

  // ── SITE DETAILS ──
  if (sec.siteDetails) {
    checkPage(30);
    sectionTitle("Site Details");

    const details: [string, string][] = [];
    if (input.lat && input.lng) details.push(["Location", `${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`]);
    if (input.siteName) details.push(["Site Name", input.siteName]);
    if (input.postcode) details.push(["Postcode", input.postcode]);
    if (input.proposedKw > 0) details.push(["Proposed kW", `${input.proposedKw} kW`]);
    if (input.snapshotId) details.push(["Snapshot ID", input.snapshotId.slice(0, 8)]);

    details.forEach(([label, value]) => {
      metricRow(label, value);
    });

    y += 4;
  }

  // ── STREET VIEW CAPTURES ──
  if (sec.streetView && input.streetViewCaptures && input.streetViewCaptures.length > 0) {
    input.streetViewCaptures.forEach((capture, idx) => {
      checkPage(90);
      doc.setTextColor(BRAND.black);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(capture.label || `Street View — Angle ${idx + 1}`, margin, y);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.grey);
      doc.text(`Heading: ${Math.round(capture.heading)}°  Pitch: ${capture.pitch}°`, margin + 80, y);
      y += 6;
      drawLine(y);
      y += 3;

      try {
        const imgW = contentW;
        const imgH = imgW * (400 / 640);
        doc.addImage(capture.dataUrl, "JPEG", margin, y, imgW, imgH);
        y += imgH + 6;
      } catch (e) {
        console.warn("Failed to add street view capture to PDF:", e);
        doc.setTextColor(BRAND.grey);
        doc.setFontSize(8);
        doc.text("[Street view image could not be rendered]", margin, y);
        y += 6;
      }
    });
  }

  // ── AI SAFETY ASSESSMENT ──
  if (sec.aiSafetyNarrative && input.aiSafetyNarrative) {
    checkPage(40);
    sectionTitle("AI Safety Assessment");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.black);

    // Parse markdown-like bold markers and render
    const narrativeText = input.aiSafetyNarrative.replace(/\*\*/g, ""); // strip bold markers for PDF
    const lines = doc.splitTextToSize(narrativeText, contentW - 4);
    lines.forEach((line: string) => {
      checkPage(4);
      doc.text(line, margin + 2, y);
      y += 3.5;
    });

    y += 4;
  }

  // ── EV DEPLOYMENT ──
  if (sec.evDeployment) {
    const hasData = input.recommendedScale || input.gridReadiness || input.deploymentFriction || input.deploymentClass;
    if (hasData) {
      checkPage(35);
      // Grid viability badge
      const gridBadge = input.score || "N/A";
      doc.setTextColor(BRAND.black);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("EV Deployment", margin, y);

      // Badge next to title
      const gbColor = scoreColor(gridBadge);
      doc.setFillColor(gbColor);
      const gbLabel = `Grid: ${gridBadge}`;
      if (input.gridViabilityIndex != null) {
        const fullLabel = `${gbLabel}  ${input.gridViabilityIndex}`;
        const gbW = doc.getTextWidth(fullLabel) + 8;
        doc.roundedRect(margin + 55, y - 4, gbW, 6, 1, 1, "F");
        doc.setTextColor(BRAND.white);
        doc.setFontSize(7);
        doc.text(fullLabel, margin + 59, y, {});
      }

      y += 6;
      drawLine(y);
      y += 4;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(BRAND.grey);
      doc.text("Grid Viability Index", margin + 2, y);
      y += 5;

      if (input.recommendedScale) metricRow("Recommended Scale", input.recommendedScale);
      if (input.gridReadiness) metricRow("Grid Readiness", input.gridReadiness);
      if (input.deploymentFriction) metricRow("Deployment Friction", input.deploymentFriction);
      if (input.deploymentClass) metricRow("Deployment Class", input.deploymentClass);

      y += 4;
    }
  }

  // ── ICP CONNECTION STRATEGY ──
  if (sec.icpStrategy) {
    const hasData = input.bestPoc || input.recommendedVoltage || input.feederConstraintRisk;
    if (hasData) {
      checkPage(30);
      sectionTitle("ICP Connection Strategy");

      if (input.bestPoc) metricRow("Best POC", input.bestPoc);
      if (input.recommendedVoltage) metricRow("Recommended Voltage", input.recommendedVoltage);
      if (input.feederConstraintRisk) metricRow("Feeder Constraint Risk", input.feederConstraintRisk);
      if (input.reinforcementProbability != null) metricRow("Reinforcement Probability", `${input.reinforcementProbability}%`);

      y += 4;
    }
  }

  // ── COMMERCIAL VIABILITY ──
  if (sec.commercialViability) {
    const hasData = input.costBand || input.cableLengthEst || input.civilsComplexity;
    if (hasData) {
      checkPage(25);
      sectionTitle("Commercial Viability");

      if (input.costBand) metricRow("Cost Band", input.costBand);
      if (input.cableLengthEst != null) metricRow("Cable Length Est.", `${input.cableLengthEst}m`);
      if (input.civilsComplexity) metricRow("Civils Complexity", input.civilsComplexity);

      y += 4;
    }
  }

  // ── CONNECTION PROXIMITY ──
  if (input.distances || input.distanceBands) {
    checkPage(30);
    sectionTitle("Connection Distances");

    const proximity: [string, string][] = [];
    if (input.distances) {
      proximity.push(
        ["Primary Substation", `${input.distances.primary_m.toLocaleString()}m`],
        ["Feeder", `${input.distances.feeder_m.toLocaleString()}m`],
        ["Cable Segment", `${input.distances.capacity_segment_m.toLocaleString()}m`],
      );
    } else if (input.distanceBands) {
      proximity.push(
        ["Primary Substation", input.distanceBands.primary],
        ["Feeder", input.distanceBands.feeder],
        ["Cable Segment", input.distanceBands.capacity_segment],
      );
    }

    proximity.forEach(([label, value]) => {
      metricRow(label, value, 50);
    });

    y += 4;
  }

  // ── CONSTRAINTS DETECTED ──
  if (sec.constraintsDetected && input.constraints) {
    checkPage(30);
    sectionTitle("Constraints Detected");

    metricRow("NDP Intersect", input.constraints.ndp_intersect ? "Yes" : "No", 50);
    if (input.constraints.ndp_within_1000m != null) {
      metricRow("NDP within 1km", input.constraints.ndp_within_1000m ? "Yes" : "No", 50);
    }
    metricRow("Wayleave", input.constraints.wayleave_intersect ? "Yes" : "No", 50);
    metricRow("Capacity", input.constraints.capacity_flag || "unknown", 50);

    y += 4;
  }

  // ── ELECTRICAL VALIDATION ──
  if (sec.electricalValidation && input.electricalResult) {
    const er = input.electricalResult;
    checkPage(50);
    doc.setTextColor(BRAND.black);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Electrical Validation", margin, y);

    const passColor = er.overall_pass ? BRAND.green : BRAND.red;
    const passLabel = er.overall_pass ? "PASS" : "FAIL";
    doc.setFillColor(passColor);
    doc.roundedRect(margin + 60, y - 4, 16, 6, 1, 1, "F");
    doc.setTextColor(BRAND.white);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(passLabel, margin + 68, y, { align: "center" });

    y += 6;
    drawLine(y);
    y += 4;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    const elecRows: [string, string][] = [
      ["Voltage Drop", `${er.voltage_drop.total_vd_pct}% (limit ${er.voltage_drop.limit_pct}%)`],
      ["  Mains VD", `${er.voltage_drop.mains_vd_v}V (${er.voltage_drop.mains_vd_pct}%)`],
      ["  Service VD", `${er.voltage_drop.service_vd_v}V (${er.voltage_drop.service_vd_pct}%)`],
      ["Design Current (Ib)", `${er.current.design_current_a}A`],
      ["Mains Utilisation", `${er.current.mains_utilisation_pct}% of ${er.current.mains_rating_a}A`],
      ["Service Utilisation", `${er.current.service_utilisation_pct}% of ${er.current.service_rating_a}A`],
      ["Fault Current (If)", `${er.fault_level.prospective_fault_current_a}A`],
      ["Zs Total", `${er.fault_level.zs_total_ohms}Ω`],
      ["Engine Version", er.engine_version],
    ];

    elecRows.forEach(([label, value]) => {
      doc.setTextColor(BRAND.grey);
      doc.text(label, margin + 2, y);
      doc.setTextColor(BRAND.black);
      doc.setFont("helvetica", "bold");
      doc.text(value, margin + 55, y);
      doc.setFont("helvetica", "normal");
      y += 4.5;
    });

    if (er.flags.length > 0) {
      y += 2;
      doc.setFontSize(7);
      er.flags.forEach((f) => {
        checkPage(6);
        doc.setTextColor(f.severity === "error" ? BRAND.red : BRAND.amber);
        doc.text(f.severity === "error" ? "X" : "!", margin + 2, y);
        doc.setTextColor(BRAND.black);
        doc.text(f.message, margin + 8, y);
        y += 4;
      });
    }

    y += 4;
  }

  // ── BUDGET ESTIMATE ──
  let estimate: CostEstimate | null = null;
  let bom: BomItem[] = [];

  if (sec.costBreakdown && input.distances && input.proposedKw > 0) {
    estimate = estimateConnectionCost({
      proposed_kw: input.proposedKw,
      distances: input.distances,
      constraints: input.constraints,
      voltage_override: input.voltageOverride,
      nearest_headroom_kw: input.nearestHeadroomKw,
    }, input.unitRates);
    bom = generateBom({
      proposed_kw: input.proposedKw,
      distances: input.distances,
      constraints: input.constraints,
      voltage_override: input.voltageOverride,
      nearest_headroom_kw: input.nearestHeadroomKw,
    }, input.unitRates);

    checkPage(50);
    sectionTitle("Budget Estimate");

    // Voltage badge
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.grey);
    doc.text(`Using: ${estimate.voltage_level}`, margin + 2, y);
    y += 5;

    // Total box
    doc.setFillColor(BRAND.greenLight);
    doc.roundedRect(margin, y, contentW, 16, 2, 2, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.grey);
    doc.text("ESTIMATED TOTAL (exc. VAT)", margin + 4, y + 5);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.green);
    doc.text(formatGBP(estimate.total_estimate), margin + 4, y + 13);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.grey);
    doc.text(`Confidence: ${estimate.confidence}`, pageW - margin - 4, y + 13, { align: "right" });

    y += 22;

    // Breakdown summary by category
    const categories = ["Cable", "Excavation", "Equipment", "Labour"];
    let subtotal = 0;
    categories.forEach(cat => {
      const catTotal = estimate!.breakdown.filter(b => b.category.toLowerCase() === cat.toLowerCase()).reduce((s, b) => s + b.total, 0);
      subtotal += catTotal;
      if (catTotal > 0) {
        metricRow(cat, formatGBP(catTotal), 50);
      }
    });
    metricRow("Subtotal", formatGBP(estimate.subtotal), 50);
    const feesTotal = estimate.total_estimate - estimate.subtotal;
    metricRow("Fees + Contingency", formatGBP(feesTotal), 50);

    y += 3;

    // Detailed cost breakdown
    checkPage(10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.black);
    doc.text("Detailed Cost Breakdown", margin, y);
    y += 5;

    doc.setFillColor("#f3f4f6");
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.grey);
    doc.text("ITEM", margin + 2, y + 4);
    doc.text("QTY", margin + 90, y + 4);
    doc.text("UNIT", margin + 108, y + 4);
    doc.text("RATE", margin + 126, y + 4);
    doc.text("TOTAL", margin + contentW - 2, y + 4, { align: "right" });
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.black);
    let lastCategory = "";

    estimate.breakdown.forEach((item) => {
      checkPage(8);
      if (item.category !== lastCategory) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(BRAND.green);
        doc.text(item.category.toUpperCase(), margin + 2, y);
        y += 4;
        lastCategory = item.category;
      }

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.black);
      doc.text(item.description, margin + 4, y);
      doc.text(item.quantity.toLocaleString(), margin + 90, y);
      doc.text(item.unit, margin + 108, y);
      doc.text(formatGBP(item.unit_rate), margin + 126, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatGBP(item.total), margin + contentW - 2, y, { align: "right" });
      y += 4;
    });

    y += 2;
    drawLine(y, BRAND.green);
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.green);
    doc.text("TOTAL", margin + 4, y);
    doc.text(formatGBP(estimate.total_estimate), margin + contentW - 2, y, { align: "right" });

    y += 8;
  }

  // ── BILL OF MATERIALS ──
  if (sec.bom && bom.length > 0) {
    checkPage(30);
    sectionTitle("Bill of Materials");

    doc.setFillColor("#f3f4f6");
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.grey);
    doc.text("ITEM", margin + 2, y + 4);
    doc.text("QTY", margin + 110, y + 4);
    doc.text("UNIT", margin + 130, y + 4);
    doc.text("COST", margin + contentW - 2, y + 4, { align: "right" });
    y += 8;

    let lastCat = "";
    const bomTotal = bom.reduce((s, b) => s + b.total_cost, 0);

    bom.forEach((item) => {
      checkPage(8);
      if (item.category !== lastCat) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(BRAND.green);
        doc.text(item.category.toUpperCase(), margin + 2, y);
        y += 4;
        lastCat = item.category;
      }

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.black);
      doc.text(item.item, margin + 4, y);
      doc.text(item.quantity.toLocaleString(), margin + 110, y);
      doc.text(item.unit, margin + 130, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatGBP(item.total_cost), margin + contentW - 2, y, { align: "right" });
      y += 4;
    });

    y += 2;
    drawLine(y, BRAND.green);
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND.green);
    doc.text("BOM TOTAL", margin + 4, y);
    doc.text(formatGBP(bomTotal), margin + contentW - 2, y, { align: "right" });
    y += 8;
  }

  // ── NEAREST SUBSTATIONS ──
  if (sec.nearestSubstations && input.nearestSubstations && input.nearestSubstations.length > 0) {
    checkPage(20 + input.nearestSubstations.length * 14);
    sectionTitle("Nearest Substations");

    input.nearestSubstations.forEach((sub) => {
      checkPage(14);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(BRAND.black);
      doc.text(sub.site_name, margin + 2, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.grey);
      doc.text(sub.site_id, margin + 2, y + 4);

      const demandStr = `${sub.max_demand_kw ?? "?"} / ${sub.firm_capacity_kw ?? "?"} kW`;
      doc.setTextColor(BRAND.black);
      doc.setFontSize(7);
      doc.text(`Demand / Capacity: ${demandStr}`, margin + 4, y + 8);
      if (sub.transformer_headroom_kw != null) {
        doc.text(`Headroom: ${sub.transformer_headroom_kw.toLocaleString()} kW`, margin + 90, y + 8);
      }

      y += 12;
    });

    y += 4;
  }

  // ── DESIGN ELEMENTS SUMMARY ──
  if (sec.designElements && input.designElements && input.designElements.length > 0) {
    checkPage(20);
    sectionTitle("Design Elements");

    doc.setFontSize(8);
    input.designElements.forEach(({ type, count }) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.grey);
      doc.text(type, margin + 2, y);
      doc.setTextColor(BRAND.black);
      doc.setFont("helvetica", "bold");
      doc.text(`×${count}`, margin + 55, y);
      y += 4.5;
    });
    y += 4;
  }

  // ── KEY FINDINGS ──
  if (sec.keyFindings) {
    checkPage(20 + input.reasons.length * 5);
    sectionTitle("Assessment Reasons");

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    input.reasons.forEach((r) => {
      checkPage(6);
      doc.setTextColor(BRAND.green);
      doc.text("→", margin + 2, y);
      doc.setTextColor(BRAND.black);
      const lines = doc.splitTextToSize(r, contentW - 10);
      doc.text(lines, margin + 8, y);
      y += lines.length * 4 + 1;
    });

    y += 4;
  }

  // ── NEXT STEPS ──
  if (sec.nextSteps) {
    checkPage(20 + input.nextSteps.length * 5);
    sectionTitle("Recommended Next Steps");

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    input.nextSteps.forEach((s, i) => {
      checkPage(6);
      doc.setTextColor(BRAND.green);
      doc.text(`${i + 1}.`, margin + 2, y);
      doc.setTextColor(BRAND.black);
      const lines = doc.splitTextToSize(s, contentW - 10);
      doc.text(lines, margin + 8, y);
      y += lines.length * 4 + 1;
    });
  }

  // ── DISCLAIMER ──
  checkPage(10);
  y += 4;
  doc.setFontSize(6);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(BRAND.grey);
  const disclaimer = "Budget estimates use UK industry-standard unit rates. Actual costs may vary based on site-specific conditions, DNO quotation, and market rates.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentW);
  doc.text(disclaimerLines, margin, y);

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor("#f9fafb");
    doc.rect(0, 282, pageW, 15, "F");
    drawLine(282, "#e5e7eb");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.grey);
    doc.text(
      "This is an indicative assessment using UK industry-standard rates. For a formal quotation, contact EcoPower Energy or your DNO directly.",
      pageW / 2, 288,
      { align: "center" }
    );
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, 293, { align: "right" });
    const footerLeft = input.snapshotId
      ? `© EcoPower Energy — Snapshot ${input.snapshotId.slice(0, 8)}`
      : "© EcoPower Energy — Confidential";
    doc.text(footerLeft, margin, 293);
  }

  // ── SAVE ──
  if (!input.skipSave) {
    const fileName = input.siteName
      ? `EPE-Assessment-${input.siteName.replace(/\s+/g, "-")}.pdf`
      : `EPE-Assessment-${input.postcode?.replace(/\s+/g, "") || "report"}.pdf`;
    const pdfBlob = doc.output("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);
    try {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 500);
    } catch {
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  }
  return doc;
}

/**
 * Export a complete assessment as a structured JSON file.
 */
export function exportAssessmentJson(input: {
  siteName?: string;
  proposedKw: number;
  lat?: number;
  lng?: number;
  score: string;
  reasons: string[];
  nextSteps: string[];
  distances?: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  constraints?: Record<string, unknown>;
  electricalResult?: ElectricalValidationResult | null;
  snapshotId?: string | null;
  costEstimate?: CostEstimate | null;
  bomItems?: BomItem[];
  designElements?: { type: string; label: string; lng: number; lat: number }[];
  routeCoords?: [number, number][];
}): void {
  const payload = {
    _meta: {
      format: "gridwise-assessment-v1",
      exported_at: new Date().toISOString(),
      snapshot_id: input.snapshotId || null,
    },
    site: {
      name: input.siteName || null,
      proposed_kw: input.proposedKw,
      coordinates: input.lat && input.lng ? { lat: input.lat, lng: input.lng } : null,
    },
    feasibility: {
      score: input.score,
      reasons: input.reasons,
      next_steps: input.nextSteps,
    },
    distances: input.distances || null,
    constraints: input.constraints || null,
    electrical_validation: input.electricalResult || null,
    cost_estimate: input.costEstimate || null,
    bill_of_materials: input.bomItems || null,
    design_elements: input.designElements || null,
    route: input.routeCoords ? {
      type: "LineString" as const,
      coordinates: input.routeCoords,
    } : null,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.siteName
    ? `EPE-Assessment-${input.siteName.replace(/\s+/g, "-")}.json`
    : `EPE-Assessment-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
