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

export interface QuotationPdfInput {
  estimate: any;
  groups: any[];
  lines: any[];
  companyName?: string;
  companyAddress?: string[];
  siteName?: string;
  clientName?: string;
  clientEmail?: string;
}

export function generateQuotationPdf(input: QuotationPdfInput): Blob {
  const { estimate: e, groups, lines, companyName = "EcoPower UK", companyAddress = [], siteName, clientName, clientEmail } = input;
  const ccy = e.currency ?? "GBP";

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;

  // Header bar
  doc.setFillColor(13, 122, 95);
  doc.rect(0, 0, pageW, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("QUOTATION", marginX, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(companyName, marginX, 65);
  if (companyAddress.length) doc.text(companyAddress.join(" · "), marginX, 80);

  // Ref / date on right
  doc.setFontSize(10);
  const refLines = [
    `Ref: ${e.ref ?? e.name ?? "—"}`,
    `Date: ${new Date().toLocaleDateString("en-GB")}`,
    `Valid: 30 days`,
  ];
  refLines.forEach((line, i) => {
    doc.text(line, pageW - marginX, 45 + i * 14, { align: "right" });
  });

  // Client block
  let y = 120;
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PREPARED FOR", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  if (clientName) doc.text(clientName, marginX, y + 16);
  if (clientEmail) doc.text(clientEmail, marginX, y + 30);
  if (siteName) doc.text(`Site: ${siteName}`, marginX, y + 44);

  // Estimate title
  y = 190;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(13, 122, 95);
  doc.text(e.name ?? "Estimate", marginX, y);

  // Build BOQ table rows
  const groupMap = new Map<string, any>((groups ?? []).map((g) => [g.id, g]));
  const linesByGroup = new Map<string, any[]>();
  for (const l of lines ?? []) {
    const k = l.group_id ?? "__ungrouped";
    if (!linesByGroup.has(k)) linesByGroup.set(k, []);
    linesByGroup.get(k)!.push(l);
  }

  const rows: any[] = [];
  const orderedGroups = [...(groups ?? [])].sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
  for (const g of orderedGroups) {
    const gLines = linesByGroup.get(g.id) ?? [];
    if (gLines.length === 0) continue;
    rows.push([{ content: g.name, colSpan: 5, styles: { fillColor: [245, 242, 234], textColor: [13, 122, 95], fontStyle: "bold" } }]);
    for (const l of gLines) {
      rows.push([
        { content: l.boq_item_name ?? "—", styles: { cellWidth: "auto" } },
        { content: `${Number(l.qty ?? 0).toLocaleString()} ${l.uom ?? ""}`.trim(), styles: { halign: "right" } },
        { content: fmt(l.unit_price, ccy), styles: { halign: "right" } },
        { content: fmt(l.discount, ccy), styles: { halign: "right" } },
        { content: fmt(l.sub_total, ccy), styles: { halign: "right", fontStyle: "bold" } },
      ]);
    }
  }

  const ungrouped = linesByGroup.get("__ungrouped") ?? [];
  if (ungrouped.length) {
    rows.push([{ content: "Other", colSpan: 5, styles: { fillColor: [245, 242, 234], textColor: [13, 122, 95], fontStyle: "bold" } }]);
    for (const l of ungrouped) {
      rows.push([
        l.boq_item_name ?? "—",
        { content: `${Number(l.qty ?? 0).toLocaleString()} ${l.uom ?? ""}`.trim(), styles: { halign: "right" } },
        { content: fmt(l.unit_price, ccy), styles: { halign: "right" } },
        { content: fmt(l.discount, ccy), styles: { halign: "right" } },
        { content: fmt(l.sub_total, ccy), styles: { halign: "right", fontStyle: "bold" } },
      ]);
    }
  }

  autoTable(doc, {
    startY: y + 12,
    head: [["Description", "Qty", "Unit Price", "Discount", "Sub Total"]],
    body: rows,
    headStyles: { fillColor: [13, 122, 95], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 60, halign: "right" },
      2: { cellWidth: 70, halign: "right" },
      3: { cellWidth: 60, halign: "right" },
      4: { cellWidth: 75, halign: "right" },
    },
    margin: { left: marginX, right: marginX },
  });

  const finalY = (doc as any).lastAutoTable.finalY ?? y + 40;
  let ty = finalY + 20;

  const totalsX = pageW - marginX - 220;
  const rowH = 18;
  const totals: [string, string, boolean?][] = [
    ["Subtotal (cost)", fmt(e.total_cost, ccy)],
    ["Markup", fmt(e.total_markup, ccy)],
    ["Discount", fmt(e.total_discount ? -Number(e.total_discount) : 0, ccy)],
    ["Net Price", fmt(e.total_price, ccy)],
    ["VAT", fmt(e.vat_total, ccy)],
    ["Grand Total", fmt(e.grand_total, ccy), true],
  ];
  totals.forEach(([label, val, big], i) => {
    if (big) {
      doc.setDrawColor(13, 122, 95);
      doc.setLineWidth(1);
      doc.line(totalsX, ty + i * rowH - 4, pageW - marginX, ty + i * rowH - 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(13, 122, 95);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
    }
    doc.text(label, totalsX, ty + i * rowH + 8);
    doc.text(val, pageW - marginX, ty + i * rowH + 8, { align: "right" });
  });

  // Footer terms
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Prices are exclusive of VAT unless shown. Valid for 30 days from date of issue. Subject to standard terms and conditions.",
    marginX,
    pageH - 30,
    { maxWidth: pageW - marginX * 2 }
  );

  return doc.output("blob");
}

export function downloadQuotationPdf(input: QuotationPdfInput, filename?: string) {
  const blob = generateQuotationPdf(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `quotation-${input.estimate?.ref ?? input.estimate?.id ?? "estimate"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}