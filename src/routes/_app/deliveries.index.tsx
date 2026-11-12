import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { deliveriesQuery } from '~/lib/queries'
import { rwf, when } from '~/lib/format'
import { Icon, Photo, TabBar } from '~/components/ui'

export const Route = createFileRoute('/_app/deliveries/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(deliveriesQuery),
  component: Deliveries,
})

function Deliveries() {
  const { data: rows } = useSuspenseQuery(deliveriesQuery)
  const { user } = Route.useRouteContext()
  return (
    <div className="page">
      <div className="topbar"><span className="title">Out for delivery</span></div>
      {rows.length === 0 && <p className="muted mt24">Nothing is out right now.</p>}
      <div className="list mt16">
        {rows.map(({ order, items }) => (
          <Link key={order.id} to="/deliveries/$id" params={{ id: String(order.id) }} className="list-row">
            <Photo src={items[0]?.photo} />
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{order.customerName}</div>
              <div className="small muted">
                {items.length === 1 ? `${items[0].name} ${items[0].color} ${items[0].size}` : `${items.length} items`}
              </div>
              <div className="tiny faint">Left {when(order.createdAt)} · {order.payment ? 'Paid' : `Collect ${rwf(items.reduce((s, i) => s + i.price, 0))}`}</div>
            </div>
            <Icon name="chev" size={18} className="chev" />
          </Link>
        ))}
      </div>
      <p className="small muted mt24">When an item comes back to the shop, just scan it and choose Return.</p>
      <TabBar user={user} />
    </div>
  )
}
