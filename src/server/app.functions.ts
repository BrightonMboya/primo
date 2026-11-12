import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { adminOnly, authed } from './middleware'
import { db, schema } from './db/index'
import { addVariant, changeStock, createProduct, getProductDetail, getVariantDetail, listProducts, lookup, lowStock, scan, totalPieces } from './inventory.server'
import {
  checkout,
  closeDelivery,
  getOrder,
  isOwnOrder,
  openDeliveries,
  openDeliveryCount,
  processReturn,
  returnCandidates,
  salesReport,
} from './orders.server'
import { savePhoto } from './storage.server'
import { createStaff, listStaff, setStaffActive, setStaffPassword, setStaffRole } from './staff.server'

const money = z.number().int().min(0).max(100_000_000)
const text = (max: number) => z.string().trim().max(max)
const id = z.number().int().positive()
const phone = z
  .string()
  .trim()
  .min(7, 'Enter the customer phone number')
  .max(20)
  .regex(/^[+\d\s()-]+$/, 'Phone number can only contain digits')
const photoInput = z.string().max(4_500_000).nullable().optional()

/* ---------- Home & alerts ---------- */

export const homeSummary = createServerFn({ method: 'GET' })
  .middleware([authed])
  .handler(async ({ context }) => {
    const isAdmin = context.user.role === 'admin'
    const [pieces, outForDelivery, low, r] = await Promise.all([
      totalPieces(),
      openDeliveryCount(),
      lowStock(),
      isAdmin ? salesReport('today') : null,
    ])
    return {
      pieces,
      outForDelivery,
      lowCount: low.filter((l) => l.qty > 0).length,
      soldOutCount: low.filter((l) => l.qty === 0).length,
      today: r ? { itemsSold: r.itemsSold, net: r.net } : null,
    }
  })

export const getAlerts = createServerFn({ method: 'GET' })
  .middleware([authed])
  .handler(async () => lowStock())

/* ---------- Lookup & stock ---------- */

export const lookupCode = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ code: text(80).min(1) }))
  .handler(async ({ data }) => lookup(data.code))

/** A scanned or typed code: returns the item details in the same request. */
export const scanCode = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ code: text(80).min(1) }))
  .handler(async ({ data, context }) => scan(data.code, context.user))

export const getItem = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ sku: text(80).min(1) }))
  .handler(async ({ data, context }) => getVariantDetail(data.sku, context.user))

export const getProducts = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ q: text(80).default('') }))
  .handler(async ({ data, context }) => listProducts(data.q, context.user))

export const getProduct = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => getProductDetail(data.id, context.user))

const variantInput = z.object({
  color: text(30).min(1),
  size: text(12).min(1),
  qty: z.number().int().min(0).max(10_000),
})

