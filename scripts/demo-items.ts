// Adds 4 demo items (with photos) to the real database, recorded as added by the owner.
//   node --env-file=.env --experimental-strip-types scripts/demo-items.ts <photo-dir>
// Remove them later with scripts/remove-demo-items.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/server/db/index.ts'
import { createProduct } from '../src/server/inventory.server.ts'
import { savePhoto } from '../src/server/storage.server.ts'
import type { SessionUser } from '../src/lib/types.ts'

const photoDir = process.argv[2]
if (!photoDir) throw new Error('Pass the folder with the demo photos')

const [owner] = await db.select().from(schema.user).where(eq(schema.user.role, 'admin')).limit(1)
if (!owner) throw new Error('Create the owner account first')
const who: SessionUser = { id: owner.id, name: owner.name, username: owner.username ?? '', role: 'admin' }

const existing = await db.select({ n: schema.products.id }).from(schema.products)
if (existing.length > 0) {
  console.log(`There are already ${existing.length} items. Not adding demo items twice.`)
  process.exit(0)
}

async function photo(file: string) {
  const buf = await sharp(readFileSync(path.join(photoDir, file))).rotate().resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()
  return savePhoto(`data:image/jpeg;base64,${buf.toString('base64')}`)
}

const grid = (colors: string[], sizes: string[], qty: (c: string, s: string) => number) =>
  colors.flatMap((color) => sizes.map((size) => ({ color, size, qty: qty(color, size) })))

const bodyQty: Record<string, Record<string, number>> = {
  White: { S: 5, M: 2, L: 3 },
  Red: { S: 4, M: 2, L: 3 },
  Black: { S: 5, M: 3, L: 3 },
  Khaki: { S: 2, M: 2, L: 2 },
}
const redPant: Record<string, number> = { S: 1, M: 4, L: 3, XL: 0 }
const jacket: Record<string, number> = { S: 1, M: 2, L: 2, XL: 1 }

const items = [
  { file: 'Ie0gr20Gbm0.jpg', name: 'Ribbed bodysuit', brand: 'Zara', category: 'Tops', price: 18000, cost: 9500, lowStockAt: 2, variants: grid(Object.keys(bodyQty), ['S', 'M', 'L'], (c, s) => bodyQty[c][s]) },
  { file: 'f_9EmLmQYCE.jpg', name: 'Wide-leg pant', brand: 'Zara', category: 'Bottoms', price: 22000, cost: 12000, lowStockAt: 1, variants: grid(['Red', 'Black'], ['S', 'M', 'L', 'XL'], (c, s) => (c === 'Red' ? redPant[s] : 3)) },
  { file: 'J35muhi0am4.jpg', name: 'Satin dress', brand: 'H&M', category: 'Dresses', price: 26000, cost: 14000, lowStockAt: 1, variants: grid(['Brown', 'Black'], ['S', 'M', 'L'], () => 2) },
  { file: '_BDBEP0ePQc.jpg', name: 'Denim jacket', brand: "Levi's", category: 'Outerwear', price: 45000, cost: 26000, lowStockAt: 1, variants: grid(['Light wash'], ['S', 'M', 'L', 'XL'], (_, s) => jacket[s]) },
]

for (const { file, ...item } of items) {
  const created = await createProduct({ ...item, photo: await photo(file) }, who)
  const pieces = item.variants.reduce((s, v) => s + v.qty, 0)
  console.log(`added ${created.code}  ${item.name}  (${item.variants.length} sizes/colours, ${pieces} pieces)`)
}
process.exit(0)
