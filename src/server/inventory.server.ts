import { and, asc, desc, eq, ilike, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db, schema, type Executor } from './db/index.ts'
import { skuPart } from '../lib/format.ts'
import type { SessionUser } from '../lib/types.ts'

const { products, variants, movements, orders, orderItems, user: users } = schema

export type Product = typeof products.$inferSelect
export type Variant = typeof variants.$inferSelect

/** Cost prices are admin-only. */
export function forRole<T extends { cost: number | null }>(row: T, who: SessionUser): T {
  return who.role === 'admin' ? row : { ...row, cost: null }
}

async function makeSku(t: Executor, code: string, color: string, size: string) {
  const base = `${code}-${skuPart(color)}-${skuPart(size, 4)}`
  let sku = base
  for (let i = 2; ; i++) {
    const hit = await t.select({ id: variants.id }).from(variants).where(eq(variants.sku, sku))
    if (hit.length === 0) return sku
    sku = `${base}${i}`
  }
}

export type NewProduct = {
  name: string
  brand?: string
  category?: string
  price: number
  cost?: number | null
  lowStockAt: number
  photo?: string | null
  variants: Array<{ color: string; size: string; qty: number }>
}

export async function createProduct(input: NewProduct, who: SessionUser) {
  return db.transaction(async (t) => {
    const [row] = await t
      .insert(products)
      .values({
        code: `TMP-${crypto.randomUUID()}`,
        name: input.name,
        brand: input.brand || null,
        category: input.category || null,
        price: input.price,
        cost: input.cost ?? null,
        photo: input.photo ?? null,
        lowStockAt: input.lowStockAt,
      })
      .returning({ id: products.id })
    // Product codes follow the id: PRM-0001, PRM-0002, …
    const code = `PRM-${String(row.id).padStart(4, '0')}`
    await t.update(products).set({ code }).where(eq(products.id, row.id))
    for (const v of input.variants) await addVariant(t, row.id, code, v.color, v.size, v.qty, who)
    return { id: row.id, code }
  })
}

export async function addVariant(t: Executor, productId: number, code: string, color: string, size: string, qty: number, who: SessionUser) {
  const [existing] = await t
    .select({ id: variants.id })
    .from(variants)
    .where(and(eq(variants.productId, productId), ilike(variants.color, color), ilike(variants.size, size)))
  if (existing) {
    if (qty > 0) await changeStock(t, existing.id, qty, 'stock_in', who, null, 'Restock')
    return existing.id
  }
  const [created] = await t
    .insert(variants)
    .values({ productId, color, size, sku: await makeSku(t, code, color, size), qty: 0 })
    .returning({ id: variants.id })
  if (qty > 0) await changeStock(t, created.id, qty, 'stock_in', who, null, 'First stock')
  return created.id
}

/** The only place stock changes. Atomic, never below zero, always logged. */
export async function changeStock(
  t: Executor,
  variantId: number,
  delta: number,
  reason: string,
  who: SessionUser,
  orderId: number | null,
  note: string | null = null,
) {
  const updated = await t
    .update(variants)
    .set({ qty: sql`${variants.qty} + ${delta}` })
    .where(and(eq(variants.id, variantId), sql`${variants.qty} + ${delta} >= 0`))
    .returning({ qty: variants.qty })
  if (updated.length === 0) {
    const [v] = await t.select({ sku: variants.sku }).from(variants).where(eq(variants.id, variantId))
    throw new Error(v ? `${v.sku} is out of stock.` : 'Item not found.')
  }
  await t.insert(movements).values({ variantId, delta, reason, orderId, userId: who.id, note })
  return updated[0].qty
}

export async function lookup(code: string) {
  const clean = code.trim().toUpperCase()
  // Both checks at once: one round trip instead of two.
  const [[v], [p]] = await Promise.all([
    db.select({ sku: variants.sku, productId: variants.productId }).from(variants).where(eq(variants.sku, clean)),
    db.select({ id: products.id }).from(products).where(eq(products.code, clean)),
  ])
  if (v) return { type: 'variant' as const, sku: v.sku, productId: v.productId }
  if (p) return { type: 'product' as const, productId: p.id }
  return null
}