export const saveNewProduct = createServerFn({ method: 'POST' })
  .middleware([adminOnly])
  .validator(
    z.object({
      name: text(120).min(1, 'Enter a name'),
      brand: text(60).optional(),
      category: text(60).optional(),
      price: money.min(1, 'Enter a price'),
      cost: money.nullable().optional(),
      lowStockAt: z.number().int().min(0).max(1000),
      photo: photoInput,
      variants: z.array(variantInput).min(1, 'Add at least one colour and size').max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    const photo = data.photo ? await savePhoto(data.photo) : null
    return createProduct({ ...data, photo }, context.user)
  })

export const updateProduct = createServerFn({ method: 'POST' })
  .middleware([adminOnly])
  .validator(
    z.object({
      id,
      name: text(120).min(1),
      brand: text(60).optional(),
      category: text(60).optional(),
      price: money.min(1),
      cost: money.nullable().optional(),
      lowStockAt: z.number().int().min(0).max(1000),
      photo: photoInput,
      archived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const photo = data.photo?.startsWith('data:') ? await savePhoto(data.photo) : undefined
    await db
      .update(schema.products)
      .set({
        name: data.name,
        brand: data.brand || null,
        category: data.category || null,
        price: data.price,
        cost: data.cost ?? null,
        lowStockAt: data.lowStockAt,
        archived: data.archived ?? false,
        ...(photo ? { photo } : {}),
      })
      .where(eq(schema.products.id, data.id))
    return { ok: true }
  })

/** Restock or correct counts after a stock take (admin). */
export const adjustStock = createServerFn({ method: 'POST' })
  .middleware([adminOnly])
  .validator(
    z.object({
      productId: id,
      changes: z.array(z.object({ variantId: id, newQty: z.number().int().min(0).max(10_000) })).max(200),
      add: z.array(variantInput).max(50).default([]),
      note: text(120).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await db.transaction(async (t) => {
      const [product] = await t.select().from(schema.products).where(eq(schema.products.id, data.productId))
      if (!product) throw new Error('Product not found.')
      for (const c of data.changes) {
        const [v] = await t
          .select({ qty: schema.variants.qty })
          .from(schema.variants)
          .where(and(eq(schema.variants.id, c.variantId), eq(schema.variants.productId, product.id)))
          .for('update')
        if (!v) throw new Error('Variant does not belong to this product.')
        const delta = c.newQty - v.qty
        if (delta !== 0) {
          await changeStock(t, c.variantId, delta, delta > 0 ? 'stock_in' : 'adjust', context.user, null, data.note || (delta > 0 ? 'Restock' : 'Stock count'))
        }
      }
      for (const a of data.add) await addVariant(t, product.id, product.code, a.color, a.size, a.qty, context.user)
    })
    return { ok: true }
  })

/* ---------- Sales, deliveries, returns ---------- */

export const doCheckout = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator(
    z
      .object({
        kind: z.enum(['sale', 'delivery']),
        variantIds: z.array(id).min(1).max(50),
        customerName: text(80).min(1, 'Enter the customer name'),
        customerPhone: phone,
        channel: z.enum(['shop', 'instagram']),
        payment: z.enum(['cash', 'momo']).nullable(),
        momoRef: text(40).optional(),
        deliveryFee: money.optional(),
        creditRefundId: id.nullable().optional(),
      })
      .refine((d) => d.kind === 'delivery' || d.payment !== null, { message: 'Choose Cash or MoMo', path: ['payment'] }),
  )
  .handler(async ({ data, context }) => checkout(data, context.user))

export const getDeliveries = createServerFn({ method: 'GET' })
  .middleware([authed])
  .handler(async () => openDeliveries())

export const getOrderDetail = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    const found = await getOrder(data.id)
    if (!found) return null
    // Sales staff see open deliveries and their own receipts only.
    if (context.user.role !== 'admin' && found.order.status !== 'out' && !(await isOwnOrder(data.id, context.user.id))) {
      throw new Error('Only an admin can see past orders.')
    }
    return found
  })

export const finishDelivery = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator(
    z.object({
      orderId: id,
      kept: z.array(id),
      returned: z.array(id),
      payment: z.enum(['cash', 'momo']).nullable(),
      momoRef: text(40).optional(),
    }),
  )
  .handler(async ({ data, context }) => closeDelivery(data, context.user))

export const getReturnCandidates = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator(z.object({ sku: text(80).min(1) }))
  .handler(async ({ data }) => returnCandidates(data.sku))

export const doReturn = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator(z.object({ itemId: id, mode: z.enum(['refund', 'exchange']), refundMethod: z.enum(['cash', 'momo']).nullable() }))
  .handler(async ({ data, context }) => processReturn(data, context.user))

/* ---------- Admin: money & staff ---------- */

export const getReport = createServerFn({ method: 'GET' })
  .middleware([adminOnly])
  .validator(z.object({ range: z.enum(['today', 'week', 'month']) }))
  .handler(async ({ data }) => salesReport(data.range))

export const getUsers = createServerFn({ method: 'GET' })
  .middleware([adminOnly])
  .handler(async () => listStaff())

export const createUser = createServerFn({ method: 'POST' })
  .middleware([adminOnly])
  .validator(
    z.object({
      name: text(80).min(1),
      username: text(30).min(3).regex(/^[a-zA-Z0-9._]+$/, 'Use letters, numbers, dot or underscore'),
      password: z.string().min(8, 'Password needs at least 8 characters').max(128),
      role: z.enum(['admin', 'sales']),
    }),
  )
  .handler(async ({ data }) => {
    await createStaff(data)
    return { ok: true }
  })

export const updateUser = createServerFn({ method: 'POST' })
  .middleware([adminOnly])
  .validator(
    z.object({
      id: z.string().min(1).max(64),
      role: z.enum(['admin', 'sales']).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8).max(128).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.id === context.user.id && (data.active === false || data.role === 'sales')) {
      throw new Error('You cannot remove your own admin access.')
    }
    if (data.role) await setStaffRole(data.id, data.role)
    if (data.active !== undefined) await setStaffActive(data.id, data.active)
    if (data.password) await setStaffPassword(data.id, data.password)
    return { ok: true }
  })
