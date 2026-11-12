import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { productsQuery } from '~/lib/queries'
import { rwf } from '~/lib/format'
import { Icon, Photo, TabBar } from '~/components/ui'

export const Route = createFileRoute('/_app/stock/')({
  validateSearch: z.object({ q: z.string().optional() }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(productsQuery(deps.q)),
  component: StockList,
})

function StockList() {
  const { q } = Route.useSearch()
  const { data: rows } = useSuspenseQuery(productsQuery(q ?? ''))
  const { user } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="page">
      <div className="topbar">
        <span className="title">Stock</span>
        {user.role === 'admin' && <Link to="/admin/new" className="btn small">+ New item</Link>}
      </div>
      <input
        className="input mt16"
        type="search"
        placeholder="Search name, brand or code"
        defaultValue={q ?? ''}
        onChange={(e) => navigate({ search: { q: e.target.value || undefined }, replace: true })}
      />
      <div className="list mt8">
        {rows.length === 0 && <p className="muted mt16">No items{q ? ' match that search' : ' yet'}.</p>}
        {rows.map((p) => (
          <Link key={p.id} to="/stock/$id" params={{ id: String(p.id) }} className="list-row">
            <Photo src={p.photo} />
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div className="small muted">
                {rwf(p.price)}
                {p.outCount > 0 && <span className="red"> · {p.outCount} sold out</span>}
                {p.low > 0 && <span className="red"> · {p.low} low</span>}
              </div>
            </div>
            <span className="value">{p.total}</span>
            <Icon name="chev" size={18} className="chev" />
          </Link>
        ))}
      </div>
      <TabBar user={user} />
    </div>
  )
}
