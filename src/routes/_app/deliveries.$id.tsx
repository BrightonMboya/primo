import { useState } from 'react'
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { finishDelivery } from '~/server/app.functions'
import { deliveriesQuery, orderQuery, useFound, useRefresh } from '~/lib/queries'
import { rwf, when } from '~/lib/format'
import type { Payment } from '~/lib/types'
import { Choice, Photo, TopBar, useAction } from '~/components/ui'

export const Route = createFileRoute('/_app/deliveries/$id')({
  validateSearch: z.object({ back: z.number().optional() }),
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(orderQuery(Number(params.id))))) throw notFound()
  },
  component: DeliveryDetail,
})

function DeliveryDetail() {
  const { id } = Route.useParams()
  const { order, items } = useFound(orderQuery(Number(id)))
  const { back } = Route.useSearch()
  const router = useRouter()
  const refresh = useRefresh()
  const pending = items.filter((i) => i.status === 'out')
  const [choice, setChoice] = useState<Record<number, 'kept' | 'returned'>>(() =>
    Object.fromEntries(pending.map((i) => [i.id, i.id === back ? 'returned' : 'kept'])),
  )
  const [payment, setPayment] = useState<Payment>(order.payment ?? 'cash')
  const [momoRef, setMomoRef] = useState('')
  const { busy, error, run } = useAction()

  const kept = pending.filter((i) => choice[i.id] === 'kept')
  const returned = pending.filter((i) => choice[i.id] === 'returned')
  const keptTotal = kept.reduce((s, i) => s + i.price, 0)
  const owed = order.payment ? returned.reduce((s, i) => s + i.price, 0) : 0

  async function save() {
    const res = await run(() =>
      finishDelivery({
        data: {
          orderId: order.id,
          kept: kept.map((i) => i.id),
          returned: returned.map((i) => i.id),
          payment: order.payment ? null : kept.length ? payment : null,
          momoRef: payment === 'momo' ? momoRef : undefined,
        },
      }),
    )
    if (!res) return
    await refresh(deliveriesQuery.queryKey)
    router.navigate({ to: '/deliveries', replace: true })
  }

  if (order.status !== 'out') {
    return (
      <div className="page no-tabs">
        <TopBar title="Delivery" back="/deliveries" />
        <p className="muted mt24">This delivery is closed ({order.status}).</p>
      </div>
    )
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 160 }}>
      <TopBar title="Delivery" back="/deliveries" />
      <div className="mt16">
        <h1 className="title">{order.customerName}</h1>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          <a href={`tel:${order.customerPhone}`} style={{ textDecoration: 'underline' }}>{order.customerPhone}</a> · left {when(order.createdAt)}
        </p>
        <p className="muted small" style={{ margin: '4px 0 0' }}>{order.payment ? `Paid up front by ${order.payment === 'momo' ? 'MoMo' : 'cash'}` : 'Pay on delivery'}</p>
      </div>

      <p className="section-label">What did they keep?</p>
      <div className="stack" style={{ gap: 16 }}>
        {pending.map((i) => (
          <div key={i.id} className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--surface)' }}>
            <div className="row">
              <Photo src={i.photo} />
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{i.name}</div>
                <div className="small muted">{i.color} · {i.size} · {rwf(i.price)}</div>
              </div>
            </div>
            <div className="segment" style={{ background: '#fff' }}>
              <button className={choice[i.id] === 'kept' ? 'on keep' : ''} onClick={() => setChoice({ ...choice, [i.id]: 'kept' })}>Kept</button>
              <button className={choice[i.id] === 'returned' ? 'on back' : ''} onClick={() => setChoice({ ...choice, [i.id]: 'returned' })}>Brought back</button>
            </div>
          </div>
        ))}
      </div>

      {!order.payment && kept.length > 0 && (
        <>
          <p className="section-label">Rider collected {rwf(keptTotal)} by</p>
          <div className="stack">
            <Choice on={payment === 'cash'} onClick={() => setPayment('cash')}>Cash</Choice>
            <Choice on={payment === 'momo'} onClick={() => setPayment('momo')}>MoMo</Choice>
            {payment === 'momo' && <input className="input" placeholder="MoMo transaction ID (optional)" value={momoRef} onChange={(e) => setMomoRef(e.target.value)} />}
          </div>
        </>
      )}
      {returned.length > 0 && <p className="small muted mt16">Brought-back items go back into stock when you save.</p>}
      {owed > 0 && <div className="notice red mt16">They paid up front. Send back {rwf(owed)} for the returned items.</div>}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <div>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : kept.length === 0 ? 'Everything came back' : `Save · ${kept.length} kept, ${returned.length} back`}
          </button>
        </div>
      </div>
    </div>
  )
}
