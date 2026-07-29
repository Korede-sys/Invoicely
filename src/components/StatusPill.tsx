import type { InvoiceStatus } from '../lib/types'

const CONFIG: Record<InvoiceStatus, { label: string; bg: string; fg: string; dot: string }> = {
  draft: { label: 'Draft', bg: '#F1EEE5', fg: '#6B6355', dot: '#A39C8B' },
  sent: { label: 'Sent', bg: 'var(--color-ledger-dim)', fg: '#1B3FCC', dot: 'var(--color-ledger)' },
  paid: { label: 'Paid', bg: 'var(--color-good-dim)', fg: 'var(--color-good)', dot: 'var(--color-good)' },
  partially_paid: { label: 'Partial', bg: 'var(--color-warn-dim)', fg: 'var(--color-warn)', dot: 'var(--color-warn)' },
  overdue: { label: 'Overdue', bg: 'var(--color-bad-dim)', fg: 'var(--color-bad)', dot: 'var(--color-bad)' },
}

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const c = CONFIG[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}
