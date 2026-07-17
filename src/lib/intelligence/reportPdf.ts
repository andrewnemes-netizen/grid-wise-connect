import jsPDF from "jspdf";
import type { Kpis } from "./kpis";

const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number) => `${Math.round((n || 0) * 100)}%`;

export function generateClientMonthlyPdf(opts: {
  clientName: string;
  monthLabel: string;
  kpis: Kpis;
  execSummary?: string;
}): Blob {
  const { clientName, monthLabel, kpis, execSummary } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = M;

  const h1 = (t: string) => {
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(t, M, y);
    y += 26;
  };
  const h2 = (t: string) => {
    y += 6;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(t, M, y);
    y += 16;
    doc.setDrawColor(220);
    doc.line(M, y - 6, W - M, y - 6);
  };
  const p = (t: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(t, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 13;
  };
  const kv = (rows: [string, string][]) => {
    doc.setFontSize(10);
    rows.forEach(([k, v]) => {
      doc.setFont("helvetica", "normal");
      doc.text(k, M, y);
      doc.setFont("helvetica", "bold");
      doc.text(v, W - M, y, { align: "right" });
      y += 14;
    });
  };
  const rag = (r: string) => (r === "GREEN" ? [22, 163, 74] : r === "AMBER" ? [217, 119, 6] : [220, 38, 38]);
  const pageBreakIfNeeded = (need = 100) => {
    if (y + need > doc.internal.pageSize.getHeight() - M) {
      doc.addPage();
      y = M;
    }
  };

  // Header
  h1(clientName);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Monthly Programme Report · ${monthLabel}`, M, y);
  y += 22;
  const [r, g, b] = rag(kpis.programmeHealth);
  doc.setFillColor(r, g, b);
  doc.roundedRect(M, y, 90, 22, 4, 4, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.text(`RAG · ${kpis.programmeHealth}`, M + 45, y + 15, { align: "center" });
  doc.setTextColor(0);
  y += 34;

  // Exec summary
  h2("Executive Summary");
  if (execSummary) {
    p(execSummary);
  } else {
    p("No AI summary generated. Click 'AI Exec Summary' on the report page before exporting.");
  }

  // Programme Delivery
  pageBreakIfNeeded();
  h2("Programme Delivery");
  kv([
    ["Total sites in scope", String(kpis.sitesTotal)],
    ["Sites delivered", String(kpis.sitesDelivered)],
    ["Sites behind programme", String(kpis.sitesBehind)],
    ["Ready for Construction", String(kpis.readyForConstruction)],
    ["Ready for Energisation", String(kpis.readyForEnergisation)],
    ["Average days per stage (90d)", kpis.avgDaysPerStage.toFixed(1)],
  ]);

  // POC
  pageBreakIfNeeded();
  h2("Point of Connection (DNO offers)");
  kv([
    ["Total submitted", String(kpis.pocSubmitted)],
    ["Approved / accepted", String(kpis.pocApproved)],
    ["Outstanding", String(kpis.pocOutstanding)],
  ]);

  // Surveys
  pageBreakIfNeeded();
  h2("Surveys");
  kv([
    ["Requested", String(kpis.surveysRequested)],
    ["Completed", String(kpis.surveysCompleted)],
    ["Outstanding", String(kpis.surveysRequested - kpis.surveysCompleted)],
  ]);

  // Design
  pageBreakIfNeeded();
  h2("Design");
  kv([
    ["Issued", String(kpis.designsIssued)],
    ["Approved", String(kpis.designsApproved)],
    ["In review", String(Math.max(0, kpis.designsIssued - kpis.designsApproved))],
  ]);

  // Commercial
  pageBreakIfNeeded();
  h2("Commercial");
  kv([
    ["Revenue invoiced (this month, net)", money(kpis.revenueMonthNet)],
    ["Actual costs (this month)", money(kpis.actualCostsMonth)],
    ["Gross margin (this month)", pct(kpis.grossMargin)],
    ["Pipeline value (site estimates)", money(kpis.pipelineValue)],
    ["Variations (active)", money(kpis.variationValue)],
  ]);

  // Risks
  pageBreakIfNeeded();
  h2("Auto-generated risks");
  const risks: string[] = [];
  if (kpis.pocOutstanding > 0) risks.push(`${kpis.pocOutstanding} DNO offers outstanding; likely largest schedule risk.`);
  if (kpis.surveysRequested - kpis.surveysCompleted > 0)
    risks.push(`${kpis.surveysRequested - kpis.surveysCompleted} surveys overdue / outstanding.`);
  if (kpis.sitesBehind > 0) risks.push(`${kpis.sitesBehind} sites carrying an active blocker.`);
  if (kpis.designsIssued - kpis.designsApproved > 0)
    risks.push(`${kpis.designsIssued - kpis.designsApproved} designs awaiting approval.`);
  if (risks.length === 0) risks.push("No material risks detected against automated thresholds.");
  risks.forEach((r) => p(`• ${r}`));

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Gridwise Intelligence · ${clientName} · ${monthLabel}`, M, doc.internal.pageSize.getHeight() - 20);
    doc.text(`Page ${i} of ${pages}`, W - M, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  return doc.output("blob");
}
