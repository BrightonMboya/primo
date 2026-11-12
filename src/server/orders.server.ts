import { and, asc, count, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { db, schema, type Executor } from './db/index.ts'
import { changeStock } from './inventory.server.ts'
import type { Channel, Payment, SessionUser } from '../lib/types.ts'

const { orders, orderItems, variants, products, refunds, user: users } = schema

export type CheckoutInput = {
  kind: 'sale' | 'delivery'
  variantIds: number[]
  customerName: string
  customerPhone: string
  channel: Channel
  payment: Payment | null
  momoRef?: string
  area?: string
  deliveryFee?: number
  creditRefundId?: number | null
}

export async function checkout(input: CheckoutInput, who: SessionUser) {
  if (input.variantIds.length === 0) throw new Error('Scan at least one item.')
  if (input.kind === 'sale' && !input.payment) throw new Error('Choose Cash or MoMo.')

  return db.transaction(async (t) => {
    // Prices always come from the database, never from the phone.
    const priced = await t
      .select({ id: variants.id, price: products.price })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(inArray(variants.id, input.variantIds))
    const priceOf = new Map(priced.map((p) => [p.id, p.price]))
    const items = input.variantIds.map((id) => {
      const price = priceOf.get(id)
      if (price === undefined) throw new Error('One of the items no longer exists.')
      return { id, price }
    })
    const subtotal = items.reduce((s, i) => s + i.price, 0)

    let credit = 0
    if (input.creditRefundId) {
      const [refund] = await t.select().from(refunds).where(eq(refunds.id, input.creditRefundId)).for('update')
      if (!refund || refund.method !== 'credit') throw new Error('Exchange credit not found.')
      if (refund.usedOrderId) throw new Error('This exchange credit was already used.')
      credit = refund.amount
    }

    const isSale = input.kind === 'sale'
    const [order] = await t
      .insert(orders)
      .values({
        kind: input.kind,
        status: isSale ? 'completed' : 'out',
        channel: input.channel,
        payment: input.payment,
        momoRef: input.momoRef?.trim() || null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        area: input.area?.trim() || null,
        deliveryFee: input.deliveryFee ?? 0,
        credit,
        total: isSale ? subtotal - credit : 0,
        createdBy: who.id,
        closedAt: isSale ? new Date() : null,
      })
      .returning({ id: orders.id })

    for (const item of items) {
      await t.insert(orderItems).values({ orderId: order.id, variantId: item.id, price: item.price, status: isSale ? 'sold' : 'out' })
      await changeStock(t, item.id, -1, isSale ? 'sale' : 'delivery_out', who, order.id)
    }
    if (input.creditRefundId) await t.update(refunds).set({ usedOrderId: order.id }).where(eq(refunds.id, input.creditRefundId))

    return { orderId: order.id, total: subtotal - credit, subtotal, credit }
  })
}

export async function orderItemsOf(t: Executor, orderId: number) {
  return t
    .select({
      id: orderItems.id,
      status: orderItems.status,
      price: orderItems.price,
      variantId: orderItems.variantId,
      sku: variants.sku,
      color: variants.color,
      size: variants.size,
      qtyLeft: variants.qty,
      name: products.name,
      photo: products.photo,
    })
    .from(orderItems)
    .innerJoin(variants, eq(variants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id))
}

const orderColumns = {
  id: orders.id,
  kind: orders.kind,
  status: orders.status,
  channel: orders.channel,
  payment: orders.payment,
  momoRef: orders.momoRef,
  customerName: orders.customerName,
  customerPhone: orders.customerPhone,
  area: orders.area,
  deliveryFee: orders.deliveryFee,
  credit: orders.credit,
  total: orders.total,
  createdBy: orders.createdBy,
  createdAt: orders.createdAt,
  closedAt: orders.closedAt,
  createdByName: users.name,
}

export async function getOrder(id: number, t: Executor = db) {
  const [[order], items] = await Promise.all([
    t.select(orderColumns).from(orders).innerJoin(users, eq(users.id, orders.createdBy)).where(eq(orders.id, id)),
    orderItemsOf(t, id),
  ])
  if (!order) return null
  return { order, items }
}

export async function openDeliveries() {
  const rows = await db
    .select(orderColumns)
    .from(orders)
    .innerJoin(users, eq(users.id, orders.createdBy))
    .where(and(eq(orders.kind, 'delivery'), eq(orders.status, 'out')))
    .orderBy(desc(orders.id))
  return Promise.all(rows.map(async (order) => ({ order, items: await orderItemsOf(db, order.id) })))
}

/** Close a delivery: kept items are charged, brought-back items return to stock. */
export async function closeDelivery(
  input: { orderId: number; kept: number[]; returned: number[]; payment: Payment | null; momoRef?: string },
  who: SessionUser,
) {
  return db.transaction(async (t) => {
    // Lock the order so two phones cannot close the same delivery.
    const [locked] = await t.select({ id: orders.id }).from(orders).where(eq(orders.id, input.orderId)).for('update')
    const found = locked ? await getOrder(input.orderId, t) : null
    if (!found || found.order.kind !== 'delivery' || found.order.status !== 'out') throw new Error('This delivery is already closed.')
    const { order, items } = found
    const pending = items.filter((i) => i.status === 'out')
    const decided = new Set([...input.kept, ...input.returned])
    if (pending.some((i) => !decided.has(i.id))) throw new Error('Mark every item as kept or returned.')

    let keptTotal = 0
    for (const item of pending) {
      if (input.kept.includes(item.id)) {
        await t.update(orderItems).set({ status: 'sold' }).where(eq(orderItems.id, item.id))
        keptTotal += item.price
      } else {
        await t.update(orderItems).set({ status: 'returned' }).where(eq(orderItems.id, item.id))
        await changeStock(t, item.variantId, 1, 'delivery_return', who, order.id, 'Came back from delivery')
      }
    }

    const payment = order.payment ?? input.payment
    if (keptTotal > 0 && !payment) throw new Error('Choose how they paid: Cash or MoMo.')
    const total = Math.max(keptTotal - order.credit, 0)
    await t
      .update(orders)
      .set({
        status: keptTotal > 0 ? 'completed' : 'returned',
        payment: keptTotal > 0 ? payment : order.payment,
        momoRef: input.momoRef?.trim() || order.momoRef,
        total,
        closedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
    const owed = order.payment ? pending.filter((i) => input.returned.includes(i.id)).reduce((s, i) => s + i.price, 0) : 0
    return { total, owed }
  })
}

/** Recent sales/deliveries of this SKU so staff can pick which one is coming back. */
export async function returnCandidates(sku: string) {
  return db
    .select({
      itemId: orderItems.id,
      orderId: orders.id,
      status: orderItems.status,
      price: orderItems.price,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      createdAt: orders.createdAt,
      kind: orders.kind,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(variants, eq(variants.id, orderItems.variantId))
    .where(and(eq(variants.sku, sku.trim().toUpperCase()), inArray(orderItems.status, ['sold', 'out'])))
    .orderBy(desc(orderItems.id))
    .limit(6)
}

export async function processReturn(input: { itemId: number; mode: 'refund' | 'exchange'; refundMethod: Payment | null }, who: SessionUser) {
  if (input.mode === 'refund' && !input.refundMethod) throw new Error('Choose how you gave the money back.')
  return db.transaction(async (t) => {
    // Only flips sold -> returned once, even if tapped twice.
    const [item] = await t
      .update(orderItems)
      .set({ status: 'returned' })
      .where(and(eq(orderItems.id, input.itemId), eq(orderItems.status, 'sold')))
      .returning({ id: orderItems.id, price: orderItems.price, variantId: orderItems.variantId, orderId: orderItems.orderId })
    if (!item) throw new Error('This item is not marked as sold, so it cannot be returned here.')
    const [order] = await t.select({ customerName: orders.customerName, customerPhone: orders.customerPhone }).from(orders).where(eq(orders.id, item.orderId))

    const exchange = input.mode === 'exchange'
    await changeStock(t, item.variantId, 1, exchange ? 'exchange_in' : 'return', who, item.orderId, exchange ? 'Brought back for exchange' : 'Returned for refund')
    const [refund] = await t
      .insert(refunds)
      .values({ orderItemId: item.id, amount: item.price, method: exchange ? 'credit' : input.refundMethod!, userId: who.id })
      .returning({ id: refunds.id })
    return { refundId: refund.id, amount: item.price, customerName: order.customerName, customerPhone: order.customerPhone }
  })
}

/* ---------------- Reports (admin) ---------------- */

const DAYS = { today: 0, week: 6, month: 29 } as const
export type Range = keyof typeof DAYS

/** Shop time is Kigali (UTC+2 all year, no daylight saving). */
const SHOP_UTC_OFFSET_HOURS = 2

/** Start of the range: midnight in Kigali, as a real UTC instant. */
function since(range: Range) {
  const offset = SHOP_UTC_OFFSET_HOURS * 3600_000
  const d = new Date(Date.now() + offset) // the Kigali wall clock, read via UTC getters
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - DAYS[range])
  return new Date(d.getTime() - offset)
}

export async function salesReport(range: Range) {
  const from = since(range)
  const soldWhere = and(eq(orderItems.status, 'sold'), eq(orders.status, 'completed'), gte(orders.closedAt, from))
  // All independent, so they run at the same time (one round trip of waiting instead of six).
  const [byPayment, [refunded], [items], top, recent, [stockValue]] = await Promise.all([
    db
      .select({ payment: orders.payment, total: sql<number>`coalesce(sum(${orders.total}), 0)::int`, orders: count() })
      .from(orders)
      .where(and(eq(orders.status, 'completed'), gte(orders.closedAt, from)))
      .groupBy(orders.payment),
    db
      .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
      .from(refunds)
      .where(and(ne(refunds.method, 'credit'), gte(refunds.createdAt, from))),
    db.select({ n: count() }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(soldWhere),
    db
      .select({ name: products.name, n: count(), revenue: sql<number>`sum(${orderItems.price})::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(variants, eq(variants.id, orderItems.variantId))
      .innerJoin(products, eq(products.id, variants.productId))
      .where(soldWhere)
      .groupBy(products.id, products.name)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({
        ...orderColumns,
        items: sql<number>`(select count(*)::int from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.createdBy))
      .where(gte(orders.createdAt, from))
      .orderBy(desc(orders.id))
      .limit(50),
    db
      .select({
        retail: sql<number>`coalesce(sum(${variants.qty} * ${products.price}), 0)::int`,
        cost: sql<number>`coalesce(sum(${variants.qty} * coalesce(${products.cost}, 0)), 0)::int`,
        pieces: sql<number>`coalesce(sum(${variants.qty}), 0)::int`,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.archived, false)),
  ])

  const cash = byPayment.find((p) => p.payment === 'cash')?.total ?? 0
  const momo = byPayment.find((p) => p.payment === 'momo')?.total ?? 0
  return {
    cash,
    momo,
    refunded: refunded.total,
    net: cash + momo - refunded.total,
    orders: byPayment.reduce((s, p) => s + p.orders, 0),
    itemsSold: items.n,
    top,
    recent,
    stockValue,
  }
}

export async function openDeliveryCount() {
  const [row] = await db.select({ n: count() }).from(orders).where(and(eq(orders.kind, 'delivery'), eq(orders.status, 'out')))
  return row.n
}

export async function isOwnOrder(orderId: number, userId: string) {
  const [row] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.createdBy, userId)))
  return !!row
}
