import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Scanner } from '~/components/Scanner'
import { useQueryClient } from '@tanstack/react-query'
import { scanCode } from '~/server/app.functions'
import { itemQuery } from '~/lib/queries'
import { cart } from '~/lib/cart'
import { readableError } from '~/components/ui'

export const Route = createFileRoute('/_app/scan')({
  // then=add: put the item straight into the open sale/delivery.
  validateSearch: z.object({ then: z.enum(['add']).optional(), kind: z.enum(['sale', 'delivery']).optional() }),
  component: ScanPage,
})

function ScanPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { then, kind } = Route.useSearch()
  const [typing, setTyping] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handle(raw: string) {
    const value = raw.trim()
    if (!value || busy) return
    setBusy(true)
    setMessage(null)
    try {
      // One request: finds the code and brings the item details back with it.
      const found = await scanCode({ data: { code: value } })
      if (!found) {
        setMessage(`No item with code ${value}`)
        return
      }
      if (found.type === 'product') {
        router.navigate({ to: '/stock/$id', params: { id: String(found.productId) } })
        return
      }
      const item = found.item
      // Put it in the cache so the item screen opens instantly, with no second request.
      queryClient.setQueryData(itemQuery(item.variant.sku).queryKey, item)
      if (then === 'add') {
        if (item.variant.qty < 1) {
          setMessage(`${item.product.name} ${item.variant.color} ${item.variant.size} is sold out`)
          return
        }
        cart.add({
          variantId: item.variant.id,
          sku: item.variant.sku,
          name: item.product.name,
          color: item.variant.color,
          size: item.variant.size,
          price: item.product.price,
          photo: item.product.photo,
        })
        router.navigate({ to: '/checkout', search: { kind: kind ?? 'sale' } })
        return
      }
      router.navigate({ to: '/item/$sku', params: { sku: item.variant.sku } })
    } catch (err) {
      setMessage(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scanner-page">
      <div className="topbar">
        <button className="side" onClick={() => router.history.back()}>Cancel</button>
        <h1>{then === 'add' ? 'Scan next item' : 'Scan'}</h1>
        <span className="side" />
      </div>
      <Scanner onCode={handle} paused={busy || typing} />
      <div className="scanner-bottom">
        {message && <div className="notice red">{message}</div>}
        {typing ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              handle(code)
            }}
          >
            <input
              className="input grow"
              autoFocus
              autoCapitalize="characters"
              placeholder="e.g. PRM-0001-RED-S"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn small" style={{ height: 50 }} disabled={busy}>Find</button>
          </form>
        ) : (
          <button className="btn" onClick={() => setTyping(true)}>Type code instead</button>
        )}
      </div>
    </div>
  )
}
