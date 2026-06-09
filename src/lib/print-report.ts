interface PrintOptions {
  title: string;
  subtitle?: string;
  bodyHtml: string;
}

const _esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function printReport({ title, subtitle, bodyHtml }: PrintOptions) {
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) return;
  const safeTitle = _esc(title);
  const safeSubtitle = subtitle ? _esc(subtitle) : "";
  w.document.open();
  w.document.write(`<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
  <style>
    *{box-sizing:border-box}
    body{font-family:'Hind Siliguri',system-ui,sans-serif;padding:28px;color:#111;background:#fff}
    .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px}
    .brand{font-weight:700;font-size:20px}
    .meta{font-size:11px;color:#475569;text-align:right}
    h1{font-size:18px;margin:6px 0 2px}
    h2{font-size:12px;margin:0 0 14px;color:#64748b;font-weight:500}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
    th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-weight:600}
    tr:nth-child(even) td{background:#f9fafb}
    .right{text-align:right;font-variant-numeric:tabular-nums}
    .totals{margin-top:14px;font-size:12px}
    .totals .row{display:flex;justify-content:space-between;border-top:1px dashed #cbd5e1;padding:4px 0}
    .totals .grand{font-weight:700;border-top:2px solid #0f172a;border-bottom:2px solid #0f172a;font-size:13px}
    .badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600}
    .b-ok{background:#dcfce7;color:#166534}
    .b-pend{background:#fef3c7;color:#92400e}
    .b-rej{background:#fee2e2;color:#991b1b}
    .actions{margin:8px 0 16px;display:flex;gap:8px}
    .actions button{padding:6px 14px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;cursor:pointer;font-family:inherit}
    .footer{margin-top:24px;font-size:10px;color:#64748b;text-align:right;border-top:1px solid #e2e8f0;padding-top:6px}
    @media print{ .actions{display:none} body{padding:14px} }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">CDB Bricks Ltd.</div>
      <h1>${title}</h1>
      ${subtitle ? `<h2>${subtitle}</h2>` : ""}
    </div>
    <div class="meta">
      প্রিন্ট তারিখ<br/>${new Date().toLocaleString("bn-BD")}
    </div>
  </div>
  <div class="actions"><button onclick="window.print()">প্রিন্ট / PDF সংরক্ষণ</button></div>
  ${bodyHtml}
  <div class="footer">© ${new Date().getFullYear()} CDB Bricks Sales Management System</div>
  <script>setTimeout(()=>{try{window.focus()}catch(e){}}, 200);</script>
</body>
</html>`);
  w.document.close();
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
