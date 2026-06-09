import { forwardRef } from "react";
import { bn, bnDate } from "@/lib/format";
import logoAsset from "@/assets/cdb-logo.png.asset.json";

export interface InvoiceItem {
  code?: string | null;
  description: string;
  subDescription?: string | null;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export interface InvoiceData {
  invoiceNo: string;
  date: string; // ISO
  dueDate?: string | null;
  customerRef?: string | null;
  salesPerson?: string | null;
  paymentTerms?: string | null;
  to: { name: string; lines?: string[] };
  deliverTo?: { name: string; lines?: string[] } | null;
  items: InvoiceItem[];
  subtotal: number;
  total: number;
  notes?: string[];
}

export const InvoiceDocument = forwardRef<HTMLDivElement, { data: InvoiceData }>(
  function InvoiceDocument({ data }, ref) {
    return (
      <div ref={ref} className="inv-doc" style={{ position: "relative", background: "#fff", color: "#111", fontFamily: "'Hind Siliguri', system-ui, sans-serif", padding: 32, maxWidth: 820, margin: "0 auto", border: "1px solid #d1d5db", overflow: "hidden" }}>
        {/* Watermark */}
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 0 }}>
          <img src={logoAsset.url} alt="" style={{ width: 480, height: 480, objectFit: "contain", opacity: 0.07 }} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div className="inv-meta" style={{ fontSize: 13 }}>
            <div style={{ display: "flex", gap: 12, padding: "2px 0" }}>
              <span style={{ width: 90, color: "#374151" }}>তারিখ:</span>
              <span>{bnDate(data.date)}</span>
            </div>
            <div style={{ display: "flex", gap: 12, padding: "2px 0" }}>
              <span style={{ width: 90, color: "#374151" }}>চালান নং:</span>
              <span style={{ fontWeight: 600 }}>{data.invoiceNo}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <img src={logoAsset.url} alt="CDB Bricks" style={{ width: 64, height: 64, objectFit: "contain" }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#c2410c", textAlign: "right" }}>CDB Bricks Ltd.</div>
              <div style={{ fontSize: 11, color: "#6b7280", textAlign: "right" }}>কাপাসিয়া, গাজীপুর</div>
              <div className="inv-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1, textAlign: "right", color: "#374151", marginTop: 4 }}>
                INVOICE
              </div>
            </div>
          </div>
        </div>

        <div className="inv-hr" style={{ borderBottom: "1px solid #111", margin: "12px 0 18px" }} />

        <div className="inv-addr" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontSize: 13, marginBottom: 18 }}>
          <div>
            <div className="h" style={{ color: "#6b7280", marginBottom: 6 }}>প্রাপক (To)</div>
            <div className="name" style={{ fontWeight: 600 }}>{data.to.name}</div>
            {data.to.lines?.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {data.deliverTo && (
            <div>
              <div className="h" style={{ color: "#6b7280", marginBottom: 6 }}>ডেলিভার (Deliver To)</div>
              <div className="name" style={{ fontWeight: 600 }}>{data.deliverTo.name}</div>
              {data.deliverTo.lines?.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>

        <table className="ref-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, margin: "14px 0 6px" }}>
          <thead>
            <tr>
              <th style={thStyle}>গ্রাহক রেফারেন্স</th>
              <th style={thStyle}>সেলস পারসন</th>
              <th style={thStyle}>বিক্রয় তারিখ</th>
              <th style={thStyle}>পরিশোধের তারিখ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>{data.customerRef || "—"}</td>
              <td style={tdStyle}>{data.salesPerson || "—"}</td>
              <td style={tdStyle}>{bnDate(data.date)}</td>
              <td style={tdStyle}>{data.dueDate ? bnDate(data.dueDate) : "—"}</td>
            </tr>
          </tbody>
        </table>

        {data.paymentTerms && (
          <div className="pay-terms" style={{ fontStyle: "italic", fontSize: 12, color: "#374151", margin: "6px 0 14px" }}>
            পরিশোধ শর্ত: {data.paymentTerms}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
          <thead>
            <tr>
              <th style={thStyle}>আইটেম কোড</th>
              <th style={thStyle}>পণ্যের বিবরণ</th>
              <th style={{ ...thStyle, textAlign: "right" }}>পরিমাণ</th>
              <th style={thStyle}>একক</th>
              <th style={{ ...thStyle, textAlign: "right" }}>মূল্য (৳)</th>
              <th style={{ ...thStyle, textAlign: "right" }}>মোট (৳)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i}>
                <td style={tdStyle}>{it.code || "—"}</td>
                <td style={tdStyle}>
                  <div>{it.description}</div>
                  {it.subDescription && <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{it.subDescription}</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{bn(it.quantity)}</td>
                <td style={tdStyle}>{it.unit}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{bn(it.price)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{bn(it.total)}</td>
              </tr>
            ))}
            {/* spacer rows for invoice look */}
            {Array.from({ length: Math.max(0, 4 - data.items.length) }).map((_, i) => (
              <tr key={`s-${i}`}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} style={{ ...tdStyle, height: 22 }}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ border: "none" }}></td>
              <td style={{ ...tdStyle, textAlign: "right", border: "none", paddingTop: 10 }}>সাব-টোটাল</td>
              <td style={{ ...tdStyle, textAlign: "right", border: "none", paddingTop: 10, fontVariantNumeric: "tabular-nums" }}>{bn(data.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} style={{ border: "none" }}></td>
              <td style={{ ...tdStyle, textAlign: "right", border: "none", borderTop: "1px solid #111", borderBottom: "1px solid #111", fontWeight: 700 }}>সর্বমোট</td>
              <td style={{ ...tdStyle, textAlign: "right", border: "none", borderTop: "1px solid #111", borderBottom: "1px solid #111", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{bn(data.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="footer-note" style={{ marginTop: 28, fontSize: 11, textAlign: "center", color: "#4b5563", fontStyle: "italic" }}>
          {(data.notes ?? [
            "১. সকল পেমেন্ট CDB Bricks Ltd. এর অনুকূলে প্রদান করুন।",
            "২. একবার বিক্রিত পণ্য ফেরতযোগ্য নয়।",
          ]).map((n, i) => <p key={i} style={{ margin: "3px 0" }}>{n}</p>)}
          <p style={{ margin: "10px 0 3px" }}>এটি একটি কম্পিউটার-জেনারেটেড ইনভয়েস, কোনো স্বাক্ষরের প্রয়োজন নেই।</p>
        </div>
        </div>
      </div>
    );
  }
);

const thStyle: React.CSSProperties = {
  border: "1px solid #9ca3af",
  padding: "8px 10px",
  textAlign: "left",
  background: "#f3f4f6",
  fontWeight: 600,
  fontSize: 12,
};
const tdStyle: React.CSSProperties = {
  border: "1px solid #9ca3af",
  padding: "8px 10px",
  textAlign: "left",
  verticalAlign: "top",
};