export async function getVariantDetail(sku: string, who: SessionUser) {
  const clean = sku.trim().toUpperCase()
  // All three keyed by the SKU so they run at the same time: one round trip.
  const scanned = alias(variants, 'scanned')
  const [[row], sameColor, open] = await Promise.all([
    db.select({ variant: variants, product: products }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(eq(variants.sku, clean)),
    // Other sizes in the same colour
    db
      .select({ size: variants.size, qty: variants.qty, sku: variants.sku })
      .from(variants)
      .innerJoin(scanned, and(eq(scanned.productId, variants.productId), eq(scanned.color, variants.color), ne(scanned.id, variants.id)))
      .where(eq(scanned.sku, clean))
      .orderBy(asc(variants.id)),
    // Has this exact item been sold or sent out (so it can come back)?
    db
      .select({ id: orderItems.id })
      .from(orderItems)
      .innerJoin(variants, eq(variants.id, orderItems.variantId))
      .where(and(eq(variants.sku, clean), inArray(orderItems.status, ['out', 'sold'])))
      .limit(1),
  ])
  if (!row) return null
  const { variant, product } = row
  return { variant, product: forRole(product, who), sameColor, hasReturnable: open.length > 0 }
}

/** What a scan resolves to, in one request: an item (with its details), a product code, or nothing. */
export async function scan(code: string, who: SessionUser) {
  const clean = code.trim().toUpperCase()
  const [item, [p]] = await Promise.all([
    getVariantDetail(clean, who),
    db.select({ id: products.id }).from(products).where(eq(products.code, clean)),
  ])
  if (item) return { type: 'variant' as const, item }
  if (p) return { type: 'product' as const, productId: p.id }
  return null
}

export async function getProductDetail(id: number, who: SessionUser) {
  const [[product], variantRows, history] = await Promise.all([
    db.select().from(products).where(eq(products.id, id)),
    db.select().from(variants).where(eq(variants.productId, id)).orderBy(asc(variants.id)),
    historyOf(id),
  ])
  if (!product) return null
  return { product: forRole(product, who), variants: variantRows, history }
}

function historyOf(id: number) {
  return db
    .select({
      id: movements.id,
      delta: movements.delta,
      reason: movements.reason,
      note: movements.note,
      createdAt: movements.createdAt,
      userName: users.name,
      color: variants.color,
      size: variants.size,
      customerName: orders.customerName,
    })
    .from(movements)
    .innerJoin(variants, eq(variants.id, movements.variantId))
    .innerJoin(users, eq(users.id, movements.userId))
    .leftJoin(orders, eq(orders.id, movements.orderId))
    .where(eq(variants.productId, id))
    .orderBy(desc(movements.id))
    .limit(40)
}

export async function listProducts(q: string, who: SessionUser) {
  const term = q.trim()
  const like = `%${term}%`
  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      brand: products.brand,
      price: products.price,
      cost: products.cost,
      photo: products.photo,
      total: sql<number>`coalesce(sum(${variants.qty}), 0)::int`,
      low: sql<number>`count(*) filter (where ${variants.qty} > 0 and ${variants.qty} <= ${products.lowStockAt})::int`,
      outCount: sql<number>`count(*) filter (where ${variants.qty} = 0)::int`,
    })
    .from(products)
    .leftJoin(variants, eq(variants.productId, products.id))
    .where(
      and(
        eq(products.archived, false),
        term ? or(ilike(products.name, like), ilike(products.code, like), ilike(products.brand, like), ilike(variants.sku, like)) : undefined,
      ),
    )
    .groupBy(products.id)
    .orderBy(asc(sql`lower(${products.name})`))
  return rows.map((r) => forRole(r, who))
}

export async function lowStock() {
  return db
    .select({
      sku: variants.sku,
      qty: variants.qty,
      color: variants.color,
      size: variants.size,
      name: products.name,
      photo: products.photo,
      productId: products.id,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(products.archived, false), lte(variants.qty, products.lowStockAt)))
    .orderBy(asc(variants.qty), asc(products.name))
}

export async function totalPieces() {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${variants.qty}), 0)::int` })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(products.archived, false))
  return row.n
}
