import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { makeQueryClient } from './lib/queries'

export function getRouter() {
  const queryClient = makeQueryClient()
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // Start loading a screen's data as soon as a finger touches its link.
    defaultPreload: 'intent',
    // React Query decides what is fresh; the router just asks it.
    defaultPreloadStaleTime: 0,
    context: { queryClient, user: null },
  })
  // Wraps the app in QueryClientProvider and passes server-loaded data to the browser.
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
