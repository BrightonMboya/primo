import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'

/**
 * DATABASE_URL set   -> real Postgres (Supabase). Use the pooler URL (port 6543) on Vercel.
 * DATABASE_URL unset -> a local Postgres (PGlite) stored in ./data/pglite, for development.
 */
export type DB = ReturnType<typeof drizzle<typeof schema>>
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
export type Executor = DB | Tx

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL
  if (url) {
    // Supabase's transaction pooler (port 6543, used on Vercel) can't keep prepared statements,
    // which costs an extra round trip per query. Anything else (the session pooler on 5432, used
    // for a long-running server) keeps them, so each query is a single round trip.
    const transactionPooler = new URL(url).port === '6543'
    const client = postgres(url, { prepare: !transactionPooler, max: Number(process.env.DATABASE_POOL_SIZE ?? 6) })
    if (!transactionPooler) {
      // Drizzle sends every query as "not prepared", which makes Postgres answer in two round
      // trips. Prepared (cached per connection) it is one. ~240 ms saved per query from Kigali.
      const unsafe = client.unsafe.bind(client)
      client.unsafe = ((query: string, args?: any, options?: any) => unsafe(query, args, { ...options, prepare: true })) as typeof client.unsafe
    }
    return drizzle(client, { schema })
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle: drizzleLite } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const dir = path.join(process.env.PRIMO_DATA_DIR ?? path.resolve(process.cwd(), 'data'), 'pglite')
  mkdirSync(dir, { recursive: true })
  const local = drizzleLite(new PGlite(dir), { schema })
  await migrate(local, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') })
  // Same query API as the Postgres driver; only the connection differs.
  return local as unknown as DB
}

const globalKey = Symbol.for('primo.db')
type GlobalWithDb = typeof globalThis & { [globalKey]?: Promise<DB> }
const g = globalThis as GlobalWithDb

/** One shared connection per server process (survives dev hot reloads). */
export const db: DB = await (g[globalKey] ??= connect())
export { schema }
