import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/cash-book')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/cash-book"!</div>
}
