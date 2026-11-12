import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { needsSetup } from '~/server/auth.functions'
import { authClient } from '~/lib/auth-client'
import { useAction } from '~/components/ui'
import { useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ next: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    if (context.user) throw redirect({ to: '/' })
    if (await needsSetup()) throw redirect({ to: '/setup' })
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { next } = Route.useSearch()
  const { busy, error, run } = useAction()

  // Read the boxes on submit (not on typing) so phone autofill / password managers work.
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const ok = await run(async () => {
      if (!username || !password) throw new Error('Enter your username and password.')
      const res = await authClient.signIn.username({ username, password })
      if (res.error) throw new Error(res.error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Wrong username or password.')
      return true
    })
    if (!ok) return
    queryClient.clear() // forget anything cached from before signing in
    await router.invalidate()
    // Only follow same-site paths after login.
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    router.history.push(safe)
  }

  return (
    <form className="page no-tabs" method="post" onSubmit={submit}>
      <div style={{ paddingTop: 80 }}>
        <h1 className="title" style={{ fontSize: 28 }}>Primo</h1>
        <p className="muted mt8">Sign in to the shop.</p>
      </div>
      <div className="stack mt32">
        <label className="field">
          <span className="label">Username</span>
          <input className="input" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input className="input" name="password" type="password" autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary mt16" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  )
}
