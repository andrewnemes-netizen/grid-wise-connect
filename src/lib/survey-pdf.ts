import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface SurveyPhotoGroup {
  key: string;
  title: string;
  photos: Array<{ url: string; caption?: string }>;
}

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
  photoGroups?: SurveyPhotoGroup[];
  signatureDataUrl?: string;
  companyName?: string;
  relevantDno?: string;
  surveyDate?: string;
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
    photoGroups = [],
    signatureDataUrl,
    companyName = "EcoPower UK",
    relevantDno,
    surveyDate,
  } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;

  const drawHeader = () => {
    doc.setFillColor(13, 122, 95);
    doc.rect(0, 0, pageW, 48, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("On-Street/Public Car Park Site Survey", marginX, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(companyName, pageW - marginX, 22, { align: "right" });
    doc.text(submittedAt.toLocaleString("en-GB"), pageW - marginX, 36, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  drawHeader();
  let y = 70;

  // Cover block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(siteName ?? "Site Survey", marginX, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const cover: string[] = [];
  if (postcode) cover.push(`Postcode: ${postcode}`);
  if (relevantDno) cover.push(`Relevant DNO: ${relevantDno}`);
  if (surveyDate) cover.push(`Site Survey Date: ${new Date(surveyDate).toLocaleString("en-GB")}`);
  if (submitterName || submitterEmail) {
    cover.push(`Surveyor: ${submitterName ?? ""}${submitterEmail ? ` <${submitterEmail}>` : ""}`);
  }
  for (const line of cover) {
    doc.text(line, marginX, y);
    y += 14;
  }
  y += 8;

  // Sections as tables
  for (const section of sections) {
    if (!section.rows.length) continue;
    if (y > pageH - 140) { doc.addPage(); drawHeader(); y = 70; }
    autoTable(doc, {
      startY: y,
      head: [[section.title, ""]],
      body: section.rows.map(([k, v]) => [k, fmt(v)]),
      theme: "grid",
      headStyles: { fillColor: [13, 122, 95], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { cellWidth: 220, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
      margin: { left: marginX, right: marginX },
      didDrawPage: () => drawHeader(),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  // Photo groups — one section per group, photos with captions.
  for (const group of photoGroups) {
    if (!group.photos.length) continue;
    doc.addPage();
    drawHeader();
    y = 70;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(group.title, marginX, y);
    y += 14;
    const isSatellite = group.key === "satellite_view";
    // Satellite = one large image per page; others = 2-up.
    const cellW = isSatellite ? pageW - marginX * 2 : (pageW - marginX * 2 - 16) / 2;
    const cellH = isSatellite ? 380 : 220;
    let col = 0;
    for (const photo of group.photos) {
      try {
        const dataUrl = await urlToDataUrl(photo.url);
        if (y + cellH + (photo.caption ? 20 : 8) > pageH - 40) {
          doc.addPage();
          drawHeader();
          y = 70;
          col = 0;
        }
        const x = marginX + col * (cellW + 16);
        const ext = detectImageExt(dataUrl);
        doc.addImage(dataUrl, ext, x, y, cellW, cellH, undefined, "FAST");
        if (photo.caption) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
          const captionLines = doc.splitTextToSize(photo.caption, cellW);
          doc.text(captionLines, x, y + cellH + 10);
          doc.setTextColor(0, 0, 0);
        }
        if (isSatellite) {
          y += cellH + (photo.caption ? 24 : 12);
          col = 0;
        } else {
          col = col === 0 ? 1 : 0;
          if (col === 0) y += cellH + (photo.caption ? 24 : 14);
        }
      } catch (e) {
        console.warn("Failed to embed image", e);
      }
    }
    if (!isSatellite && col === 1) y += cellH + 14;
  }

  // Signature
  if (signatureDataUrl) {
    if (y > pageH - 160) { doc.addPage(); drawHeader(); y = 70; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Signature", marginX, y);
    y += 14;
    try {
      doc.addImage(signatureDataUrl, "PNG", marginX, y, 200, 80);
    } catch (e) {
      console.warn("signature embed failed", e);
    }
    y += 96;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (submitterName) doc.text(submitterName, marginX, y);
    if (submitterEmail) {
      y += 14;
      doc.setTextColor(80, 80, 80);
      doc.text(submitterEmail, marginX, y);
      doc.setTextColor(0, 0, 0);
    }
  }

  return doc.output("blob");
}

function detectImageExt(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
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