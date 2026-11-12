import { and, count, eq } from 'drizzle-orm'
import { auth } from './auth.ts'
import { db, schema } from './db/index.ts'
import type { Role } from '../lib/types.ts'

/**
 * Staff management goes straight through Better Auth's internal adapter.
 * Callers (admin-only server functions, setup, seed) check permissions first.
 */
export async function createStaff(input: { name: string; username: string; password: string; role: Role }) {
  const ctx = await auth.$context
  const uname = input.username.trim().toLowerCase()
  const taken = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.username, uname))
  if (taken.length) throw new Error('That username is taken.')
  const created = await ctx.internalAdapter.createUser({
    name: input.name.trim(),
    // Better Auth needs an email; staff sign in with their username instead.
    email: `${uname}@staff.primo.local`,
    emailVerified: true,
    username: uname,
    displayUsername: input.username.trim(),
    role: input.role,
  }, { method: 'admin' })
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(input.password),
  })
  return created.id
}

export async function setStaffPassword(userId: string, password: string) {
  if (password.length < 8) throw new Error('Password needs at least 8 characters.')
  const ctx = await auth.$context
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password))
  await ctx.internalAdapter.deleteUserSessions(userId)
}

export async function setStaffRole(userId: string, role: Role) {
  await guardLastAdmin(userId, role === 'sales')
  await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId))
  const ctx = await auth.$context
  await ctx.internalAdapter.deleteUserSessions(userId)
}

export async function setStaffActive(userId: string, active: boolean) {
  await guardLastAdmin(userId, !active)
  await db.update(schema.user).set({ banned: !active, banReason: active ? null : 'Switched off by admin', updatedAt: new Date() }).where(eq(schema.user.id, userId))
  if (!active) {
    const ctx = await auth.$context
    await ctx.internalAdapter.deleteUserSessions(userId)
  }
}

async function guardLastAdmin(userId: string, losingAdmin: boolean) {
  if (!losingAdmin) return
  const [target] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, userId))
  if (target?.role !== 'admin') return
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.user)
    .where(and(eq(schema.user.role, 'admin'), eq(schema.user.banned, false)))
  if (n <= 1) throw new Error('Keep at least one active admin.')
}

export async function staffCount() {
  const [{ n }] = await db.select({ n: count() }).from(schema.user)
  return n
}

export async function listStaff() {
  return db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.displayUsername,
      role: schema.user.role,
      banned: schema.user.banned,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(schema.user.banned, schema.user.name)
}
