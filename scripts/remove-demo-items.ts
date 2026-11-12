// Deletes the 4 demo items (PRM-0001..PRM-0004) and their sales/history, plus their photos.
//   node --env-file=.env --experimental-strip-types scripts/remove-demo-items.ts
// Only items whose name matches the demo items are touched.
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../src/server/db/index.ts'

const DEMO = ['Ribbed bodysuit', 'Wide-leg pant', 'Satin dress', 'Denim jacket']
const CODES = ['PRM-0001', 'PRM-0002', 'PRM-0003', 'PRM-0004']
const { products, variants, movements, orderItems, orders, refunds } = schema

const found = await db
  .select({ id: products.id, code: products.code, name: products.name, photo: products.photo })
  .from(products)
  .where(and(inArray(products.code, CODES), inArray(products.name, DEMO)))
if (found.length === 0) {
  console.log('No demo items found.')
  process.exit(0)
}

await db.transaction(async (t) => {
  const vIds = (await t.select({ id: variants.id }).from(variants).where(inArray(variants.productId, found.map((p) => p.id)))).map((v) => v.id)
  if (vIds.length) {
    const items = await t.select({ id: orderItems.id, orderId: orderItems.orderId }).from(orderItems).where(inArray(orderItems.variantId, vIds))
    const itemIds = items.map((i) => i.id)
    const orderIds = [...new Set(items.map((i) => i.orderId))]
    if (itemIds.length) await t.delete(refunds).where(inArray(refunds.orderItemId, itemIds))
    await t.delete(movements).where(inArray(movements.variantId, vIds))
    if (itemIds.length) await t.delete(orderItems).where(inArray(orderItems.id, itemIds))
    // Remove orders that now have no items left.
    for (const oid of orderIds) {
      const left = await t.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, oid)).limit(1)
      if (left.length === 0) {
        await t.update(refunds).set({ usedOrderId: null }).where(eq(refunds.usedOrderId, oid))
        await t.delete(movements).where(eq(movements.orderId, oid))
        await t.delete(orders).where(eq(orders.id, oid))
      }
    }
  }
  await t.delete(products).where(inArray(products.id, found.map((p) => p.id)))
})

// Photos in Supabase Storage
const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const bucket = process.env.SUPABASE_BUCKET || 'primo-photos'
const paths = found.map((p) => p.photo?.split(`/public/${bucket}/`)[1]).filter((p): p is string => !!p)
if (url && key && paths.length) {
  await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  })
}

console.log(`Removed: ${found.map((p) => `${p.code} ${p.name}`).join(', ')}`)
process.exit(0)
