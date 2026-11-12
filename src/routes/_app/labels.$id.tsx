import { useEffect, useState } from 'react'
import { createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import QRCode from 'qrcode'
import { productQuery, useFound } from '~/lib/queries'
import { rwf } from '~/lib/format'
import { sortSizes, unique } from '~/lib/sizes'
import { TopBar } from '~/components/ui'

export const Route = createFileRoute('/_app/labels/$id')({
  validateSearch: z.object({ fresh: z.boolean().optional() }),
  beforeLoad: ({ context }) => {
    if (context.user?.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(productQuery(Number(params.id))))) throw notFound()
  },
  component: Labels,
})

function Labels() {
  const { id } = Route.useParams()
  const { product, variants } = useFound(productQuery(Number(id)))
  const { fresh } = Route.useSearch()
  const router = useRouter()
  // How many labels per SKU. Defaults to what is in stock.
  const [copies, setCopies] = useState<Record<number, number>>(() => Object.fromEntries(variants.map((v) => [v.id, v.qty])))
  const [qr, setQr] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    Promise.all(variants.map(async (v) => [v.sku, await QRCode.toDataURL(v.sku, { margin: 0, width: 240, errorCorrectionLevel: 'M' })] as const)).then(
      (pairs) => alive && setQr(Object.fromEntries(pairs)),
    )
    return () => {
      alive = false
    }
  }, [variants])

  const sizeOrder = sortSizes(unique(variants.map((v) => v.size)))
  const sorted = [...variants].sort((a, b) => a.color.localeCompare(b.color) || sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size))
  const total = Object.values(copies).reduce((s, n) => s + n, 0)

  return (
    <div className="page no-tabs" style={{ paddingBottom: 140 }}>
      <div className="no-print">
        <TopBar title="Print labels" back={() => router.navigate({ to: '/stock/$id', params: { id: String(product.id) } })} />
        {fresh && <div className="notice green mt16">Saved · {variants.reduce((s, v) => s + v.qty, 0)} pieces added to stock</div>}
        <p className="small muted mt16">
          Labels are 50 × 30 mm. On a label printer choose that paper size. On a normal printer use A4 and cut them out.
        </p>
        <div className="list mt8">
          {sorted.map((v) => (
            <div key={v.id} className="list-row" style={{ cursor: 'default' }}>
              <div className="grow">
                <div>{v.color} · {v.size}</div>
                <div className="tiny faint">{v.sku}</div>
              </div>
              <input
                className="input qty"
                style={{ width: 72 }}
                inputMode="numeric"
                value={copies[v.id] ?? 0}
                onChange={(e) => setCopies({ ...copies, [v.id]: Math.min(500, Number(e.target.value.replace(/\D/g, '')) || 0) })}
              />
            </div>
          ))}
        </div>
        <p className="section-label">Preview</p>
      </div>

      <div className="labels">
        {sorted.flatMap((v) =>
          Array.from({ length: copies[v.id] ?? 0 }, (_, i) => (
            <div className="label-card" key={`${v.id}-${i}`}>
              {qr[v.sku] ? <img src={qr[v.sku]} alt={v.sku} /> : <div style={{ width: '24mm', height: '24mm' }} />}
              <div className="t">
                <b>{product.name}</b>
                {v.color} · {v.size}
                <br />
                {rwf(product.price)}
                <small>{v.sku}</small>
              </div>
            </div>
          )),
        )}
      </div>

      <div className="actions">
        <div>
          <button className="btn primary" disabled={total === 0 || Object.keys(qr).length === 0} onClick={() => window.print()}>
            Print {total} label{total === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
