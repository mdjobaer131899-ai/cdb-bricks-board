// WhatsApp link helper — generates a wa.me URL for sharing via WhatsApp.
// If phone is empty, opens a generic share dialog text.
export function normalizeBdPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^0-9]/g, "");
  if (!p) return null;
  if (p.startsWith("880")) return p;
  if (p.startsWith("0")) return "880" + p.slice(1);
  if (p.length === 10) return "880" + p;
  return p;
}

export function waLink(phone: string | null | undefined, text: string): string {
  const num = normalizeBdPhone(phone);
  const t = encodeURIComponent(text);
  return num ? `https://wa.me/${num}?text=${t}` : `https://wa.me/?text=${t}`;
}

export function openWhatsApp(phone: string | null | undefined, text: string) {
  window.open(waLink(phone, text), "_blank", "noopener,noreferrer");
}
