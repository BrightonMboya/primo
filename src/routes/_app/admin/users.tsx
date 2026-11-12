import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createUser, updateUser } from '~/server/app.functions'
import { usersQuery, useRefresh } from '~/lib/queries'
import { TopBar, useAction } from '~/components/ui'

export const Route = createFileRoute('/_app/admin/users')({
  loader: ({ context }) => context.queryClient.ensureQueryData(usersQuery),
  component: Users,
})

function Users() {
  const { data: users } = useSuspenseQuery(usersQuery)
  const { user: me } = Route.useRouteContext()
  const refresh = useRefresh()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'sales' | 'admin'>('sales')
  const add = useAction()
  const edit = useAction()

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const ok = await add.run(() => createUser({ data: { name, username, password, role } }))
    if (!ok) return
    setName('')
    setUsername('')
    setPassword('')
    setRole('sales')
    await refresh(usersQuery.queryKey)
  }

  async function change(id: string, data: { role?: 'admin' | 'sales'; active?: boolean; password?: string }) {
    const ok = await edit.run(() => updateUser({ data: { id, ...data } }))
    if (ok) await refresh(usersQuery.queryKey)
  }

  return (
    <div className="page no-tabs">
      <TopBar title="Staff" back="/admin" />
      <p className="small muted mt16">
        <strong>Sales</strong> can scan, sell, send out deliveries and take returns. They do not see money totals, reports, cost prices or staff.
        <br />
        <strong>Admin</strong> sees and changes everything.
      </p>

      <div className="list mt16">
        {users.map((u) => (
          <div key={u.id} className="list-row" style={{ cursor: 'default', flexWrap: 'wrap', opacity: u.banned ? 0.5 : 1 }}>
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{u.name}{u.id === me.id ? ' (you)' : ''}</div>
              <div className="small muted">@{u.username} · {u.role === 'admin' ? 'Admin' : 'Sales'}{u.banned ? ' · switched off' : ''}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={() => change(u.id, { role: u.role === 'admin' ? 'sales' : 'admin' })}>
                Make {u.role === 'admin' ? 'sales' : 'admin'}
              </button>
              <button className="btn small" onClick={() => {
                const pw = window.prompt(`New password for ${u.name} (8+ characters)`)
                if (pw) change(u.id, { password: pw })
              }}>Password</button>
              {u.id !== me.id && (
                <button className={`btn small ${u.banned ? '' : 'danger'}`} onClick={() => change(u.id, { active: !!u.banned })}>
                  {u.banned ? 'Switch on' : 'Switch off'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {edit.error && <p className="error">{edit.error}</p>}

      <form onSubmit={create}>
        <p className="section-label">Add staff</p>
        <div className="stack">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" placeholder="Password (8+ characters)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="segment">
            <button type="button" className={role === 'sales' ? 'on' : ''} onClick={() => setRole('sales')}>Sales</button>
            <button type="button" className={role === 'admin' ? 'on' : ''} onClick={() => setRole('admin')}>Admin</button>
          </div>
          {add.error && <p className="error">{add.error}</p>}
          <button className="btn primary" disabled={add.busy || !name || !username || !password}>Add staff member</button>
        </div>
      </form>
    </div>
  )
}
