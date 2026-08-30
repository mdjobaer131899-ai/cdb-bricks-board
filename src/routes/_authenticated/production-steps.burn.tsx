import { createFileRoute } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { KachaStepPage } from "@/components/kacha-step-page";

export const Route = createFileRoute("/_authenticated/production-steps/burn")({
  head: () => ({
    meta: [
      { title: "ইট পোড়ানোর হিসাব — CDB Bricks" },
      { name: "description", content: "ভাটায় ইট পোড়ানোর ধাপে নষ্ট ইট ও পোড়ানোর মজুরির হিসাব।" },
      { property: "og:title", content: "ইট পোড়ানোর হিসাব — CDB Bricks" },
      { property: "og:description", content: "পোড়ানোর ধাপে নষ্ট ইট ও মজুরির এন্ট্রি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <KachaStepPage
      step="damage"
      title="ইট পোড়ানোর হিসাব"
      subtitle="ধাপ ৩ — পোড়ানোর সময় নষ্ট ইট ও পোড়ানোর মজুরির এন্ট্রি"
      icon={Flame}
      totalLabel="মোট নষ্ট ইট"
      qtyLabel="নষ্ট ইট (পিস)"
    />
  ),
});
