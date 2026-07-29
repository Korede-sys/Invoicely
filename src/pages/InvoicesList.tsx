import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileText } from 'lucide-react'
import { Layout } from '../components/Layout'
import { StatCard } from '../components/StatCard'
import { StatusPill } from '../components/StatusPill'
import { EmptyState } from '../components/EmptyState'
import { fetchInvoices } from '../lib/data'
import { amountPaid, deriveStatus, formatMoney, invoiceTotal, type Invoice, type InvoiceStatus } from '../lib/types'
import { format, parseISO } from 'date-fns'

const FILTERS: { key: 'all' | InvoiceStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Unpaid' },
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
]

export function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | InvoiceStatus>('all')

  useEffect(() => {
    fetchInvoices().then((data) => {
      setInvoices(data)
      setLoading(false)
    })
  }, [])

  const withStatus = useMemo(
    () => invoices.map((inv) => ({ inv, status: deriveStatus(inv), total: invoiceTotal(inv.items ?? [], inv.tax_rate, inv.discount) })),
    [invoices]
  )

  const totals = useMemo(() => {
    let unpaid = 0
    let overdue = 0
    let paid = 0
    for (const { inv, status, total } of withStatus) {
      const paidAmt = amountPaid(inv.payments ?? [])
      if (status === 'paid') paid += total
      else {
        unpaid += total - paidAmt
        if (status === 'overdue') overdue += total - paidAmt
      }
    }
    return { unpaid, overdue, paid }
  }, [withStatus])

  const filtered = withStatus.filter(({ status }) => filter === 'all' || status === filter)

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>()
    for (const entry of filtered) {
      const key = format(parseISO(entry.inv.issue_date), 'MMM yyyy')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(entry)
    }
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <Layout
      title="Invoices"
      action={
        <Link to="/invoices/new" className="w-9 h-9 rounded-full bg-[color:var(--color-ledger)] flex items-center justify-center">
          <Plus size={18} color="white" strokeWidth={2.5} />
        </Link>
      }
    >
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 mb-4">
        <StatCard label="Unpaid" amount={totals.unpaid} />
        <StatCard label="Overdue" amount={totals.overdue} tone="bad" />
        <StatCard label="Paid" amount={totals.paid} tone="good" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
              filter === f.key
                ? 'bg-[color:var(--color-ledger)] text-white border-[color:var(--color-ledger)]'
                : 'bg-white text-slate-600 border-[#E7E2D6]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading invoices…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" body="Create your first invoice to get started." />
      ) : (
        <div className="space-y-5">
          {grouped.map(([month, entries]) => (
            <div key={month}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{month}</p>
              <div className="space-y-2.5">
                {entries.map(({ inv, status, total }) => (
                  <Link key={inv.id} to={`/invoices/${inv.id}`} className="ledger-card flex items-center justify-between px-4 py-3.5 block">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{inv.client?.name ?? 'Unknown client'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {inv.invoice_number} · {format(parseISO(inv.issue_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-mono-tab text-sm font-semibold">{formatMoney(total)}</p>
                      <div className="mt-1">
                        <StatusPill status={status} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
