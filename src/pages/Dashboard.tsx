import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO, subMonths, startOfMonth } from 'date-fns'
import { Layout } from '../components/Layout'
import { StatusPill } from '../components/StatusPill'
import { fetchInvoices } from '../lib/data'
import { amountPaid, deriveStatus, formatMoney, invoiceTotal, type Invoice } from '../lib/types'

export function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInvoices().then((data) => {
      setInvoices(data)
      setLoading(false)
    })
  }, [])

  const stats = useMemo(() => {
    let outstanding = 0
    let paidThisMonth = 0
    let overdueCount = 0
    const monthStart = startOfMonth(new Date())

    for (const inv of invoices) {
      const total = invoiceTotal(inv.items ?? [], inv.tax_rate, inv.discount)
      const paid = amountPaid(inv.payments ?? [])
      const status = deriveStatus(inv)
      if (status !== 'paid') outstanding += total - paid
      if (status === 'overdue') overdueCount += 1
      for (const p of inv.payments ?? []) {
        if (parseISO(p.paid_date) >= monthStart) paidThisMonth += p.amount
      }
    }
    return { outstanding, paidThisMonth, overdueCount }
  }, [invoices])

  const chartData = useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => startOfMonth(subMonths(new Date(), 5 - i)))
    return months.map((monthStart) => {
      const monthEnd = startOfMonth(subMonths(monthStart, -1))
      let revenue = 0
      for (const inv of invoices) {
        for (const p of inv.payments ?? []) {
          const d = parseISO(p.paid_date)
          if (d >= monthStart && d < monthEnd) revenue += p.amount
        }
      }
      return { month: format(monthStart, 'MMM'), revenue }
    })
  }, [invoices])

  const recent = [...invoices]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5)

  return (
    <Layout title="Dashboard">
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="ledger-card p-4">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Total outstanding</p>
              <p className="font-mono-tab text-lg font-semibold">{formatMoney(stats.outstanding)}</p>
            </div>
            <div className="ledger-card p-4">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Paid this month</p>
              <p className="font-mono-tab text-lg font-semibold" style={{ color: 'var(--color-good)' }}>
                {formatMoney(stats.paidThisMonth)}
              </p>
            </div>
            <div className="ledger-card p-4 col-span-2">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Overdue invoices</p>
              <p className="font-mono-tab text-lg font-semibold" style={{ color: stats.overdueCount > 0 ? 'var(--color-bad)' : undefined }}>
                {stats.overdueCount}
              </p>
            </div>
          </div>

          <div className="ledger-card p-4 mb-5">
            <p className="text-sm font-medium mb-3">Revenue, last 6 months</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2454FF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2454FF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => formatMoney(Number(v))} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="revenue" stroke="#2454FF" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent invoices</p>
          <div className="space-y-2.5">
            {recent.map((inv) => (
              <Link key={inv.id} to={`/invoices/${inv.id}`} className="ledger-card flex items-center justify-between px-4 py-3 block">
                <div>
                  <p className="font-medium text-sm">{inv.client?.name}</p>
                  <p className="text-xs text-slate-500">{inv.invoice_number}</p>
                </div>
                <StatusPill status={deriveStatus(inv)} />
              </Link>
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
