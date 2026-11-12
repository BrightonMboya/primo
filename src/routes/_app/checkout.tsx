import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { doCheckout } from '~/server/app.functions'
import { cart, useCart } from '~/lib/cart'
import { rwf, toAmount } from '~/lib/format'
import type { Channel, Payment } from '~/lib/types'
import { Choice, Icon, Photo, Switch, TopBar, useAction } from '~/components/ui'
import { useRefresh } from '~/lib/queries'

export const Route = createFileRoute('/_app/checkout')({
  validateSearch: z.object({ kind: z.enum(['sale', 'delivery']).default('sale') }),
  component: Checkout,
})

function Checkout() {
  const { kind } = Route.useSearch()
  const router = useRouter()
  const refresh = useRefresh()
  const { items, credit } = useCart()
  const isSale = kind === 'sale'

  const [name, setName] = useState(credit?.customerName ?? '')
  const [phone, setPhone] = useState(credit?.customerPhone ?? '')
  const [channel, setChannel] = useState<Channel>(isSale ? 'shop' : 'instagram')
  const [payment, setPayment] = useState<Payment | null>(isSale ? 'cash' : null)
  const [paidAlready, setPaidAlready] = useState(false)
  const [momoRef, setMomoRef] = useState('')
  const [area, setArea] = useState('')
  const [fee, setFee] = useState('')
  const { busy, error, run } = useAction()

  const subtotal = items.reduce((s, i) => s + i.price, 0)
  const total = subtotal - (credit?.amount ?? 0)
  const showPayment = isSale || paidAlready

  async function confirm() {
    const res = await run(() =>
      doCheckout({
        data: {
          kind,
          variantIds: items.map((i) => i.variantId),
          customerName: name,
          customerPhone: phone,
          channel,
          payment: showPayment ? payment : null,
          momoRef: payment === 'momo' ? momoRef : undefined,
          area: isSale ? undefined : area,
          deliveryFee: isSale ? undefined : toAmount(fee || 0),
          creditRefundId: credit?.refundId ?? null,
        },
      }),
    )
    if (!res) return
    void refresh()
    cart.clear()
    router.navigate({ to: '/done/$orderId', params: { orderId: String(res.orderId) }, replace: true })
  }

  if (items.length === 0) {
    return (
      <div className="page no-tabs">
        <TopBar title={isSale ? 'Sell' : 'Send for delivery'} back="/" />
        {credit && (
          <div className="notice green mt16">
            Exchange credit {rwf(credit.amount)} for {credit.customerName}. Scan the item they are taking instead.
          </div>
        )}
        <p className="muted mt24">No items yet.</p>
        <Link to="/scan" search={{ then: 'add', kind }} className="btn primary mt16">Scan item</Link>
        {credit && (
          <button className="btn mt8" onClick={() => { cart.clear(); router.navigate({ to: '/' }) }}>
            Cancel exchange
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 140 }}>
      <TopBar title={isSale ? 'Sell' : 'Send for delivery'} />

      <div className="list mt16">
        {items.map((item, i) => (
          <div key={`${item.variantId}-${i}`} className="list-row" style={{ cursor: 'default' }}>
            <Photo src={item.photo} />
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{item.name}</div>
              <div className="small muted">{item.color} · {item.size}</div>
            </div>
            <strong>{rwf(item.price)}</strong>
            <button className="linkbtn faint" aria-label="Remove" onClick={() => cart.removeAt(i)} style={{ textDecoration: 'none' }}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
        <Link to="/scan" search={{ then: 'add', kind }} className="list-row" style={{ color: 'var(--muted)' }}>
          <span className="grow">+ Scan another item</span>
        </Link>
        {credit && (
          <div className="list-row" style={{ cursor: 'default' }}>
            <span className="grow green">Exchange credit</span>
            <strong className="green">−{rwf(credit.amount)}</strong>
          </div>
        )}
      </div>

      <p className="section-label">Customer</p>
      <div className="stack">
        <input className="input" placeholder="Name or Instagram handle" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <input className="input" placeholder="Phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        {!isSale && <input className="input" placeholder="Delivery area, e.g. Kimihurura" value={area} onChange={(e) => setArea(e.target.value)} />}
      </div>

      {isSale && (
        <>
          <p className="section-label">Where</p>
          <div className="segment">
            <button className={channel === 'shop' ? 'on' : ''} onClick={() => setChannel('shop')}>In shop</button>
            <button className={channel === 'instagram' ? 'on' : ''} onClick={() => setChannel('instagram')}>Instagram</button>
          </div>
        </>
      )}

      {!isSale && (
        <>
          <p className="section-label">Delivery fee (optional)</p>
          <input className="input" inputMode="numeric" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
          <div className="row mt24">
            <div className="grow">
              <div>Already paid</div>
              <div className="tiny muted">Off = rider collects on delivery</div>
            </div>
            <Switch on={paidAlready} onChange={(v) => { setPaidAlready(v); setPayment(v ? 'momo' : null) }} label="Already paid" />
          </div>
        </>
      )}

      {showPayment && (
        <>
          <p className="section-label">Paid with</p>
          <div className="stack">
            <Choice on={payment === 'cash'} onClick={() => setPayment('cash')}>Cash</Choice>
            <Choice on={payment === 'momo'} onClick={() => setPayment('momo')}>MoMo</Choice>
            {payment === 'momo' && (
              <input className="input" placeholder="MoMo transaction ID (optional)" value={momoRef} onChange={(e) => setMomoRef(e.target.value)} />
            )}
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <div>
          {total < 0 && <div className="notice">Give the customer back {rwf(-total)}.</div>}
          <button className="btn primary" disabled={busy} onClick={confirm}>
            {busy ? 'Saving…' : isSale ? `Confirm sale · ${rwf(Math.max(total, 0))}` : `Send out · ${items.length} item${items.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
