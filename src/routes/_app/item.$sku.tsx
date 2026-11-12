import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { itemQuery, useFound } from '~/lib/queries'
import { cart } from '~/lib/cart'
import { rwf } from '~/lib/format'
import { Photo } from '~/components/ui'

export const Route = createFileRoute('/_app/item/$sku')({
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(itemQuery(params.sku)))) throw notFound()
  },
  component: ItemFound,
})

function ItemFound() {
  const { sku } = Route.useParams()
  const { variant, product, sameColor, hasReturnable } = useFound(itemQuery(sku))
  const router = useRouter()
  const inStock = variant.qty > 0

  function start(kind: 'sale' | 'delivery') {
    cart.clear()
    cart.add({
      variantId: variant.id,
      sku: variant.sku,
      name: product.name,
      color: variant.color,
      size: variant.size,
      price: product.price,
      photo: product.photo,
    })
    router.navigate({ to: '/checkout', search: { kind } })
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 260 }}>
      <div className="topbar">
        <button className="side" onClick={() => router.navigate({ to: '/' })}>Close</button>
        <span />
        <Link to="/stock/$id" params={{ id: String(product.id) }} className="side right">All sizes</Link>
      </div>

      <Photo src={product.photo} className="hero" alt={product.name} />

      <div className="stack mt24" style={{ gap: 6 }}>
        <h1 className="title">{product.name}</h1>
        <div>
          {variant.color} · Size {variant.size} · {rwf(product.price)}
        </div>
        <div className="tiny faint">{variant.sku}</div>
      </div>

      <div className="stat mt16">
        <span>In stock (this size)</span>
        <strong className={variant.qty === 0 ? 'red' : variant.qty <= product.lowStockAt ? 'red' : ''}>
          {variant.qty === 0 ? '0 · Sold out' : variant.qty}
        </strong>
      </div>

      {sameColor.length > 0 && (
        <p className="small muted mt16">
          Other sizes in {variant.color}: {sameColor.map((s) => `${s.size} ${s.qty}`).join(' · ')}
        </p>
      )}

      <div className="actions">
        <div>
          <button className="btn primary" disabled={!inStock} onClick={() => start('sale')}>
            {inStock ? 'Sell' : 'Sold out'}
          </button>
          <button className="btn" disabled={!inStock} onClick={() => start('delivery')}>Send for delivery</button>
          <Link to="/return/$sku" params={{ sku: variant.sku }} className="btn" style={{ opacity: hasReturnable ? 1 : 0.5 }}>
            Return to stock
          </Link>
        </div>
      </div>
    </div>
  )
}
