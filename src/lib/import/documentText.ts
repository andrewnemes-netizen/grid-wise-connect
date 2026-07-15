/**
 * Client-side text extraction for PDF and DOCX uploads.
 * Returns plain text ready to be sent to the extract-sites-from-text edge function.
 */

export async function extractPdfText(file: File): Promise<string> {
  // Dynamic import so pdfjs isn't pulled into the main bundle unless needed.
  const pdfjs = await import("pdfjs-dist");
  // Configure worker via CDN — matches installed version.
  const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 50);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .filter(Boolean);
    parts.push(strings.join(" "));
  }
  return parts.join("\n\n").trim();
}

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value ?? "").trim();
}

export function detectExtractableType(file: File): "pdf" | "docx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  return null;
}