import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

/** Admin pages. The server functions they call check the role again. */
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: ({ context }) => {
    if (context.user?.role !== 'admin') throw redirect({ to: '/' })
  },
  component: Outlet,
})
