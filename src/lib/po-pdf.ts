import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: ccy,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(n));

export interface PoPdfInput {
  po: any;
  lines?: any[];
  workPackage?: any;
  recipientName?: string;
  recipientCompany?: string;
  recipientEmail?: string;
  recipientAddress?: string[];
  companyName?: string;
  companyAddress?: string[];
  // POC-specific extras (used when po.category === 'poc_design')
  programmeName?: string;
  organisationName?: string;
  sites?: Array<{
    address?: string | null;
    siteId?: string | null;
    postcode?: string | null;
    fee?: number | null;
  }>;
  feeBasis?: "per_site" | "fixed";
  poTerms?: string;
  paymentTerms?: string;
  dueDate?: string;
}

export function generatePoPdf(input: PoPdfInput): Blob {
  // Single entry point — branch on category so callers stay uniform.
  if (input.po?.category === "poc_design") return generatePocPoPdf(input);
  return generateStandardPoPdf(input);
}

function generateStandardPoPdf(input: PoPdfInput): Blob {
  const {
    po,
    lines = [],
    workPackage,
    recipientName,
    recipientCompany,
    recipientEmail,
    recipientAddress = [],
    companyName = "EcoPower UK",
    companyAddress = [],
  } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;

  // Header
  doc.setFillColor(13, 122, 95);
  doc.rect(0, 0, pageW, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("PURCHASE ORDER", marginX, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(companyName, marginX, 65);
  if (companyAddress.length) doc.text(companyAddress.join(" · "), marginX, 80);

  // Meta right
  doc.setFontSize(10);
  const meta = [
    `PO Number: ${po.po_number ?? "—"}`,
    `Issued: ${
      po.issued_at ? new Date(po.issued_at).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB")
    }`,
  ];
  if (po.expires_at) meta.push(`Expires: ${new Date(po.expires_at).toLocaleDateString("en-GB")}`);
  meta.forEach((line, idx) => {
    doc.text(line, pageW - marginX, 45 + idx * 14, { align: "right" });
  });

  // Supplier
  let y = 120;
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SUPPLIER", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  let by = y + 16;
  if (recipientCompany) { doc.text(recipientCompany, marginX, by); by += 14; }
  if (recipientName) { doc.text(recipientName, marginX, by); by += 14; }
  if (recipientEmail) { doc.text(recipientEmail, marginX, by); by += 14; }
  recipientAddress.forEach((l) => { doc.text(l, marginX, by); by += 14; });

  // Work package block right
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.text("WORK PACKAGE", pageW - marginX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  const wpRows = [workPackage?.wp_code, workPackage?.name].filter(Boolean) as string[];
  wpRows.forEach((line, idx) => {
    doc.text(line, pageW - marginX, y + 16 + idx * 14, { align: "right" });
  });

  y = Math.max(by, y + 60) + 10;

  // Lines table
  const rows = (lines && lines.length > 0)
    ? lines.map((l: any) => [l.description ?? "(no description)", fmt(l.line_value)])
    : [[po.notes?.trim() || "Ordered works — see attached scope", fmt(po.order_value)]];

  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head: [["Description", "Amount"]],
    body: rows,
    styles: { fontSize: 10, cellPadding: 8 },
    headStyles: { fillColor: [13, 122, 95], textColor: 255, halign: "left" },
    columnStyles: { 1: { halign: "right", cellWidth: 120 } },
  });

  // Total
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  const rightX = pageW - marginX;
  const labelX = rightX - 160;
  let ty = finalY + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(13, 122, 95);
  doc.text("Order Total", labelX, ty);
  doc.setTextColor(20, 20, 20);
  doc.text(fmt(po.order_value), rightX, ty, { align: "right" });
  ty += 24;

  // Notes / terms
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "bold");
  doc.text("Terms", marginX, ty);
  doc.setFont("helvetica", "normal");
  ty += 14;
  doc.text(
    `Please acknowledge this purchase order in writing and quote ${po.po_number ?? "the PO number"} on all delivery notes and invoices. Works and pricing per the agreed scope.`,
    marginX,
    ty,
    { maxWidth: pageW - marginX * 2 },
  );

  if (po.notes) {
    ty += 40;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", marginX, ty);
    doc.setFont("helvetica", "normal");
    ty += 14;
    doc.text(String(po.notes), marginX, ty, { maxWidth: pageW - marginX * 2 });
  }

  return doc.output("blob");
}

