// End-to-end checks against a running server (npm run build && npm start).
//   BASE=http://localhost:3210 node tests/e2e.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { toJSONAsync } from 'seroval'

const BASE = process.env.BASE ?? 'http://localhost:3210'
// The id -> function name table lives in the server-fn resolver chunk.
const resolver = readdirSync('dist/server/assets').find((f) => f.includes('server-fn-resolver'))
const manifest = readFileSync(resolver ? `dist/server/assets/${resolver}` : 'dist/server/server.js', 'utf8')
const ids = {}
for (const m of manifest.matchAll(/"([0-9a-f]{64})": \{\s*functionName: "(\w+)_createServerFn_handler"/g)) ids[m[2]] = m[1]

let failures = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) failures++
}

async function call(name, data, cookie, method = 'POST') {
  const id = ids[name]
  if (!id) throw new Error(`unknown fn ${name}`)
  const payload = data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data }))
  let url = `${BASE}/_serverFn/${id}`
  const headers = { 'x-tsr-serverFn': 'true', accept: 'application/json', origin: BASE }
  if (cookie) headers.cookie = cookie
  let body
  if (method === 'GET') {
    if (payload) url += `?payload=${encodeURIComponent(payload)}`
  } else {
    body = payload
    headers['content-type'] = 'application/json'
  }
  const res = await fetch(url, { method, headers, body })
  const setCookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('primo_session='))
  const text = await res.text()
  let decoded
  try {
    decoded = decode(JSON.parse(text))
  } catch {
    decoded = text
  }
  let value = decoded
  let error = !res.ok ? String(text).slice(0, 200) : null
  if (decoded && typeof decoded === 'object' && ('result' in decoded || 'error' in decoded)) {
    value = decoded.result
    if (typeof decoded.error === 'string') error = decoded.error.replace('__ERR__', '')
  }
  if (error) value = undefined
  return { status: res.status, value, error, cookie: setCookie }
}

// Minimal decoder for the serialized responses (objects, arrays, strings, numbers, constants, errors).
function decode(n) {
  switch (n.t) {
    case 0: return n.s
    case 1: return n.s
    case 2: return [null, undefined, true, false][n.s]
    case 5: return new Date(n.s)
    case 9: return n.a.map(decode)
    case 10:
    case 11: return Object.fromEntries(n.p.k.map((k, i) => [k, decode(n.p.v[i])]))
    case 25: return `__ERR__${decode(n.s.message)}`
    default: throw new Error(`unknown node ${n.t}`)
  }
}

