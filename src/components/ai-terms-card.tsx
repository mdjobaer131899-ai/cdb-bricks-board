import { useQuery, useMutation } from "@tanstack/react-query";
import { GraduationCap, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTerm, fetchTerms, type AiTerm } from "@/lib/ai-terms";
import { moneyHead } from "@/lib/money-heads";
import { bn } from "@/lib/format";
import { forgetExtras } from "@/services/gemini";

/**
 * সহকারীর শেখা শব্দ (settings): the phrases the assistant learned for money heads, from a head
 * changed on a card or taught in the chat. An admin deletes a wrong one; the next message no
 * longer sees it.
 */
export function AiTermsCard({ canDelete }: { canDelete: boolean }) {
  const termsQ = useQuery({ queryKey: ["ai-terms"], queryFn: () => fetchTerms(300) });
  // a successful mutation refreshes every query (router.tsx)
  const del = useMutation({
    mutationFn: async (t: AiTerm) => { await deleteTerm(t.id); forgetExtras(); },
    onSuccess: () => toast.success("শব্দটা মুছে দেওয়া হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });
  const list = termsQ.data ?? [];

  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="text-[15px] font-semibold leading-tight">সহকারী যা শিখেছে</div>
          <div className="text-xs text-muted-foreground">
            কার্ডে "খাত" চেপে ঠিক খাত বেছে দিলে, বা সহকারীকে বললে ("এখন থেকে পানি মানে আনুষাঙ্গিক খরচ"), শব্দটা এখানে জমা থাকে। পরের বার সেই কথা ওই খাতেই যায়।
          </div>
        </div>
      </div>
      {termsQ.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> আনছি…</div>
      ) : !list.length ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">এখনো কিছু শেখানো হয়নি।</div>
      ) : (
        <ul className="divide-y">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">"{t.phrase}"</div>
                <div className="truncate text-xs text-muted-foreground">
                  {moneyHead(t.head)?.label ?? t.head}
                  {t.person ? ` · ${t.person}` : ""}
                  {t.item ? ` · ${t.item}` : ""}
                  {` · ${t.source === "teach" ? "শেখানো" : "ঠিক করা"}`}
                  {t.uses > 1 ? ` · ${bn(t.uses)} বার` : ""}
                </div>
              </div>
              {canDelete && (
                <button type="button" aria-label={`"${t.phrase}" মুছুন`} disabled={del.isPending}
                  onClick={() => del.mutate(t)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
