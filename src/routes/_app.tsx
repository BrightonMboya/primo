import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

/** Everything inside requires a signed-in user. Data is protected again on the server. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: '/login', search: { next: location.href } })
    return { user: context.user }
  },
  component: Outlet,
})
