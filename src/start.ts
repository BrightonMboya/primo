import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

/** TanStack's own protection for server functions (checks Sec-Fetch-Site / Origin). */
const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Same-origin check for every other write (e.g. /api/auth). Cookies are SameSite=Lax already;
 * this also blocks POSTs coming from other sites or sibling subdomains.
 */
const sameOrigin = createMiddleware().server(async ({ next, request }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin')
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    if (origin && host && new URL(origin).host !== host) {
      return new Response('Cross-site request blocked', { status: 403 })
    }
  }
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf, sameOrigin],
}))
