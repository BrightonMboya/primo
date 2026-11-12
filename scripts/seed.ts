// Demo data so you can try Primo straight away.
//   npm run seed   -> adds demo staff + items (only if there are no users yet)
// Works against local PGlite (no DATABASE_URL) or Supabase (DATABASE_URL set).
// Passwords can be set with PRIMO_ADMIN_PASSWORD / PRIMO_SALES_PASSWORD.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../src/server/db/index.ts'
import { createStaff, staffCount } from '../src/server/staff.server.ts'
import { createProduct } from '../src/server/inventory.server.ts'
import { checkout, closeDelivery, processReturn } from '../src/server/orders.server.ts'
import type { SessionUser } from '../src/lib/types.ts'

if ((await staffCount()) > 0) {
  console.log('The database already has users. Nothing was changed.')
  process.exit(0)
}

const adminPassword = process.env.PRIMO_ADMIN_PASSWORD ?? 'primo-admin-2026'
const salesPassword = process.env.PRIMO_SALES_PASSWORD ?? 'primo-sales-2026'

const adminId = await createStaff({ name: 'Owner', username: 'owner', password: adminPassword, role: 'admin' })
const salesId = await createStaff({ name: 'Adjoa', username: 'adjoa', password: salesPassword, role: 'sales' })
const admin: SessionUser = { id: adminId, name: 'Owner', username: 'owner', role: 'admin' }
const sales: SessionUser = { id: salesId, name: 'Adjoa', username: 'adjoa', role: 'sales' }

const grid = (colors: string[], sizes: string[], qty: (c: string, s: string) => number) =>
  colors.flatMap((color) => sizes.map((size) => ({ color, size, qty: qty(color, size) })))

const bodyQty: Record<string, Record<string, number>> = {
  White: { S: 5, M: 2, L: 3 },
  Red: { S: 4, M: 2, L: 3 },
  Black: { S: 5, M: 3, L: 3 },
  Khaki: { S: 2, M: 2, L: 2 },
}
const bodysuit = await createProduct(
  { name: 'Ribbed bodysuit', brand: 'Zara', category: 'Tops', price: 18000, cost: 9500, lowStockAt: 2, variants: grid(Object.keys(bodyQty), ['S', 'M', 'L'], (c, s) => bodyQty[c][s]) },
  admin,
)
const redPant: Record<string, number> = { S: 1, M: 4, L: 3, XL: 0 }
const pant = await createProduct(
  { name: 'Wide-leg pant', brand: 'Zara', category: 'Bottoms', price: 22000, cost: 12000, lowStockAt: 1, variants: grid(['Red', 'Black'], ['S', 'M', 'L', 'XL'], (c, s) => (c === 'Red' ? redPant[s] : 3)) },
  admin,
)
await createProduct(
  { name: 'Satin slip dress', brand: 'H&M', category: 'Dresses', price: 26000, cost: 14000, lowStockAt: 1, variants: grid(['Champagne', 'Emerald'], ['S', 'M', 'L'], () => 2) },
  admin,
)
const jacket: Record<string, number> = { S: 1, M: 2, L: 2, XL: 1 }
await createProduct(
  { name: 'Denim jacket', brand: "Levi's", category: 'Outerwear', price: 45000, cost: 26000, lowStockAt: 1, variants: grid(['Light wash'], ['S', 'M', 'L', 'XL'], (_, s) => jacket[s]) },
  admin,
)

const v = async (productId: number, color: string, size: string) => {
  const [row] = await db
    .select({ id: schema.variants.id })
    .from(schema.variants)
    .where(and(eq(schema.variants.productId, productId), eq(schema.variants.color, color), eq(schema.variants.size, size)))
  return row.id
}
const firstItem = async (orderId: number) => {
  const [row] = await db.select({ id: schema.orderItems.id }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId))
  return row.id
}

// A few realistic transactions so every screen has something to show.
await checkout({ kind: 'sale', variantIds: [await v(pant.id, 'Red', 'M')], customerName: '@ama.styles', customerPhone: '078 811 2233', channel: 'instagram', payment: 'momo', momoRef: '7741029831' }, sales)
await checkout({ kind: 'sale', variantIds: [await v(bodysuit.id, 'Black', 'S'), await v(bodysuit.id, 'White', 'M')], customerName: 'Esi Mensah', customerPhone: '020 555 0101', channel: 'shop', payment: 'cash' }, sales)
await checkout({ kind: 'delivery', variantIds: [await v(bodysuit.id, 'White', 'M'), await v(pant.id, 'Black', 'M')], customerName: '@efua.k', customerPhone: '078 555 0193', channel: 'instagram', payment: null, deliveryFee: 3000 }, sales)
const khaki = await checkout({ kind: 'delivery', variantIds: [await v(bodysuit.id, 'Khaki', 'S')], customerName: '@nana.ad', customerPhone: '026 444 7788', channel: 'instagram', payment: 'momo' }, sales)
await closeDelivery({ orderId: khaki.orderId, kept: [await firstItem(khaki.orderId)], returned: [], payment: null }, sales)
const credit = await processReturn({ itemId: await firstItem(khaki.orderId), mode: 'exchange', refundMethod: null }, sales)
await checkout({ kind: 'sale', variantIds: [await v(bodysuit.id, 'Khaki', 'M')], customerName: '@nana.ad', customerPhone: '026 444 7788', channel: 'instagram', payment: 'momo', creditRefundId: credit.refundId }, sales)

console.log('Demo data added.\n')
console.log(`  Admin  username: owner   password: ${adminPassword}`)
console.log(`  Sales  username: adjoa   password: ${salesPassword}`)
console.log('\nChange these passwords in Staff after you sign in.')
process.exit(0)
