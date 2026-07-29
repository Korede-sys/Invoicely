import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchClients, fetchInvoice, nextInvoiceNumber, saveInvoice, createRecurringRule } from '../lib/data'
import { formatMoney, invoiceSubtotal, invoiceTotal, type Client, type InvoiceStatus, type RecurringFrequency } from '../lib/types'

interface LineItem {
  description: string
  quantity: number
  rate: number
}

export function InvoiceForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const [taxRate, setTaxRate] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, rate: 0 }])
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchClients().then(setClients)
    if (isEdit && id) {
      fetchInvoice(id).then((inv) => {
        setClientId(inv.client_id)
        setInvoiceNumber(inv.invoice_number)
        setStatus(inv.status)
        setIssueDate(inv.issue_date)
        setDueDate(inv.due_date)
        setTaxRate(inv.tax_rate)
        setDiscount(inv.discount)
        setNotes(inv.notes ?? '')
        setItems((inv.items ?? []).map((i) => ({ description: i.description, quantity: i.quantity, rate: i.rate })))
        setLoading(false)
      })
    } else {
      nextInvoiceNumber().then(setInvoiceNumber)
    }
  }, [id, isEdit])

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', quantity: 1, rate: 0 }])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = invoiceSubtotal(items)
  const total = invoiceTotal(items, taxRate, discount)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !clientId) return
    setSaving(true)
    try {
      let recurringRuleId: string | null = null
      if (recurring) {
        const rule = await createRecurringRule(user.id, frequency, dueDate)
        recurringRuleId = rule.id
      }
      const savedId = await saveInvoice(
        {
          id,
          client_id: clientId,
          invoice_number: invoiceNumber,
          status,
          issue_date: issueDate,
          due_date: dueDate,
          tax_rate: taxRate,
          discount,
          notes: notes || null,
          recurring_rule_id: recurringRuleId,
          items: items.filter((i) => i.description.trim().length > 0),
        },
        user.id
      )
      navigate(`/invoices/${savedId}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-center text-sm text-slate-400 py-16">Loading…</p>

  return (
    <div className="min-h-screen pb-28 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-500">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display text-lg font-semibold">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
        </div>
      </header>

      <form onSubmit={handleSave} className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        <section className="ledger-card p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Client</label>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm bg-white"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">No clients yet — add one from the Clients tab first.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Invoice #</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm font-mono-tab"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm bg-white"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Issue date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="ledger-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm">Line items</p>
            <button type="button" onClick={addItem} className="text-[color:var(--color-ledger)] text-sm font-semibold flex items-center gap-1">
              <Plus size={16} /> Add item
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="border border-[#E7E2D6] rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    className="flex-1 rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm"
                  />
                  <button type="button" onClick={() => removeItem(i)} className="text-slate-400 shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500">Qty</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-[#E7E2D6] px-2 py-1.5 text-sm font-mono-tab"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-slate-500">Rate</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => updateItem(i, { rate: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-[#E7E2D6] px-2 py-1.5 text-sm font-mono-tab"
                    />
                  </div>
                </div>
                <p className="text-right text-xs font-mono-tab text-slate-500">
                  {formatMoney(item.quantity * item.rate)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="ledger-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Tax rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm font-mono-tab"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Discount</label>
              <input
                type="number"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm font-mono-tab"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm"
              placeholder="Payment terms, thank-you note, etc."
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="text-sm font-medium flex items-center gap-2">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-[color:var(--color-ledger)]" />
              Make this a recurring invoice
            </label>
          </div>
          {recurring && (
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm bg-white"
            >
              <option value="weekly">Repeats weekly</option>
              <option value="monthly">Repeats monthly</option>
              <option value="yearly">Repeats yearly</option>
            </select>
          )}

          <div className="border-t border-[#E7E2D6] pt-3 space-y-1">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono-tab">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="font-mono-tab">{formatMoney(total)}</span>
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving || !clientId}
          className="w-full rounded-lg bg-[color:var(--color-ledger)] text-white font-semibold py-3 text-sm disabled:opacity-60"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create invoice'}
        </button>
      </form>
    </div>
  )
}
