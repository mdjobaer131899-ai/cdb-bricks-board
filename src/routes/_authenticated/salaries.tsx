import { createFileRoute } from "@tanstack/react-router";
import { StaffLedgerPage } from "@/components/staff-ledger-page";

export const Route = createFileRoute("/_authenticated/salaries")({
  head: () => ({
    meta: [
      { title: "মেস্তুরি ও ম্যানেজার বেতন — CDB Bricks" },
      { name: "description", content: "পুড়াই মেস্তুরি ও ম্যানেজারদের মাসিক বেতন, পরিশোধ ও বাকি।" },
      { property: "og:title", content: "মেস্তুরি ও ম্যানেজার বেতন — CDB Bricks" },
      { property: "og:description", content: "মাসিক বেতনের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaffLedgerPage mode="salary" />,
});
