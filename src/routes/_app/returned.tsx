import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { rwf } from '~/lib/format'
import { Icon } from '~/components/ui'

export const Route = createFileRoute('/_app/returned')({
  validateSearch: z.object({ sku: z.string(), amount: z.number(), method: z.enum(['cash', 'momo']) }),
  component: Returned,
})

function Returned() {
  const { sku, amount, method } = Route.useSearch()
  return (
    <div className="page no-tabs">
      <div className="done">
        <div className="tick green"><Icon name="check" size={30} /></div>
        <h1 className="title">Back in stock</h1>
        <p className="muted" style={{ margin: 0 }}>
          {sku}
          <br />
          Refund {rwf(amount)} by {method === 'momo' ? 'MoMo' : 'cash'}
        </p>
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
