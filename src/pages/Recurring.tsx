import { useEffect, useState } from 'react'
import { Repeat } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Layout } from '../components/Layout'
import { EmptyState } from '../components/EmptyState'
import { fetchRecurringRules, toggleRecurringRule } from '../lib/data'
import type { RecurringRule } from '../lib/types'

const FREQ_LABEL: Record<RecurringRule['frequency'], string> = {
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
}

export function Recurring() {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecurringRules().then((data) => {
      setRules(data)
      setLoading(false)
    })
  }, [])

  async function handleToggle(rule: RecurringRule) {
    await toggleRecurringRule(rule.id, !rule.active)
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)))
  }

  return (
    <Layout title="Recurring">
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
      ) : rules.length === 0 ? (
        <EmptyState icon={Repeat} title="No recurring invoices" body="Turn on 'Recurring' when creating an invoice to see it here." />
      ) : (
        <div className="space-y-2.5">
          {rules.map((rule) => (
            <div key={rule.id} className="ledger-card flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="font-medium text-sm">{FREQ_LABEL[rule.frequency]}</p>
                <p className="text-xs text-slate-500 mt-0.5">Next: {format(parseISO(rule.next_run_date), 'dd/MM/yyyy')}</p>
              </div>
              <button
                onClick={() => handleToggle(rule)}
                className={`w-11 h-6 rounded-full relative transition-colors ${rule.active ? 'bg-[color:var(--color-ledger)]' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${rule.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
