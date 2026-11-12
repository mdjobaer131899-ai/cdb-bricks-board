import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Customer money is in the cash book under the head "ইট বিক্রির টাকা" (add, change, delete
 * there); who owes what is on পাওনা-দেনা and each customer's page. Old links land there.
 */
export const Route = createFileRoute("/_authenticated/collections/")({
  beforeLoad: () => {
    throw redirect({ to: "/cash-book", search: { head: "sale" } as never, replace: true });
  },
});