/**
 * Compact POC-design PO layout: organisation / programme / WP / designer /
 * per-site table / fee summary / terms. Same visual language as the standard PO
 * so it slots into the existing Purchase Orders tab without looking foreign.
 */
function generatePocPoPdf(input: PoPdfInput): Blob {
  const {
    po,
    workPackage,
    recipientName,
    recipientCompany,
    recipientEmail,
    companyName = "EcoPower UK",
    companyAddress = [],
    programmeName,
    organisationName,
    sites = [],
    feeBasis = "per_site",
    poTerms,
    paymentTerms,
    dueDate,
  } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;

  // Header
  doc.setFillColor(13, 122, 95);
  doc.rect(0, 0, pageW, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PURCHASE ORDER — POC DESIGN", marginX, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(companyName, marginX, 63);
  if (companyAddress.length) doc.text(companyAddress.join(" · "), marginX, 78);

  doc.setFontSize(10);
  const meta = [
    `PO Number: ${po.po_number ?? "—"}`,
    `Issued: ${po.issued_at ? new Date(po.issued_at).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB")}`,
  ];
  if (dueDate) meta.push(`Target return: ${dueDate}`);
  meta.forEach((line, idx) => doc.text(line, pageW - marginX, 42 + idx * 14, { align: "right" }));

  // Context block: Organisation / Programme / WP
  let y = 116;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.text("CONTEXT", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  y += 16;
  const ctxRows = [
    organisationName ? `Organisation: ${organisationName}` : null,
    programmeName ? `Programme: ${programmeName}` : null,
    workPackage?.wp_code || workPackage?.name
      ? `Work Package: ${[workPackage?.wp_code, workPackage?.name].filter(Boolean).join(" — ")}`
      : null,
  ].filter(Boolean) as string[];
  ctxRows.forEach((line) => { doc.text(line, marginX, y); y += 14; });

  // Designer block
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.text("DESIGNER (SUPPLIER)", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  y += 16;
  if (recipientCompany) { doc.text(recipientCompany, marginX, y); y += 14; }
  if (recipientName) { doc.text(recipientName, marginX, y); y += 14; }
  if (recipientEmail) { doc.text(recipientEmail, marginX, y); y += 14; }
  y += 4;

  // Sites table
  const rows = sites.length > 0
    ? sites.map((s, i) => [
        String(i + 1),
        [s.address, s.postcode].filter(Boolean).join(", ") || "(site)",
        s.siteId ?? "—",
        fmt(s.fee),
      ])
    : [["1", "POC design services", "—", fmt(po.order_value)]];

  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head: [["#", "Site", "Site ID", "Fee"]],
    body: rows,
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [13, 122, 95], textColor: 255, halign: "left" },
    columnStyles: {
      0: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 70 },
      3: { cellWidth: 90, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  const rightX = pageW - marginX;
  const labelX = rightX - 200;
  let ty = finalY + 20;

  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Fee basis: ${feeBasis === "fixed" ? "Fixed total" : "Per site"}`, marginX, ty);
  ty += 14;
  if (paymentTerms) { doc.text(`Payment terms: ${paymentTerms}`, marginX, ty); ty += 14; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(13, 122, 95);
  doc.text("Order Total", labelX, ty);
  doc.setTextColor(20, 20, 20);
  doc.text(fmt(po.order_value), rightX, ty, { align: "right" });
  ty += 24;

  // Terms
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "bold");
  doc.text("Terms", marginX, ty);
  doc.setFont("helvetica", "normal");
  ty += 14;
  const defaultTerms = `Please acknowledge this purchase order in writing and quote ${po.po_number ?? "the PO number"} on all deliverables and invoices. POC applications to be submitted to the relevant DNO per the agreed scope by the target return date.`;
  const termsText = poTerms?.trim() || defaultTerms;
  doc.text(termsText, marginX, ty, { maxWidth: pageW - marginX * 2 });

  return doc.output("blob");
}

export function downloadPoPdf(input: PoPdfInput) {
  const blob = generatePoPdf(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${input.po.po_number ?? "purchase-order"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}