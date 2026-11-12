import { createFileRoute, redirect } from "@tanstack/react-router";

/** ঋণ is a tab of the মালিক ও ঋণ page now; old links land there */
export const Route = createFileRoute("/_authenticated/loans")({
  beforeLoad: () => {
    throw redirect({ to: "/owners", search: { tab: "loans" } as never, replace: true });
  },
});
