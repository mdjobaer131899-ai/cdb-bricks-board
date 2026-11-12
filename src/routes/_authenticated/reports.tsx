import { createFileRoute, redirect } from "@tanstack/react-router";

/** রিপোর্ট is a tab of লাভ-ক্ষতি now; old links (also ?r=<report>) land there */
export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (s: Record<string, unknown>): { r?: string } => (typeof s.r === "string" && s.r ? { r: s.r } : {}),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/income-expense", search: { tab: "reports", ...search } as never, replace: true });
  },
});
