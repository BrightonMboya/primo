import { createFileRoute } from '@tanstack/react-router'
import { auth } from '~/server/auth'

/** Better Auth endpoints: /api/auth/sign-in/username, /api/auth/sign-out, … */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
