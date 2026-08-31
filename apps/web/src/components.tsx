import type { ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useHealth } from './api'

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-zinc-800 text-zinc-300',
  running: 'bg-blue-500/15 text-blue-400',
  succeeded: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-zinc-800 text-zinc-400',
  interrupted: 'bg-amber-500/15 text-amber-400',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-zinc-800 text-zinc-300'}`}
    >
      {status === 'running' && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
      )}
      {status}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ${className}`}>
      {children}
    </div>
  )
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-4 text-xl font-semibold text-zinc-100">{children}</h1>
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
    ghost: 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800',
    danger: 'border border-red-900 text-red-400 hover:bg-red-950',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

function HealthDot() {
  const { data, isError } = useHealth()
  const up = !!data && !isError
  return (
    <span className="flex items-center gap-2 text-xs text-zinc-400">
      <span className={`h-2 w-2 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-500'}`} />
      {up ? `daemon v${data.version}` : 'daemon offline'}
    </span>
  )
}

export function Layout() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 pb-16">
      <header className="mb-8 flex items-center justify-between border-b border-zinc-800 py-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold tracking-tight text-zinc-100">
            issue<span className="text-indigo-400">ops</span>
          </Link>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
        </div>
        <HealthDot />
      </header>
      <Outlet />
    </div>
  )
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

export function duration(start: string | null, end: string | null): string {
  if (!start) return '—'
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start)
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
