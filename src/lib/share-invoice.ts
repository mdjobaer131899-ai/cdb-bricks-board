import { toPng } from "html-to-image";
import { toast } from "sonner";

export async function captureNodeAsPng(node: HTMLElement, filename = "invoice.png"): Promise<File | null> {
  try {
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
    });
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], filename, { type: "image/png" });
  } catch (e) {
    console.error("captureNodeAsPng failed", e);
    return null;
  }
}

export async function shareNodeAsImage(
  node: HTMLElement,
  opts: { title?: string; text?: string; filename?: string } = {}
) {
  const { title = "ইনভয়েস", text = "", filename = "invoice.png" } = opts;
  const file = await captureNodeAsPng(node, filename);
  if (!file) {
    toast.error("ছবি তৈরি করা যায়নি");
    return;
  }
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title, text });
      return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }
  // fallback: download
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("ছবি ডাউনলোড হয়েছে — এখন শেয়ার করুন");
}

export async function downloadNodeAsImage(node: HTMLElement, filename = "invoice.png") {
  const file = await captureNodeAsPng(node, filename);
  if (!file) {
    toast.error("ছবি তৈরি করা যায়নি");
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("ডাউনলোড সম্পন্ন");
}

export function printNode(node: HTMLElement, title = "ইনভয়েস") {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    toast.error("পপ-আপ ব্লক করা হয়েছে");
    return;
  }
  const html = node.outerHTML;
  const safeTitle = title.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  w.document.open();
  w.document.write(`<!doctype html>
<html lang="bn"><head><meta charset="utf-8"/>
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff;padding:24px}
  .inv-doc{max-width:820px;margin:0 auto;border:1px solid #d1d5db;padding:32px;background:#fff}
  .inv-title{font-size:34px;font-weight:700;letter-spacing:1px;text-align:right;color:#374151}
  .inv-meta{font-size:13px;margin-top:8px}
  .inv-meta div{display:flex;gap:12px;padding:2px 0}
  .inv-meta .lbl{width:90px;color:#374151}
  .inv-hr{border-bottom:1px solid #111;margin:12px 0 18px}
  .inv-addr{display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:13px;margin-bottom:18px}
  .inv-addr .h{color:#6b7280;margin-bottom:6px}
  .inv-addr .name{font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #9ca3af;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-weight:600;font-size:12px}
  .right{text-align:right;font-variant-numeric:tabular-nums}
  .center{text-align:center}
  .ref-table{margin:14px 0 6px}
  .pay-terms{font-style:italic;font-size:12px;color:#374151;margin:6px 0 14px}
  .totals td{border:none;padding:4px 10px;font-size:13px}
  .totals .grand{font-weight:700;border-top:1px solid #111;border-bottom:1px solid #111}
  .footer-note{margin-top:28px;font-size:11px;text-align:center;color:#4b5563;font-style:italic}
  .footer-note p{margin:3px 0}
  @media print{
    body{padding:0}
    .inv-doc{border:none;padding:18px;max-width:100%}
  }
</style></head>
<body>${html}
<script>setTimeout(()=>{window.focus();window.print();},250);</script>
</body></html>`);
  w.document.close();
}
