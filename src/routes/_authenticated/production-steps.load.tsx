import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine } from "lucide-react";
import { KachaStepPage } from "@/components/kacha-step-page";

export const Route = createFileRoute("/_authenticated/production-steps/load")({
  head: () => ({
    meta: [
      { title: "কাঁচা ইট ঢোকানো — CDB Bricks" },
      { name: "description", content: "ভাটায় কাঁচা ইট ঢোকানো (লোড) এর দৈনিক এন্ট্রি ও মজুরির হিসাব।" },
      { property: "og:title", content: "কাঁচা ইট ঢোকানো — CDB Bricks" },
      { property: "og:description", content: "ভাটায় কাঁচা ইট লোড করার এন্ট্রি ও মজুরি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <KachaStepPage
      step="load"
      title="কাঁচা ইট ঢোকানো (লোড)"
      subtitle="ধাপ ২ — ভাটায় কাঁচা ইট লোড করার হিসাব"
      icon={ArrowDownToLine}
      totalLabel="মোট লোড"
    />
  ),
});
