import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { needsSetup, setupOwner } from '~/server/auth.functions'
import { useAction } from '~/components/ui'
import { useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    if (!(await needsSetup())) throw redirect({ to: '/login' })
  },
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(() => setupOwner({ data: { name, username, password } }))
    if (!ok) return
    queryClient.clear() // forget anything cached from before signing in
    await router.invalidate()
    router.history.push('/')
  }

  return (
    <form className="page no-tabs" onSubmit={submit}>
      <div style={{ paddingTop: 60 }}>
        <h1 className="title" style={{ fontSize: 28 }}>Welcome to Primo</h1>
        <p className="muted mt8">Create the owner account. This account is an admin and can add staff later.</p>
      </div>
      <div className="stack mt32">
        <label className="field">
          <span className="label">Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Username</span>
          <input className="input" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Password (8+ characters)</span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary mt16" disabled={busy}>{busy ? 'Creating…' : 'Create owner account'}</button>
      </div>
    </form>
  )
}
