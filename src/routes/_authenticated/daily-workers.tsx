import { createFileRoute } from "@tanstack/react-router";
import { StaffLedgerPage } from "@/components/staff-ledger-page";

export const Route = createFileRoute("/_authenticated/daily-workers")({
  head: () => ({
    meta: [
      { title: "ডেলি শ্রমিক — CDB Bricks" },
      { name: "description", content: "ডেলি শ্রমিকদের দৈনিক হাজিরা, মজুরি, পরিশোধ ও বাকির হিসাব।" },
      { property: "og:title", content: "ডেলি শ্রমিক — CDB Bricks" },
      { property: "og:description", content: "দৈনিক হাজিরা ও মজুরির হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaffLedgerPage mode="daily" />,
});
