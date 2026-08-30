import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { KachaStepPage } from "@/components/kacha-step-page";

export const Route = createFileRoute("/_authenticated/production-steps/kacha")({
  head: () => ({
    meta: [
      { title: "কাঁচা ইটের হিসাব — CDB Bricks" },
      { name: "description", content: "সরদারভিত্তিক দৈনিক কাঁচা ইট (ছাঁচা) উৎপাদনের এন্ট্রি ও মজুরির হিসাব।" },
      { property: "og:title", content: "কাঁচা ইটের হিসাব — CDB Bricks" },
      { property: "og:description", content: "সরদারভিত্তিক দৈনিক কাঁচা ইট উৎপাদনের এন্ট্রি ও মজুরি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <KachaStepPage
      step="production"
      title="কাঁচা ইটের হিসাব"
      subtitle="ধাপ ১ — সরদারভিত্তিক ছাঁচা কাঁচা ইটের দৈনিক এন্ট্রি"
      icon={Boxes}
      totalLabel="মোট ছাঁচা কাঁচা ইট"
    />
  ),
});
