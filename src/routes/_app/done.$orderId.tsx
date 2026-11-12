import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { orderQuery, useFound } from '~/lib/queries'
import { rwf } from '~/lib/format'
import { Icon } from '~/components/ui'

export const Route = createFileRoute('/_app/done/$orderId')({
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(orderQuery(Number(params.orderId))))) throw notFound()
  },
  component: Done,
})

function Done() {
  const { orderId } = Route.useParams()
  const { order, items } = useFound(orderQuery(Number(orderId)))
  const isSale = order.kind === 'sale'
  const first = items[0]

  return (
    <div className="page no-tabs" style={{ paddingBottom: 200 }}>
      <div className="done">
        <div className="tick green"><Icon name="check" size={30} /></div>
        <h1 className="title">{isSale ? 'Sale recorded' : 'Sent out for delivery'}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {items.length === 1 ? `${first.name} · ${first.color} ${first.size}` : `${items.length} items`}
          <br />
          {isSale ? `${rwf(order.total)} · ${order.payment === 'momo' ? 'MoMo' : 'Cash'}` : order.customerName}
        </p>
      </div>

      <div className="stack mt32">
        {items.map((i) => (
          <div key={i.id} className="stat">
            <span>Left in {i.color} {i.size}</span>
            <strong className={i.qtyLeft === 0 ? 'red' : ''}>{i.qtyLeft === 0 ? '0 · Sold out' : i.qtyLeft}</strong>
          </div>
        ))}
      </div>

      <div className="actions">
        <div>
          <Link to="/scan" className="btn primary">Scan next item</Link>
          <Link to="/" className="btn">Done</Link>
        </div>
      </div>
    </div>
  )
}
