import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { homeQuery } from '~/lib/queries'
import { authClient } from '~/lib/auth-client'
import { Icon, TabBar } from '~/components/ui'
import { rwf } from '~/lib/format'

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQuery),
  component: Home,
})

function Home() {
  const { data: s } = useSuspenseQuery(homeQuery)
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const alerts = s.lowCount + s.soldOutCount

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    await router.invalidate()
    router.history.push('/login')
  }

  return (
    <div className="page">
      <div className="topbar">
        <span className="title">Primo</span>
        <button className="linkbtn muted small" style={{ textDecoration: 'none' }} onClick={signOut}>
          {user.name} · Sign out
        </button>
      </div>

      <Link to="/scan" className="scan-hero">
        <Icon name="scan" size={40} />
        <strong>Scan item</strong>
        <span>To sell, send out or return</span>
      </Link>

      {user.role === 'admin' && (
        <Link to="/admin/new" className="btn mt8">+ Add new item</Link>
      )}

      <div className="list mt32">
        <Row to="/deliveries" label="Out for delivery" value={String(s.outForDelivery)} />
        <Row to="/stock" label="Stock" value={`${s.pieces.toLocaleString()} pieces`} />
        {s.today && <Row to="/admin" label="Sold today" value={`${s.today.itemsSold} · ${rwf(s.today.net)}`} />}
        <Row
          to="/alerts"
          label="Running low"
          value={alerts === 0 ? 'All good' : `${s.lowCount} low · ${s.soldOutCount} sold out`}
          danger={alerts > 0}
        />
        {user.role === 'admin' && <Row to="/admin/users" label="Staff" value="" />}
      </div>

      <TabBar user={user} alerts={alerts} />
    </div>
  )
}

function Row({ to, label, value, danger }: { to: string; label: string; value: string; danger?: boolean }) {
  return (
    <Link to={to} className="list-row">
      <span className="grow">{label}</span>
      <span className={`value ${danger ? 'red' : ''}`}>{value}</span>
      <Icon name="chev" size={18} className="chev" />
    </Link>
  )
}
