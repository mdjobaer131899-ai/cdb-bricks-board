import { createFileRoute, redirect } from "@tanstack/react-router";

/** খরচের খাতা now lives in the cash book as its "খাত অনুযায়ী" view; old links land there */
export const Route = createFileRoute("/_authenticated/ledger")({
  validateSearch: (s: Record<string, unknown>): { h?: string; p?: string } => ({
    ...(typeof s.h === "string" && s.h ? { h: s.h } : {}),
    ...(typeof s.p === "string" && s.p ? { p: s.p } : {}),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/cash-book", search: { view: "heads", ...search } as never, replace: true });
  },
});
