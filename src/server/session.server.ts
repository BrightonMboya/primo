import { getRequest } from '@tanstack/react-start/server'
import { auth } from './auth.ts'
import type { Role, SessionUser } from '../lib/types.ts'

/** The signed-in staff member for this request, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session || session.user.banned) return null
  const role: Role = session.user.role === 'admin' ? 'admin' : 'sales'
  return {
    id: session.user.id,
    name: session.user.name,
    username: session.user.displayUsername ?? session.user.username ?? '',
    role,
  }
}
