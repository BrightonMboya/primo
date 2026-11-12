import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { reportQuery } from '~/lib/queries'
import { rwf, when } from '~/lib/format'
import { TabBar } from '~/components/ui'

export const Route = createFileRoute('/_app/admin/')({
  validateSearch: z.object({ range: z.enum(['today', 'week', 'month']).default('today') }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(reportQuery(deps.range)),
  component: Sales,
})

const STATUS: Record<string, string> = { completed: 'Paid', out: 'Out for delivery', returned: 'All returned' }

function Sales() {
  const { range } = Route.useSearch()
  const { data: r } = useSuspenseQuery(reportQuery(range))
  const { user } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="page">
      <div className="topbar">
        <span className="title">Sales</span>
        <Link to="/admin/users" className="small">Staff</Link>
      </div>
      <div className="segment mt16">
        {(['today', 'week', 'month'] as const).map((k) => (
          <button key={k} className={range === k ? 'on' : ''} onClick={() => navigate({ search: { range: k } })}>
            {k === 'today' ? 'Today' : k === 'week' ? '7 days' : '30 days'}
          </button>
        ))}
      </div>

      <div className="mt24">
        <div className="muted small">Money in (after refunds)</div>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em' }}>{rwf(r.net)}</div>
        <div className="small muted">{r.itemsSold} items · {r.orders} orders</div>
      </div>

      <div className="list mt16">
        <div className="list-row" style={{ cursor: 'default' }}><span className="grow">Cash</span><span className="value">{rwf(r.cash)}</span></div>
        <div className="list-row" style={{ cursor: 'default' }}><span className="grow">MoMo</span><span className="value">{rwf(r.momo)}</span></div>
        <div className="list-row" style={{ cursor: 'default' }}><span className="grow">Refunded</span><span className="value red">{r.refunded ? `−${rwf(r.refunded)}` : rwf(0)}</span></div>
      </div>

      {r.top.length > 0 && (
        <>
          <p className="section-label">Best sellers</p>
          <div className="list">
            {r.top.map((t) => (
              <div key={t.name} className="list-row" style={{ cursor: 'default' }}>
                <span className="grow">{t.name}</span>
                <span className="muted small" style={{ width: 60, textAlign: 'right' }}>{t.n} sold</span>
                <span className="value" style={{ width: 90, textAlign: 'right' }}>{rwf(t.revenue)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="section-label">Stock on hand</p>
      <div className="list">
        <div className="list-row" style={{ cursor: 'default' }}><span className="grow">Pieces</span><span className="value">{r.stockValue.pieces}</span></div>
        <div className="list-row" style={{ cursor: 'default' }}><span className="grow">Value at selling price</span><span className="value">{rwf(r.stockValue.retail)}</span></div>
        <div className="list-row" style={{ cursor: 'default' }}><span className="grow">Value at cost</span><span className="value">{rwf(r.stockValue.cost)}</span></div>
      </div>

      <p className="section-label">Orders</p>
      {r.recent.length === 0 && <p className="small muted">No orders in this period.</p>}
      <div className="list">
        {r.recent.map((o) => (
          <div key={o.id} className="list-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{o.customerName} <span className="small muted">· {o.customerPhone}</span></div>
              <div className="small muted">
                {o.items} item{o.items > 1 ? 's' : ''} · {o.kind === 'delivery' ? 'Delivery' : o.channel === 'instagram' ? 'Instagram' : 'Shop'} ·{' '}
                {o.payment ? (o.payment === 'momo' ? 'MoMo' : 'Cash') : 'Unpaid'} · {STATUS[o.status]} · {o.createdByName}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="value">{o.status === 'out' ? '—' : rwf(o.total)}</div>
              <div className="tiny faint">{when(o.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      <TabBar user={user} />
    </div>
  )
}
