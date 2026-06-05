import { jsPDF } from "jspdf";
import autoTable, { type RowInput, type Styles } from "jspdf-autotable";

const FONT_URLS = {
  normal: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/hindsiliguri/HindSiliguri-Regular.ttf",
  bold: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/hindsiliguri/HindSiliguri-Bold.ttf",
};

let fontCache: { normal: string; bold: string } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const toB64 = async (url: string) => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };
  const [normal, bold] = await Promise.all([toB64(FONT_URLS.normal), toB64(FONT_URLS.bold)]);
  fontCache = { normal, bold };
  return fontCache;
}

export interface PdfColumn {
  header: string;
  dataKey: string;
  align?: "left" | "right" | "center";
}

export interface PdfReportOptions {
  filename: string;
  reportTitle: string;
  subtitle?: string;
  adminName: string;
  columns: PdfColumn[];
  rows: Record<string, string | number>[];
  footerSummary?: { label: string; value: string }[];
}

export async function exportReportPdf(opts: PdfReportOptions) {
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.addFileToVFS("HindSiliguri-Regular.ttf", fonts.normal);
  doc.addFont("HindSiliguri-Regular.ttf", "HindSiliguri", "normal");
  doc.addFileToVFS("HindSiliguri-Bold.ttf", fonts.bold);
  doc.addFont("HindSiliguri-Bold.ttf", "HindSiliguri", "bold");
  doc.setFont("HindSiliguri", "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ts = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  // Header
  doc.setFont("HindSiliguri", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text("CDB Bricks", 40, 50);

  doc.setFont("HindSiliguri", "normal");
  doc.setFontSize(13);
  doc.setTextColor(51, 65, 85);
  doc.text(opts.reportTitle, 40, 72);

  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(opts.subtitle, 40, 88);
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${ts}`, pageWidth - 40, 50, { align: "right" });
  doc.text(`Admin: ${opts.adminName}`, pageWidth - 40, 64, { align: "right" });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.2);
  doc.line(40, 98, pageWidth - 40, 98);

  // Table
  const head = [opts.columns.map((c) => c.header)];
  const body: RowInput[] = opts.rows.map((r) => opts.columns.map((c) => String(r[c.dataKey] ?? "")));

  const columnStyles: Record<number, Partial<Styles>> = {};
  opts.columns.forEach((c, i) => {
    if (c.align) columnStyles[i] = { halign: c.align };
  });

  autoTable(doc, {
    startY: 110,
    head,
    body,
    styles: { font: "HindSiliguri", fontSize: 9, cellPadding: 5, textColor: [30, 41, 59] },
    headStyles: { font: "HindSiliguri", fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles,
    margin: { left: 40, right: 40, bottom: 60 },
  });

  // Footer summary
  if (opts.footerSummary && opts.footerSummary.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? 110;
    let y = finalY + 18;
    doc.setFont("HindSiliguri", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Summary", 40, y);
    y += 14;
    doc.setFont("HindSiliguri", "normal");
    doc.setFontSize(9);
    for (const s of opts.footerSummary) {
      doc.text(`${s.label}:`, 40, y);
      doc.text(s.value, 220, y);
      y += 14;
    }
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("HindSiliguri", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 40, pageHeight - 20, { align: "right" });
    doc.text("CDB Bricks Sales Management System", 40, pageHeight - 20);
  }

  doc.save(opts.filename);
}
