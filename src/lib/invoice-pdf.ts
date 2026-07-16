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

export interface InvoicePdfInput {
  invoice: any;
  project?: any;
  clientName?: string;
  clientEmail?: string;
  clientAddress?: string[];
  companyName?: string;
  companyAddress?: string[];
}

export function generateInvoicePdf(input: InvoicePdfInput): Blob {
  const {
    invoice: i,
    project,
    clientName,
    clientEmail,
    clientAddress = [],
    companyName = "EcoPower UK",
    companyAddress = [],
  } = input;
  const ccy = "GBP";
  const isPA = i.doc_type === "payment_application";
  const title = isPA ? "PAYMENT APPLICATION" : "INVOICE";

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;

  // Header
  doc.setFillColor(13, 122, 95);
  doc.rect(0, 0, pageW, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, marginX, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(companyName, marginX, 65);
  if (companyAddress.length) doc.text(companyAddress.join(" · "), marginX, 80);

  // Meta on right
  doc.setFontSize(10);
  const meta = [
    `Number: ${i.invoice_number ?? "—"}`,
    `Issued: ${i.issue_date ?? new Date().toISOString().slice(0, 10)}`,
    `Due: ${i.due_date ?? "—"}`,
  ];
  if (i.po_number) meta.push(`PO: ${i.po_number}`);
  meta.forEach((line, idx) => {
    doc.text(line, pageW - marginX, 45 + idx * 14, { align: "right" });
  });

  // Bill-to
  let y = 120;
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  let by = y + 16;
  if (clientName) { doc.text(clientName, marginX, by); by += 14; }
  if (clientEmail) { doc.text(clientEmail, marginX, by); by += 14; }
  clientAddress.forEach((l) => { doc.text(l, marginX, by); by += 14; });

  // Project block on right
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.text("PROJECT", pageW - marginX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  const pRows = [
    project?.project_code,
    project?.site_location,
  ].filter(Boolean) as string[];
  pRows.forEach((line, idx) => {
    doc.text(line, pageW - marginX, y + 16 + idx * 14, { align: "right" });
  });

  // Period
  y = Math.max(by, y + 60) + 10;
  if (i.period_from || i.period_to) {
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(
      `Period: ${i.period_from ?? "—"} → ${i.period_to ?? "—"}`,
      marginX,
      y,
    );
    y += 16;
  }

  // Line table (single summary line — invoices here are header-level totals)
  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head: [["Description", "Amount"]],
    body: [
      [
        i.notes?.trim() ||
          `${isPA ? "Payment application" : "Invoice"} — ${project?.project_code ?? project?.site_location ?? "works"}`,
        fmt(i.net_amount, ccy),
      ],
    ],
    styles: { fontSize: 10, cellPadding: 8 },
    headStyles: { fillColor: [13, 122, 95], textColor: 255, halign: "left" },
    columnStyles: { 1: { halign: "right", cellWidth: 120 } },
  });

  // Totals
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  const rightX = pageW - marginX;
  const labelX = rightX - 160;
  let ty = finalY + 20;
  const totalRow = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? 13 : 60, bold ? 122 : 60, bold ? 95 : 60);
    doc.text(label, labelX, ty);
    doc.setTextColor(20, 20, 20);
    doc.text(val, rightX, ty, { align: "right" });
    ty += bold ? 20 : 16;
  };
  totalRow("Net", fmt(i.net_amount, ccy));
  totalRow(`VAT (${Number(i.vat_rate ?? 0)}%)`, fmt(i.vat_amount, ccy));
  totalRow("Total", fmt(i.gross_amount, ccy), true);

  // Payment terms footer
  ty += 20;
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "bold");
  doc.text("Payment terms", marginX, ty);
  doc.setFont("helvetica", "normal");
  ty += 14;
  doc.text(
    `Please remit payment by ${i.due_date ?? "the due date"} quoting invoice number ${i.invoice_number ?? ""}.`,
    marginX,
    ty,
    { maxWidth: pageW - marginX * 2 },
  );

  return doc.output("blob");
}

export function downloadInvoicePdf(input: InvoicePdfInput) {
  const blob = generateInvoicePdf(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${input.invoice.invoice_number ?? "invoice"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}