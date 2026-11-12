import { useState } from 'react'
import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { adjustStock } from '~/server/app.functions'
import { productQuery, useFound, useRefresh } from '~/lib/queries'
import { rwf, when } from '~/lib/format'
import { sortSizes, unique } from '~/lib/sizes'
import { Photo, TopBar, useAction } from '~/components/ui'

export const Route = createFileRoute('/_app/stock/$id')({
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(productQuery(Number(params.id))))) throw notFound()
  },
  component: ProductStock,
})

const REASONS: Record<string, string> = {
  stock_in: 'Added',
  sale: 'Sold',
  delivery_out: 'Sent out',
  delivery_return: 'Back from delivery',
  return: 'Returned (refund)',
  exchange_in: 'Returned (exchange)',
  adjust: 'Count corrected',
}

function ProductStock() {
  const { id } = Route.useParams()
  const { product, variants, history } = useFound(productQuery(Number(id)))
  const { user } = Route.useRouteContext()
  const refresh = useRefresh()
  const isAdmin = user.role === 'admin'
  const colors = unique(variants.map((v) => v.color))
  const sizes = sortSizes(unique(variants.map((v) => v.size)))
  const cell = (c: string, s: string) => variants.find((v) => v.color === c && v.size === s)
  const total = variants.reduce((sum, v) => sum + v.qty, 0)

  const [editing, setEditing] = useState(false)
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [newColor, setNewColor] = useState('')
  const [newSize, setNewSize] = useState('')
  const [newQty, setNewQty] = useState('')
  const { busy, error, run } = useAction()

  async function save() {
    const changes = variants
      .filter((v) => counts[v.id] !== undefined && counts[v.id] !== '' && Number(counts[v.id]) !== v.qty)
      .map((v) => ({ variantId: v.id, newQty: Math.max(0, Math.floor(Number(counts[v.id]))) }))
    const add = newColor.trim() && newSize.trim() ? [{ color: newColor.trim(), size: newSize.trim(), qty: Number(newQty) || 0 }] : []
    const ok = await run(() => adjustStock({ data: { productId: product.id, changes, add } }))
    if (!ok) return
    setEditing(false)
    setCounts({})
    setNewColor('')
    setNewSize('')
    setNewQty('')
    await refresh(productQuery(product.id).queryKey)
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 140 }}>
      <TopBar
        back="/stock"
        right={isAdmin ? <Link to="/admin/edit/$id" params={{ id: String(product.id) }}>Edit</Link> : null}
      />

      <div className="row mt16" style={{ gap: 14 }}>
        <Photo src={product.photo} className="thumb" />
        <div className="grow">
          <h1 className="title" style={{ fontSize: 20 }}>{product.name}</h1>
          <div className="small muted">
            {[product.brand, product.category].filter(Boolean).join(' · ')}
            {product.brand || product.category ? ' · ' : ''}
            {rwf(product.price)}
            {isAdmin && product.cost != null && ` · cost ${rwf(product.cost)}`}
          </div>
          <div className="small">{total} in stock · <span className="faint">{product.code}</span></div>
        </div>
      </div>

      <table className="table mt24">
        <thead>
          <tr>
            <th>Colour</th>
            {sizes.map((s) => <th key={s}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {colors.map((c) => (
            <tr key={c}>
              <td>{c}</td>
              {sizes.map((s) => {
                const v = cell(c, s)
                if (!v) return <td key={s} className="faint">–</td>
                if (editing) {
                  return (
                    <td key={s} style={{ padding: '6px 3px' }}>
                      <input
                        className="input qty"
                        inputMode="numeric"
                        placeholder={String(v.qty)}
                        value={counts[v.id] ?? ''}
                        onChange={(e) => setCounts({ ...counts, [v.id]: e.target.value.replace(/\D/g, '') })}
                      />
                    </td>
                  )
                }
                const cls = v.qty === 0 ? 'faint' : v.qty <= product.lowStockAt ? 'red' : ''
                return <td key={s} className={cls}>{v.qty}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!editing && <p className="tiny muted mt8">Red = {product.lowStockAt} or fewer left.</p>}

      {editing && (
        <>
          <p className="small muted mt8">Type the new count only where it changed. Leave others empty.</p>
          <p className="section-label">Add a new colour or size</p>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Colour" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
            <input className="input" style={{ width: 90 }} placeholder="Size" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
            <input className="input" style={{ width: 80 }} inputMode="numeric" placeholder="Qty" value={newQty} onChange={(e) => setNewQty(e.target.value.replace(/\D/g, ''))} />
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}

      <p className="section-label">History</p>
      {history.length === 0 && <p className="small muted">No changes yet.</p>}
      <div className="stack">
        {history.map((h, i) => (
          <div key={i} className="row small" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              {REASONS[h.reason] ?? h.reason} <strong>{h.color} {h.size}</strong>
              {h.customerName ? ` · ${h.customerName}` : ''} · {h.userName}
            </div>
            <span className={h.delta < 0 ? 'red' : 'green'} style={{ width: 36, textAlign: 'right' }}>
              {h.delta > 0 ? `+${h.delta}` : h.delta}
            </span>
            <span className="faint" style={{ width: 92, textAlign: 'right' }}>{when(h.createdAt)}</span>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="actions">
          <div className="row">
            {editing ? (
              <>
                <button className="btn" onClick={() => { setEditing(false); setCounts({}) }}>Cancel</button>
                <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save counts'}</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => setEditing(true)}>Add / correct stock</button>
                <Link to="/labels/$id" params={{ id: String(product.id) }} className="btn">Print labels</Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
