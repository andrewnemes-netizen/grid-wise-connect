import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface SurveyPdfInput {
  siteName?: string;
  postcode?: string;
  submitterName?: string;
  submitterEmail?: string;
  submittedAt?: Date;
  sections: Array<{
    title: string;
    rows: Array<[string, string | number | boolean | null | undefined]>;
  }>;
  images?: string[];
  signatureDataUrl?: string;
  companyName?: string;
}

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
};

export async function generateSurveyPdf(input: SurveyPdfInput): Promise<Blob> {
  const {
    siteName,
    postcode,
    submitterName,
    submitterEmail,
    submittedAt = new Date(),
    sections,
    images = [],
    signatureDataUrl,
    companyName = "EcoPower UK",
  } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;

  // Header
  doc.setFillColor(13, 122, 95);
  doc.rect(0, 0, pageW, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SITE SURVEY", marginX, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("On-Street / Public Car Park", marginX, 58);
  doc.setFontSize(9);
  doc.text(companyName, pageW - marginX, 40, { align: "right" });
  doc.text(submittedAt.toLocaleString("en-GB"), pageW - marginX, 55, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 100;

  // Site info block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(siteName ?? "Site", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (postcode) {
    doc.text(`Postcode: ${postcode}`, marginX, y);
    y += 14;
  }
  if (submitterName || submitterEmail) {
    doc.text(
      `Surveyor: ${submitterName ?? ""}${submitterEmail ? ` <${submitterEmail}>` : ""}`,
      marginX,
      y,
    );
    y += 14;
  }
  y += 6;

  // Sections as tables
  for (const section of sections) {
    if (!section.rows.length) continue;
    autoTable(doc, {
      startY: y,
      head: [[section.title, ""]],
      body: section.rows.map(([k, v]) => [k, fmt(v)]),
      theme: "grid",
      headStyles: { fillColor: [13, 122, 95], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { cellWidth: 200, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    if (y > pageH - 80) {
      doc.addPage();
      y = 60;
    }
  }

  // Images
  if (images.length > 0) {
    if (y > pageH - 200) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Photos", marginX, y);
    y += 12;

    const cellW = (pageW - marginX * 2 - 20) / 2;
    const cellH = 180;
    let col = 0;
    for (const src of images) {
      try {
        const dataUrl = await urlToDataUrl(src);
        const x = marginX + col * (cellW + 20);
        if (y + cellH > pageH - 60) { doc.addPage(); y = 60; col = 0; }
        doc.addImage(dataUrl, "JPEG", x, y, cellW, cellH, undefined, "FAST");
        col = col === 0 ? 1 : 0;
        if (col === 0) y += cellH + 12;
      } catch (e) {
        console.warn("Failed to embed image", e);
      }
    }
    if (col === 1) y += cellH + 12;
  }

  // Signature
  if (signatureDataUrl) {
    if (y > pageH - 140) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Signature", marginX, y);
    y += 8;
    try {
      doc.addImage(signatureDataUrl, "PNG", marginX, y, 200, 80);
    } catch (e) {
      console.warn("signature embed failed", e);
    }
    y += 90;
    if (submitterName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(submitterName, marginX, y);
    }
  }

  return doc.output("blob");
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}