import { createMiddleware } from '@tanstack/react-start'
import { currentUser } from './session.server'

/** Any signed-in, active staff member (admin or sales). */
export const authed = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await currentUser()
  if (!user) throw new Error('Please sign in again.')
  return next({ context: { user } })
})

/** Admin only: money, product setup, staff. */
export const adminOnly = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await currentUser()
  if (!user) throw new Error('Please sign in again.')
  if (user.role !== 'admin') throw new Error('Only an admin can do this.')
  return next({ context: { user } })
})
