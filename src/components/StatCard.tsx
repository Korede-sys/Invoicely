import { formatMoney } from '../lib/types'

export function StatCard({ label, amount, tone = 'ink' }: { label: string; amount: number; tone?: 'ink' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'var(--color-good)' : tone === 'bad' ? 'var(--color-bad)' : 'var(--color-ink)'
  return (
    <div className="ledger-card px-4 py-3.5 min-w-[9.5rem] shrink-0">
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      <p className="font-mono-tab text-lg font-semibold" style={{ color }}>
        {formatMoney(amount)}
      </p>
    </div>
  )
}
