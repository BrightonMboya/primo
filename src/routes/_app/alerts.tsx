import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { alertsQuery } from '~/lib/queries'
import { Photo, TabBar, TopBar } from '~/components/ui'

export const Route = createFileRoute('/_app/alerts')({
  loader: ({ context }) => context.queryClient.ensureQueryData(alertsQuery),
  component: Alerts,
})

function Alerts() {
  const { data: rows } = useSuspenseQuery(alertsQuery)
  const { user } = Route.useRouteContext()
  const soldOut = rows.filter((r) => r.qty === 0)
  const low = rows.filter((r) => r.qty > 0)
  return (
    <div className="page">
      <TopBar title="Running low" back="/" />
      {rows.length === 0 && <div className="notice green mt24">Everything is well stocked.</div>}
      {[{ title: 'Sold out', rows: soldOut }, { title: 'Low', rows: low }].map((g) =>
        g.rows.length === 0 ? null : (
          <div key={g.title}>
            <p className="section-label">{g.title} · {g.rows.length}</p>
            <div className="list">
              {g.rows.map((r) => (
                <Link key={r.sku} to="/stock/$id" params={{ id: String(r.productId) }} className="list-row">
                  <Photo src={r.photo} />
                  <div className="grow">
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="small muted">{r.color} · {r.size}</div>
                  </div>
                  <span className={`value ${r.qty === 0 ? 'faint' : 'red'}`}>{r.qty}</span>
                </Link>
              ))}
            </div>
          </div>
        ),
      )}
      <TabBar user={user} />
    </div>
  )
}
