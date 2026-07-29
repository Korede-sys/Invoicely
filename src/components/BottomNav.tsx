import { NavLink } from 'react-router-dom'
import { FileText, Users, LayoutDashboard, Repeat, Settings } from 'lucide-react'

const items = [
  { to: '/', label: 'Invoices', icon: FileText, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E7E2D6] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-lg mx-auto grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[color:var(--color-ledger)]' : 'text-slate-400'
              }`
            }
          >
            <Icon size={20} strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
