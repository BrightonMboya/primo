import { useState, type ReactNode } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import type { SessionUser } from '~/lib/types'

/** Supabase photos are full URLs; local-dev photos are bare file names served by /api/photos. */
export function photoUrl(src: string): string {
  return /^(https?:|\/|data:)/.test(src) ? src : `/api/photos/${src}`
}

export function Photo({ src, className = 'thumb', alt = '' }: { src: string | null | undefined; className?: string; alt?: string }) {
  return (
    <div className={`photo ${className}`}>
      {src ? <img src={photoUrl(src)} alt={alt} loading="lazy" /> : <Icon name="shirt" size={className === 'hero' ? 56 : 22} />}
    </div>
  )
}

const paths: Record<string, ReactNode> = {
  chev: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  scan: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3" />
    </>
  ),
  stock: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  truck: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  check: <path d="M5 12l5 5 9-10" />,
  shirt: <path d="M8 3c1 2 7 2 8 0l5 3-2 5-2-1v11H7V10l-2 1-2-5z" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
}

export function Icon({ name, size = 22, className }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  )
}

export function TopBar({ title, back, right }: { title?: string; back?: string | (() => void); right?: ReactNode }) {
  const router = useRouter()
  const onBack = typeof back === 'function' ? back : back ? () => router.navigate({ to: back }) : () => router.history.back()
  return (
    <div className="topbar">
      <button className="side" onClick={onBack} type="button">Back</button>
      {title ? <h1>{title}</h1> : <span className="grow" />}
      <div className="side right">{right}</div>
    </div>
  )
}

export function TabBar({ user, alerts = 0 }: { user: SessionUser; alerts?: number }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const tabs = [
    { to: '/', label: 'Home', icon: 'home' },
    { to: '/stock', label: 'Stock', icon: 'stock' },
    ...(user.role === 'admin' ? [{ to: '/admin', label: 'Sales', icon: 'chart' }] : []),
  ]
  return (
    <nav className="tabbar no-print">
      {tabs.map((t) => {
        const active = t.to === '/' ? path === '/' : path.startsWith(t.to)
        return (
          <Link key={t.to} to={t.to} className={active ? 'active' : ''}>
            <Icon name={t.icon} size={24} />
            <span>
              {t.label}
              {t.to === '/stock' && alerts > 0 ? ' •' : ''}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`choice ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="dot" />
      <span className="grow">{children}</span>
    </button>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

/** Runs an async action with a busy flag and a readable error message. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(readableError(err))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

export function readableError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Zod errors arrive as a JSON array of issues.
  try {
    const parsed = JSON.parse(msg)
    if (Array.isArray(parsed) && parsed[0]?.message) return parsed[0].message
  } catch {}
  return msg || 'Something went wrong.'
}
