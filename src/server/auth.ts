import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, username } from 'better-auth/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db, schema } from './db/index.ts'

const DAY = 60 * 60 * 24

function trustedOrigins(): string[] {
  const list = (process.env.TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (process.env.VERCEL_URL) list.push(`https://${process.env.VERCEL_URL}`)
  // Local testing: allow the computer itself and temporary Cloudflare tunnel links (phone testing).
  if (process.env.NODE_ENV !== 'production') list.push('http://localhost:3210', 'http://127.0.0.1:3210', 'https://*.trycloudflare.com')
  return list
}

/**
 * Logins: username + password (no email needed for staff).
 * Roles: "admin" sees everything, "sales" records sales, deliveries and returns.
 * New accounts are only created by an admin (public sign-up is off).
 */
export const auth = betterAuth({
  appName: 'Primo',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  session: {
    expiresIn: 14 * DAY,
    updateAge: DAY,
    // Keep a signed copy of the session in a cookie for 2 minutes so most requests
    // don't need a database round trip just to check who is signed in.
    // (A disabled staff member is locked out within those 2 minutes.)
    cookieCache: { enabled: true, maxAge: 2 * 60 },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 60,
    customRules: { '/sign-in/username': { window: 60, max: 8 } },
  },
  plugins: [
    username(),
    admin({
      roles: { admin: adminAc, sales: userAc },
      adminRoles: ['admin'],
      defaultRole: 'sales',
    }),
    tanstackStartCookies(), // must stay last
  ],
})
