import { createFileRoute, redirect } from "@tanstack/react-router";

/** One সেটিংস page (/preferences) holds the brick prices and backup too; old links land there */
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/preferences", replace: true });
  },
});
