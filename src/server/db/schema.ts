import { relations, sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Better Auth tables (core + username + admin plugins + rate limit)   */
/* ------------------------------------------------------------------ */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  role: text('role').default('sales'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Login rate limiting must live in the database on serverless hosts. */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

/* ------------------------------------------------------------------ */
/* Shop tables. Money is in whole Rwandan francs (integer).                         */
/* ------------------------------------------------------------------ */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  brand: text('brand'),
  category: text('category'),
  price: integer('price').notNull(),
  cost: integer('cost'),
  photo: text('photo'),
  lowStockAt: integer('low_stock_at').notNull().default(2),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
})

export const variants = pgTable(
  'variants',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    color: text('color').notNull(),
    size: text('size').notNull(),
    sku: text('sku').notNull().unique(),
    qty: integer('qty').notNull().default(0),
  },
  (t) => [
    unique('variants_product_color_size').on(t.productId, t.color, t.size),
    index('variants_product_idx').on(t.productId),
    // The database itself refuses negative stock, even with two phones selling at once.
    check('variants_qty_not_negative', sql`${t.qty} >= 0`),
  ],
)

export const orders = pgTable(
  'orders',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind', { enum: ['sale', 'delivery'] }).notNull(),
    status: text('status', { enum: ['completed', 'out', 'returned'] }).notNull(),
    channel: text('channel', { enum: ['shop', 'instagram'] }).notNull(),
    payment: text('payment', { enum: ['cash', 'momo'] }),
    momoRef: text('momo_ref'),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    area: text('area'),
    deliveryFee: integer('delivery_fee').notNull().default(0),
    credit: integer('credit').notNull().default(0),
    total: integer('total').notNull().default(0),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('orders_created_idx').on(t.createdAt), index('orders_status_idx').on(t.kind, t.status)],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id),
    price: integer('price').notNull(),
    status: text('status', { enum: ['out', 'sold', 'returned'] }).notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_variant_idx').on(t.variantId, t.status)],
)

/** Every stock change and who made it: the audit trail. */
export const movements = pgTable(
  'movements',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    orderId: integer('order_id').references(() => orders.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('movements_variant_idx').on(t.variantId, t.createdAt)],
)

/** Money given back. Exchanges are recorded as 'credit' and used on the next order. */
export const refunds = pgTable('refunds', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  orderItemId: integer('order_item_id')
    .notNull()
    .references(() => orderItems.id),
  amount: integer('amount').notNull(),
  method: text('method', { enum: ['cash', 'momo', 'credit'] }).notNull(),
  usedOrderId: integer('used_order_id').references(() => orders.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
})

export const productRelations = relations(products, ({ many }) => ({ variants: many(variants) }))
export const variantRelations = relations(variants, ({ one }) => ({
  product: one(products, { fields: [variants.productId], references: [products.id] }),
}))
