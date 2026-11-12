import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { auth } from './auth'
import { currentUser } from './session.server'
import { createStaff, staffCount } from './staff.server'

export const getMe = createServerFn({ method: 'GET' }).handler(async () => currentUser())

export const needsSetup = createServerFn({ method: 'GET' }).handler(async () => (await staffCount()) === 0)

/** First run only: creates the owner (admin) account and signs them in. */
export const setupOwner = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(80),
      username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._]+$/, 'Use letters, numbers, dot or underscore'),
      password: z.string().min(8, 'Use at least 8 characters').max(128),
    }),
  )
  .handler(async ({ data }) => {
    if ((await staffCount()) > 0) throw new Error('Setup is already done. Sign in instead.')
    await createStaff({ ...data, role: 'admin' })
    // Signs in and sets the session cookie (via the TanStack Start cookie plugin).
    await auth.api.signInUsername({ body: { username: data.username, password: data.password }, headers: getRequest().headers })
    return { ok: true }
  })
