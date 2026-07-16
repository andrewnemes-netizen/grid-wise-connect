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
}

export function generatePoPdf(input: PoPdfInput): Blob {
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