import { supabase } from "@/integrations/supabase/client";
import { MONEY_HEADS, type MoneyKey } from "@/lib/money-heads";

/**
 * Words the assistant has learned for money heads (table ai_terms, migration ai_terms): a head
 * changed on a card ("খাত বদলান") or taught in the chat ("এখন থেকে পানি মানে আনুষাঙ্গিক").
 * gemini.ts gives them to the model with every message and, when the model falls back to
 * আনুষাঙ্গিক, moves a line whose words match a learned phrase to that phrase's head.
 * Settings (সহকারীর শেখা শব্দ, components/ai-terms-card.tsx) lists them; an admin deletes.
 */
export type AiTerm = {
  id: string;
  phrase: string;
  phrase_key: string;
  head: MoneyKey;
  person: string | null;
  item: string | null;
  source: "fix" | "teach";
  uses: number;
  updated_at: string;
};

/** the key a phrase is stored under: NFC, lower case, no punctuation, single spaces */
export const termKey = (s: string) =>
  s.normalize("NFC").toLowerCase().replace(/[।,.!?;:'"“”‘’()[\]{}\-–—/\\]/g, " ").replace(/\s+/g, " ").trim();

// words that say how much, when or how it was paid, not what for
const STOP = new Set([
  "টাকা", "টাকার", "টাকায়", "৳", "টা", "টি", "tk", "taka",
  "দিলাম", "দিছি", "দিসি", "দিলুম", "দিয়েছি", "দিয়েছি", "দিলো", "দিল", "দেওয়া", "দেয়া", "দিতে", "দিবো", "পরিশোধ", "শোধ",
  "নিলাম", "নিছি", "নিসি", "পেলাম", "পাইছি", "পাইলাম", "জমা", "আদায়", "খরচ", "বাবদ", "বাবত", "জন্য", "এর", "কে", "কেও", "থেকে",
  "আজ", "আজকে", "আইজ", "গতকাল", "কাল", "কাইল", "পরশু", "তারিখ", "তারিখে",
  "বিকাশে", "বিকাশ", "নগদে", "ক্যাশে", "ক্যাশ", "হাতে", "ব্যাংকে", "ব্যাংক",
  "হাজার", "শ", "শো", "শত", "লাখ", "সাড়ে", "দেড়", "আড়াই", "পৌনে", "এবং", "আর", "ও",
  "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ", "বিশ", "ত্রিশ", "চল্লিশ", "পঞ্চাশ", "ষাট", "সত্তর", "আশি", "নব্বই",
]);

/** the words of a said line that name the thing ("পানির বোতল ৩০০ টাকা দিলাম" → "পানির বোতল") */
export function phraseOf(said: string): string {
  const words = termKey(said.replace(/[0-9০-৯][0-9০-৯,.]*/g, " ")).split(" ").filter((w) => w && !STOP.has(w));
  return words.join(" ").slice(0, 60).trim();
}

/** the learned term whose phrase is in these words, the longest first (at least 3 letters) */
export function termFor(terms: AiTerm[], text: string): AiTerm | null {
  const k = termKey(text);
  if (!k) return null;
  let best: AiTerm | null = null;
  for (const t of terms) {
    if (t.phrase_key.length < 3 || !k.includes(t.phrase_key)) continue;
    if (!best || t.phrase_key.length > best.phrase_key.length) best = t;
  }
  return best;
}

export async function fetchTerms(limit = 150): Promise<AiTerm[]> {
  const { data, error } = await supabase.from("ai_terms")
    .select("id, phrase, phrase_key, head, person, item, source, uses, updated_at")
    .order("uses", { ascending: false }).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).filter((t) => MONEY_HEADS.some((h) => h.key === t.head)) as AiTerm[];
}

/** keep a phrase and its head (a phrase already there takes the new head and counts one more use) */
export async function learnTerm(t: { phrase: string; head: MoneyKey; person?: string | null; item?: string | null; source: "fix" | "teach" }): Promise<{ id: string } | null> {
  const phrase = t.phrase.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 80);
  const key = termKey(phrase).slice(0, 80);
  if (!key) return null;
  const row = { head: t.head, person: t.person?.trim() || null, item: t.item?.trim() || null, source: t.source };
  const { data: old, error: e1 } = await supabase.from("ai_terms").select("id, uses").eq("phrase_key", key).maybeSingle();
  if (e1) throw e1;
  if (old) {
    const { error } = await supabase.from("ai_terms").update({ ...row, phrase, uses: (old.uses ?? 0) + 1 }).eq("id", old.id);
    if (error) throw error;
    return { id: old.id };
  }
  const { data, error } = await supabase.from("ai_terms").insert({ ...row, phrase, phrase_key: key }).select("id").single();
  if (error) throw error;
  return { id: data.id };
}

export async function deleteTerm(id: string) {
  const { error } = await supabase.from("ai_terms").delete().eq("id", id);
  if (error) throw error;
}
