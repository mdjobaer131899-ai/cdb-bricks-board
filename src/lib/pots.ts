import { supabase } from "@/integrations/supabase/client";

/**
 * Drying beds (পট): each mill's beds numbered 1, 2, 3 …, and one count per bed per day.
 * The database keeps the mill-day total as one kacha production line (trigger on pot_counts,
 * migration drying_pots), so saving a count here is all a page or the assistant has to do.
 * Photos go to the private bucket pot-photos, made smaller first so a field's worth of beds
 * does not fill the storage.
 */
export type Pot = { id: string; mill_id: string; pot_no: number; active: boolean };
export type PotCount = {
  id: string;
  pot_id: string;
  count_date: string;
  quantity: number;
  photo_path: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};
export type PotDay = { mill_id: string; count_date: string; kacha_entry_id: string };

const db = supabase as any;

export async function fetchPots(): Promise<Pot[]> {
  const { data, error } = await db.from("drying_pots").select("id, mill_id, pot_no, active").order("pot_no");
  if (error) throw error;
  return (data ?? []) as Pot[];
}

export async function fetchPotCounts(date: string): Promise<PotCount[]> {
  const { data, error } = await db.from("pot_counts").select("*").eq("count_date", date);
  if (error) throw error;
  return (data ?? []) as PotCount[];
}

export async function fetchPotDays(date: string): Promise<PotDay[]> {
  const { data, error } = await db.from("pot_days").select("*").eq("count_date", date);
  if (error) throw error;
  return (data ?? []) as PotDay[];
}

/** a phone photo made smaller (longest side 2048 px, JPEG) before it is stored */
export async function shrinkPhoto(file: File, maxSide = 2048, quality = 0.82): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function photoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("pot-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** saves (or replaces) one bed's count for a day; returns the row id */
export async function savePotCount(p: {
  potId: string;
  millId: string;
  potNo: number;
  date: string;
  quantity: number;
  note?: string | null;
  photo?: File | null;
  keepPhoto?: string | null;
}, uid: string): Promise<string> {
  const qty = Math.round(Number(p.quantity) || 0);
  if (!(qty > 0)) throw new Error("কত ইট, লিখুন");
  if (qty > 20000) throw new Error("এক পটে এত ইট হয় না, সংখ্যাটা দেখুন");
  let photo_path = p.keepPhoto ?? null;
  if (p.photo) {
    const blob = await shrinkPhoto(p.photo);
    const path = `${p.millId}/${p.date}/pot-${p.potNo}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("pot-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`ছবি রাখা যায়নি: ${upErr.message}`);
    photo_path = path;
  }
  const { data, error } = await db.from("pot_counts")
    .upsert({ pot_id: p.potId, count_date: p.date, quantity: qty, note: p.note?.trim() || null, photo_path, created_by: uid }, { onConflict: "pot_id,count_date" })
    .select("id").single();
  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      throw new Error("এই পটের সংখ্যা অন্য কেউ লিখেছেন বা অনেক আগে লেখা; বদলাতে অ্যাডমিন লাগবে।");
    }
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

export async function deletePotCount(id: string): Promise<void> {
  const { error } = await db.from("pot_counts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** admin: a mill has beds 1..n (extra beds are switched off, never deleted, so counts stay) */
export async function setMillPots(millId: string, n: number, existing: Pot[]): Promise<void> {
  const want = Math.max(0, Math.min(500, Math.round(n)));
  const mine = existing.filter((p) => p.mill_id === millId);
  const have = new Set(mine.map((p) => p.pot_no));
  const add = [];
  for (let i = 1; i <= want; i++) if (!have.has(i)) add.push({ mill_id: millId, pot_no: i, active: true });
  if (add.length) {
    const { error } = await db.from("drying_pots").insert(add);
    if (error) throw new Error(error.message);
  }
  const on = mine.filter((p) => p.pot_no <= want && !p.active).map((p) => p.id);
  const off = mine.filter((p) => p.pot_no > want && p.active).map((p) => p.id);
  if (on.length) {
    const { error } = await db.from("drying_pots").update({ active: true }).in("id", on);
    if (error) throw new Error(error.message);
  }
  if (off.length) {
    const { error } = await db.from("drying_pots").update({ active: false }).in("id", off);
    if (error) throw new Error(error.message);
  }
}

/** asks the database for the mill-day line again (after an admin deleted it) */
export async function resyncPotDay(millId: string, date: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("sync_pot_day", { _mill: millId, _date: date });
  if (error) throw new Error(error.message);
}
