import { useState } from 'react'
import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { doReturn } from '~/server/app.functions'
import { itemQuery, returnsQuery, useFound, useRefresh } from '~/lib/queries'
import { cart } from '~/lib/cart'
import { rwf, when } from '~/lib/format'
import type { Payment } from '~/lib/types'
import { Choice, Photo, TopBar, useAction } from '~/components/ui'

export const Route = createFileRoute('/_app/return/$sku')({
  loader: async ({ context, params }) => {
    const [item] = await Promise.all([
      context.queryClient.ensureQueryData(itemQuery(params.sku)),
      context.queryClient.ensureQueryData(returnsQuery(params.sku)),
    ])
    if (!item) throw notFound()
  },
  component: ReturnPage,
})

type Mode = 'delivery' | 'refund' | 'exchange'

function ReturnPage() {
  const { sku } = Route.useParams()
  const item = useFound(itemQuery(sku))
  const { data: candidates } = useSuspenseQuery(returnsQuery(sku))
  const router = useRouter()
  const refresh = useRefresh()
  const { product, variant } = item
  const [pickedId, setPickedId] = useState<number | null>(candidates[0]?.itemId ?? null)
  const picked = candidates.find((c) => c.itemId === pickedId) ?? null
  const isOut = picked?.status === 'out'
  const [mode, setMode] = useState<Mode>(isOut ? 'delivery' : 'exchange')
  const [refundMethod, setRefundMethod] = useState<Payment>('cash')
  const { busy, error, run } = useAction()

  const effectiveMode: Mode = isOut ? 'delivery' : mode === 'delivery' ? 'exchange' : mode

  async function confirm() {
    if (!picked) return
    if (effectiveMode === 'delivery') {
      // Came back from a delivery: settle it on the delivery screen.
      router.navigate({ to: '/deliveries/$id', params: { id: String(picked.orderId) }, search: { back: picked.itemId } })
      return
    }
    const res = await run(() =>
      doReturn({ data: { itemId: picked.itemId, mode: effectiveMode, refundMethod: effectiveMode === 'refund' ? refundMethod : null } }),
    )
    if (!res) return
    void refresh()
    if (effectiveMode === 'exchange') {
      cart.clear()
      cart.setCredit({ refundId: res.refundId, amount: res.amount, customerName: res.customerName, customerPhone: res.customerPhone })
      router.navigate({ to: '/scan', search: { then: 'add', kind: 'sale' }, replace: true })
    } else {
      router.navigate({ to: '/returned', search: { sku: variant.sku, amount: res.amount, method: refundMethod }, replace: true })
    }
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 140 }}>
      <TopBar title="Return" />

      <div className="row mt24">
        <Photo src={product.photo} />
        <div className="grow">
          <div style={{ fontWeight: 500 }}>{product.name}</div>
          <div className="small muted">{variant.color} · {variant.size}</div>
        </div>
        <strong>{rwf(product.price)}</strong>
      </div>

      {candidates.length === 0 ? (
        <div className="notice mt24">
          No sale or delivery found for this item, so there is nothing to return. If you are counting stock, ask an admin to adjust it.
          <Link to="/" className="btn mt16">Back home</Link>
        </div>
      ) : (
        <>
          <p className="section-label">Which customer?</p>
          <div className="stack">
            {candidates.map((c) => (
              <Choice key={c.itemId} on={pickedId === c.itemId} onClick={() => setPickedId(c.itemId)}>
                <div>{c.customerName}</div>
                <div className="tiny muted">
                  {c.status === 'out' ? 'Out for delivery' : 'Bought'} · {when(c.createdAt)} · {c.customerPhone}
                </div>
              </Choice>
            ))}
          </div>

          {!isOut && (
            <>
              <p className="section-label">What happened?</p>
              <div className="stack">
                <Choice on={effectiveMode === 'exchange'} onClick={() => setMode('exchange')}>Exchange for another size or item</Choice>
                <Choice on={effectiveMode === 'refund'} onClick={() => setMode('refund')}>Returned for a refund</Choice>
              </div>
              {effectiveMode === 'refund' && (
                <>
                  <p className="section-label">Money given back by</p>
                  <div className="segment">
                    <button className={refundMethod === 'cash' ? 'on' : ''} onClick={() => setRefundMethod('cash')}>Cash</button>
                    <button className={refundMethod === 'momo' ? 'on' : ''} onClick={() => setRefundMethod('momo')}>MoMo</button>
                  </div>
                </>
              )}
            </>
          )}

          <p className="small muted mt16">
            {isOut
              ? 'This item is out with a rider. Next, mark what the customer kept.'
              : effectiveMode === 'exchange'
                ? 'This item goes back into stock. Next, scan the item they are taking instead.'
                : `This item goes back into stock and ${rwf(picked?.price)} is recorded as refunded.`}
          </p>
        </>
      )}

      {error && <p className="error">{error}</p>}

      {candidates.length > 0 && (
        <div className="actions">
          <div>
            <button className="btn primary" disabled={busy || !picked} onClick={confirm}>
              {isOut ? 'Continue' : effectiveMode === 'exchange' ? 'Put back in stock & scan new item' : 'Put back in stock & refund'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
