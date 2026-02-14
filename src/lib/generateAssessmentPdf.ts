/**
 * Branded PDF report generation for EcoPower site assessments.
 * Uses jsPDF to create a professional connection feasibility report.
 */
import jsPDF from "jspdf";
import { estimateConnectionCost, generateBom, type CostEstimate, type BomItem } from "./connectionCosts";

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
    wayleave_intersect?: boolean;
    min_footway_m?: number | null;
    min_carriageway_m?: number | null;
  };
}

// EcoPower brand colours (HSL from design tokens → hex)
const BRAND = {
  green: "#3d6b2e",      // primary
  greenLight: "#e8f0e4", // primary/10
  amber: "#d97706",
  red: "#dc2626",
  grey: "#6b7280",
  darkGreen: "#1f3a17",
  white: "#ffffff",
  black: "#1a2b14",
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

export function generateAssessmentPdf(input: PdfInput): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ── Helper functions ──
  const addPage = () => {
    doc.addPage();
    y = margin;
  };

  const checkPage = (needed: number) => {
    if (y + needed > 275) addPage();
  };

  const drawLine = (yPos: number, color = "#e5e7eb") => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageW - margin, yPos);
  };

  // ── HEADER BAR ──
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
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, pageW - margin, 12, { align: "right" });
  doc.text(`Ref: EPE-${Date.now().toString(36).toUpperCase()}`, pageW - margin, 18, { align: "right" });

  y = 36;

  // ── SCORE BANNER ──
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

  // ── SITE DETAILS ──
  doc.setTextColor(BRAND.black);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Site Details", margin, y);
  y += 6;
  drawLine(y);
  y += 4;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const details: [string, string][] = [];
  if (input.siteName) details.push(["Site Name", input.siteName]);
  if (input.postcode) details.push(["Postcode", input.postcode]);
  if (input.proposedKw > 0) details.push(["Proposed Load", `${input.proposedKw} kW`]);
  if (input.lat && input.lng) details.push(["Coordinates", `${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`]);

  details.forEach(([label, value]) => {
    doc.setTextColor(BRAND.grey);
    doc.text(label, margin, y);
    doc.setTextColor(BRAND.black);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + 50, y);
    doc.setFont("helvetica", "normal");
    y += 5;
  });

  y += 4;

  // ── CONNECTION PROXIMITY ──
  if (input.distances || input.distanceBands) {
    checkPage(30);
    doc.setTextColor(BRAND.black);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Connection Proximity", margin, y);
    y += 6;
    drawLine(y);
    y += 4;

    doc.setFontSize(9);
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
      doc.setFont("helvetica", "normal");
      doc.setTextColor(BRAND.grey);
      doc.text(label, margin, y);
      doc.setTextColor(BRAND.black);
      doc.setFont("helvetica", "bold");
      doc.text(value, margin + 50, y);
      y += 5;
    });

    y += 4;
  }

  // ── BUDGET ESTIMATE ──
  let estimate: CostEstimate | null = null;
  let bom: BomItem[] = [];

  if (input.distances && input.proposedKw > 0) {
    estimate = estimateConnectionCost({
      proposed_kw: input.proposedKw,
      distances: input.distances,
      constraints: input.constraints,
    });
    bom = generateBom({
      proposed_kw: input.proposedKw,
      distances: input.distances,
      constraints: input.constraints,
    });

    checkPage(50);
    doc.setTextColor(BRAND.black);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Budget Estimate", margin, y);
    y += 6;
    drawLine(y);
    y += 6;

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

    // Cost breakdown table header
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

    // Total row
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
  if (bom.length > 0) {
    checkPage(30);
    doc.setTextColor(BRAND.black);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Bill of Materials", margin, y);
    y += 6;
    drawLine(y);
    y += 4;

    // BoM table header
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

  // ── KEY FINDINGS ──
  checkPage(20 + input.reasons.length * 5);
  doc.setTextColor(BRAND.black);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Key Findings", margin, y);
  y += 6;
  drawLine(y);
  y += 4;

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

  // ── NEXT STEPS ──
  checkPage(20 + input.nextSteps.length * 5);
  doc.setTextColor(BRAND.black);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Recommended Next Steps", margin, y);
  y += 6;
  drawLine(y);
  y += 4;

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
    doc.text("© EcoPower Energy — Confidential", margin, 293);
  }

  // ── SAVE ──
  const fileName = input.siteName
    ? `EPE-Assessment-${input.siteName.replace(/\s+/g, "-")}.pdf`
    : `EPE-Assessment-${input.postcode?.replace(/\s+/g, "") || "report"}.pdf`;

  doc.save(fileName);
}
