import { notFound } from '@tanstack/react-router'
import { QueryClient, queryOptions, useQueryClient, useSuspenseQuery, type QueryKey, type UseSuspenseQueryOptions } from '@tanstack/react-query'
import { getMe } from '~/server/auth.functions'
import {
  getAlerts,
  getDeliveries,
  getItem,
  getOrderDetail,
  getProduct,
  getProducts,
  getReport,
  getReturnCandidates,
  getUsers,
  homeSummary,
} from '~/server/app.functions'

/**
 * All screen data goes through React Query:
 * - going back to a screen shows what was loaded before instantly, then refreshes in the background
 * - data refreshes on its own every few seconds while a screen is open, and whenever the app
 *   comes back to the foreground, so staff never need to pull-to-refresh
 * - after any sale/return/stock change, everything is marked out of date and reloads
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  })
}

/** How often open screens re-check the server. Only while the app is on screen. */
const LIVE = 20_000

export const meQuery = queryOptions({ queryKey: ['me'], queryFn: () => getMe(), staleTime: 5 * 60_000 })

export const homeQuery = queryOptions({ queryKey: ['home'], queryFn: () => homeSummary(), refetchInterval: LIVE })
export const alertsQuery = queryOptions({ queryKey: ['alerts'], queryFn: () => getAlerts(), refetchInterval: LIVE })

export const itemQuery = (sku: string) =>
  queryOptions({ queryKey: ['item', sku.toUpperCase()], queryFn: () => getItem({ data: { sku } }), refetchInterval: LIVE })

export const productsQuery = (q: string) =>
  queryOptions({ queryKey: ['products', q], queryFn: () => getProducts({ data: { q } }), refetchInterval: LIVE })

export const productQuery = (id: number) =>
  queryOptions({ queryKey: ['product', id], queryFn: () => getProduct({ data: { id } }), refetchInterval: LIVE })

export const deliveriesQuery = queryOptions({ queryKey: ['deliveries'], queryFn: () => getDeliveries(), refetchInterval: LIVE })

export const orderQuery = (id: number) => queryOptions({ queryKey: ['order', id], queryFn: () => getOrderDetail({ data: { id } }) })

export const returnsQuery = (sku: string) =>
  queryOptions({ queryKey: ['returns', sku.toUpperCase()], queryFn: () => getReturnCandidates({ data: { sku } }) })

export const reportQuery = (range: 'today' | 'week' | 'month') =>
  queryOptions({ queryKey: ['report', range], queryFn: () => getReport({ data: { range } }), refetchInterval: LIVE })

export const usersQuery = queryOptions({ queryKey: ['users'], queryFn: () => getUsers() })

const notMe = (q: { queryKey: QueryKey }) => q.queryKey[0] !== 'me'

/**
 * Call after anything that changes data. Marks every screen out of date (they reload in the
 * background), and waits for `waitFor` to be fresh so the next screen opens with current data.
 */
export function useRefresh() {
  const qc = useQueryClient()
  return async (...waitFor: QueryKey[]) => {
    const fresh = Promise.all(waitFor.map((queryKey) => qc.refetchQueries({ queryKey, exact: true, type: 'all' })))
    void qc.invalidateQueries({ predicate: notMe })
    await fresh
  }
}

/**
 * For detail screens: the data, or the "Not found" screen if it has gone
 * (e.g. the item was deleted on another phone while this one was open).
 */
export function useFound<T>(options: UseSuspenseQueryOptions<T, Error, T, any>): NonNullable<T> {
  const { data } = useSuspenseQuery(options)
  if (data == null) throw notFound()
  return data as NonNullable<T>
}