const login = async (username, password) => {
  const res = await fetch(`${BASE}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) return null
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  return cookies.find((c) => c.includes('session_token')) ?? null
}

const admin = await login('owner', process.env.ADMIN_PW ?? 'primo-admin-2026')
const sales = await login('adjoa', process.env.SALES_PW ?? 'primo-sales-2026')
ok(!!admin, 'admin can sign in')
ok(!!sales, 'sales can sign in')
ok(!(await login('adjoa', 'wrong-password')), 'wrong password is rejected')

// Anonymous access is blocked
const anon = await call('homeSummary', undefined, null, 'GET')
ok(anon.error?.includes('sign in'), 'anonymous user cannot read stock')

// Role boundaries
const salesHome = await call('homeSummary', undefined, sales, 'GET')
ok(salesHome.value?.today === null, 'sales home has no money totals')
const adminHome = await call('homeSummary', undefined, admin, 'GET')
ok(typeof adminHome.value?.today?.net === 'number', 'admin home shows money totals')
ok((await call('getReport', { range: 'today' }, sales, 'GET')).error?.includes('admin'), 'sales cannot open sales report')
ok((await call('getUsers', undefined, sales, 'GET')).error?.includes('admin'), 'sales cannot list staff')
ok((await call('createUser', { name: 'X', username: 'hacker', password: 'password123', role: 'admin' }, sales)).error?.includes('admin'), 'sales cannot create users')
ok((await call('saveNewProduct', { name: 'X', price: 100, lowStockAt: 1, variants: [{ color: 'A', size: 'S', qty: 1 }] }, sales)).error?.includes('admin'), 'sales cannot add products')
const salesProducts = await call('getProducts', { q: '' }, sales, 'GET')
ok(salesProducts.value?.length > 0 && salesProducts.value.every((p) => p.cost === null), 'sales never receives cost prices')
const adminProducts = await call('getProducts', { q: '' }, admin, 'GET')
ok(adminProducts.value?.some((p) => p.cost > 0), 'admin receives cost prices')

// Sell flow as sales: stock goes down, customer details required
const item = (await call('getItem', { sku: 'PRM-0003-CHA-M' }, sales, 'GET')).value
const startQty = item?.variant?.qty
ok(startQty >= 1 && item.product.price === 26000, 'scan lookup finds item with price and qty')
const noPhone = await call('doCheckout', { kind: 'sale', variantIds: [item.variant.id], customerName: 'Test', customerPhone: '', channel: 'shop', payment: 'cash' }, sales)
ok(!!noPhone.error, 'sale without customer phone is rejected')
const sale = await call('doCheckout', { kind: 'sale', variantIds: [item.variant.id], customerName: 'Kwame', customerPhone: '0241234567', channel: 'shop', payment: 'cash' }, sales)
ok(sale.value?.total === 26000, 'sale uses server price (26,000 RWF)')
const after = (await call('getItem', { sku: 'PRM-0003-CHA-M' }, sales, 'GET')).value
ok(after.variant.qty === startQty - 1, 'stock reduced by 1 after sale')

// Refund return: stock back up
const cands = (await call('getReturnCandidates', { sku: 'PRM-0003-CHA-M' }, sales, 'GET')).value
ok(cands?.[0]?.customerName === 'Kwame', 'return finds the sale and customer')
const ret = await call('doReturn', { itemId: cands[0].itemId, mode: 'refund', refundMethod: 'cash' }, sales)
ok(ret.value?.amount === 26000, 'refund recorded')
ok((await call('getItem', { sku: 'PRM-0003-CHA-M' }, sales, 'GET')).value.variant.qty === startQty, 'stock back after return')
ok(!!(await call('doReturn', { itemId: cands[0].itemId, mode: 'refund', refundMethod: 'cash' }, sales)).error, 'same item cannot be refunded twice')

// Cannot oversell
const jacketXL = (await call('getItem', { sku: 'PRM-0004-LIG-XL' }, sales, 'GET')).value
await call('doCheckout', { kind: 'sale', variantIds: [jacketXL.variant.id], customerName: 'A', customerPhone: '0240000000', channel: 'shop', payment: 'momo' }, sales)
const oversell = await call('doCheckout', { kind: 'sale', variantIds: [jacketXL.variant.id], customerName: 'B', customerPhone: '0240000001', channel: 'shop', payment: 'momo' }, sales)
ok(oversell.error?.includes('out of stock'), 'selling a sold-out item is blocked')

// Delivery: one kept, one returned
const deliveries = (await call('getDeliveries', undefined, sales, 'GET')).value
const efua = deliveries.find((d) => d.order.customerName === '@efua.k')
ok(!!efua && efua.items.length === 2, 'open delivery is listed')
const [keep, back] = efua.items
const closed = await call('finishDelivery', { orderId: efua.order.id, kept: [keep.id], returned: [back.id], payment: 'cash' }, sales)
ok(closed.value?.total === keep.price, 'delivery closes with only the kept item charged')
const backItem = (await call('getItem', { sku: back.sku }, sales, 'GET')).value
ok(backItem.variant.qty === back.qtyLeft + 1, 'brought-back item is restocked')

// Alerts
const alerts = (await call('getAlerts', undefined, sales, 'GET')).value
ok(alerts.some((a) => a.sku === 'PRM-0004-LIG-XL' && a.qty === 0), 'sold-out item shows in alerts')

// Admin report adds up
const report = (await call('getReport', { range: 'today' }, admin, 'GET')).value
ok(report.net === report.cash + report.momo - report.refunded, 'report: net = cash + momo − refunds')

// Admin adds an item with a photo; photo is stored and served only to signed-in staff
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const created = await call('saveNewProduct', { name: `Test top ${Date.now()}`, price: 5000, lowStockAt: 1, photo: tinyPng, variants: [{ color: 'Blue', size: 'M', qty: 3 }] }, admin)
ok(created.value?.code?.startsWith('PRM-'), 'admin can add an item (gets a PRM code)')
const createdDetail = (await call('getProduct', { id: created.value.id }, admin, 'GET')).value
const photoUrl = createdDetail?.product?.photo
ok(!!photoUrl, 'photo saved with the item')
if (photoUrl?.startsWith('/')) {
  ok((await fetch(`${BASE}${photoUrl}`, { headers: { cookie: admin } })).status === 200, 'photo is served to staff')
  ok((await fetch(`${BASE}${photoUrl}`)).status === 401, 'photo is hidden from strangers')
}
ok(createdDetail?.variants?.[0]?.sku?.endsWith('-BLU-M') && createdDetail.variants[0].qty === 3, 'variant SKU and stock created')

// Cross-site POST is blocked
const csrf = await fetch(`${BASE}/_serverFn/${ids.doReturn}`, { method: 'POST', headers: { origin: 'https://evil.example', 'x-tsr-serverFn': 'true', cookie: admin } })
ok(csrf.status === 403, 'cross-site POST is blocked')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
