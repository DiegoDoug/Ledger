import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'
import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import { netWorth } from '../domain/calculations'
import { writeTheme } from '../data/repositories'
import { Button } from './ui/Button'
import {
  IconAnalytics,
  IconBudget,
  IconDashboard,
  IconList,
  IconLogo,
  IconMenu,
  IconMoon,
  IconPlus,
  IconRepeat,
  IconSearch,
  IconSettings,
  IconSun,
  IconTag,
  IconWallet,
} from './icons'

export interface NavItem {
  to: string
  label: string
  icon: (props: { className?: string }) => ReactNode
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: IconDashboard },
  { to: '/transactions', label: 'Transactions', icon: IconList },
  { to: '/accounts', label: 'Accounts', icon: IconWallet },
  { to: '/budgets', label: 'Budgets', icon: IconBudget },
  { to: '/recurring', label: 'Recurring', icon: IconRepeat },
  { to: '/analytics', label: 'Analytics', icon: IconAnalytics },
  { to: '/search', label: 'Search', icon: IconSearch },
  { to: '/categories', label: 'Categories', icon: IconTag },
]

/** Bottom bar on mobile; the rest live behind "More". */
const MOBILE_PRIMARY = ['/', '/transactions', '/budgets']

export function AppShell({
  children,
  onOpenSearch,
  onNewTransaction,
}: {
  children: ReactNode
  onOpenSearch: () => void
  onNewTransaction: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="skip-link fixed left-4 top-4 z-[70] rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">
        Skip to main content
      </a>

      <Sidebar />

      <div className="lg:pl-[240px]">
        <TopBar onOpenSearch={onOpenSearch} onNewTransaction={onNewTransaction} />
        <main id="main" tabIndex={-1} className="px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <MobileNav
        onMore={() => setMoreOpen(true)}
        onNewTransaction={onNewTransaction}
        moreOpen={moreOpen}
      />
      {moreOpen ? <MoreSheet onClose={() => setMoreOpen(false)} /> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Desktop sidebar                                                   */
/* ---------------------------------------------------------------- */

function Sidebar() {
  const { data } = useLedger()
  const format = useFormat()
  const position = netWorth(data.accounts, data.transactions)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <IconLogo className="h-7 w-7" />
        <div>
          <p className="text-[15px] font-semibold leading-none tracking-[-0.02em] text-ink">
            Ledger
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-subtle">
            Personal finance
          </p>
        </div>
      </div>

      <div className="mx-3 rounded-lg border border-line bg-surface-muted/60 px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle">Net worth</p>
        <p
          className={cn(
            'tnum mt-0.5 text-[17px] font-semibold tracking-[-0.02em]',
            position.netWorth < 0 ? 'text-negative' : 'text-ink',
          )}
        >
          {format.money(position.netWorth)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {format.money(position.totalBalance, { compact: true })} spendable across{' '}
          {plural(data.accounts.filter((a) => !a.archived).length, 'account')}
        </p>
      </div>

      <nav aria-label="Primary" className="mt-4 flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-line p-3">
        <SidebarLink item={{ to: '/settings', label: 'Settings', icon: IconSettings }} />
        <ProfileCard />
      </div>
    </aside>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium',
          'transition-colors duration-150',
          isActive ? 'bg-surface-muted text-ink' : 'text-muted hover:bg-surface-muted/60 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-subtle')} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function ProfileCard() {
  const { data, ephemeral } = useLedger()
  const name = data.settings.profileName || 'You'
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text"
      >
        {initials || 'Y'}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{name}</p>
        <p className="truncate text-[11px] text-subtle">
          {ephemeral ? 'Not being saved' : 'Saved in this browser'}
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Top bar                                                           */
/* ---------------------------------------------------------------- */

function TopBar({
  onOpenSearch,
  onNewTransaction,
}: {
  onOpenSearch: () => void
  onNewTransaction: () => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <IconLogo className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Ledger</span>
        </div>

        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(
            'ml-auto flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5',
            'text-[13px] text-subtle transition-colors hover:border-muted/60 lg:ml-0 lg:w-full lg:max-w-xs',
          )}
        >
          <IconSearch className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Search transactions…</span>
          <span className="sr-only lg:hidden">Search transactions</span>
          <kbd className="ml-auto hidden rounded border border-line px-1 py-px text-[10px] lg:block">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 lg:ml-auto">
          <ThemeToggle />
          {/*
            The visibility lives on a wrapper, not on the Button. `cn` is a plain
            join, so a bare `hidden` passed to Button would lose to its own
            `inline-flex` base class and the button would show at every width —
            overflowing the narrowest screens. A wrapper has nothing to collide with.
          */}
          <span className="hidden sm:block">
            <Button variant="primary" size="md" onClick={onNewTransaction}>
              <IconPlus className="h-3.5 w-3.5" />
              New transaction
            </Button>
          </span>
        </div>
      </div>
    </header>
  )
}

function ThemeToggle() {
  const { actions } = useLedger()
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  const toggle = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    setIsDark(next)
    writeTheme(next ? 'dark' : 'light')
    actions.updateSettings({ theme: next ? 'dark' : 'light' })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
    </Button>
  )
}

/* ---------------------------------------------------------------- */
/* Mobile navigation                                                 */
/* ---------------------------------------------------------------- */

function MobileNav({
  onMore,
  onNewTransaction,
  moreOpen,
}: {
  onMore: () => void
  onNewTransaction: () => void
  moreOpen: boolean
}) {
  const primary = NAV_ITEMS.filter((item) => MOBILE_PRIMARY.includes(item.to))

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-1 pb-1 pt-1.5">
        {primary.slice(0, 2).map((item) => (
          <MobileLink key={item.to} item={item} />
        ))}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onNewTransaction}
            aria-label="New transaction"
            className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-pop transition-transform active:scale-95"
          >
            <IconPlus className="h-4 w-4" />
          </button>
        </div>

        {primary.slice(2).map((item) => (
          <MobileLink key={item.to} item={item} />
        ))}

        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={cn(
            'flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-medium',
            moreOpen ? 'text-accent' : 'text-subtle',
          )}
        >
          <IconMenu className="h-[18px] w-[18px]" />
          <span className={cn(moreOpen && 'text-ink')}>More</span>
        </button>
      </div>
    </nav>
  )
}

function MobileLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-medium',
          isActive ? 'text-accent' : 'text-subtle',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-[18px] w-[18px]" />
          <span className={cn(isActive && 'text-ink')}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Overflow sheet for the sections that do not fit the bottom bar. Rendered as
 * a bottom sheet, which is the expected mobile pattern for secondary nav.
 */
function MoreSheet({ onClose }: { onClose: () => void }) {
  const rest = [
    ...NAV_ITEMS.filter((item) => !MOBILE_PRIMARY.includes(item.to)),
    { to: '/settings', label: 'Settings', icon: IconSettings },
  ]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-black/35 animate-fade-in dark:bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-line bg-surface p-3 pb-6 shadow-pop animate-slide-up"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
        {rest.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                  isActive ? 'bg-surface-muted text-ink' : 'text-muted',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}
