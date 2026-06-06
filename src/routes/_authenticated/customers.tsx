import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersLayout,
});

function CustomersLayout() {
  return <Outlet />;
}
