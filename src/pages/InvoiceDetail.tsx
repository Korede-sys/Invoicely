import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, Pencil, Trash2, Wallet } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
import { deleteInvoice, fetchInvoice, recordPayment } from '../lib/data'
import { amountPaid, deriveStatus, formatMoney, invoiceSubtotal, invoiceTotal, type Invoice } from '../lib/types'
import { StatusPill } from '../components/StatusPill'
import { useAuth } from '../contexts/AuthContext'

export function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const logoUrl = (user?.user_metadata as Record<string, string> | undefined)?.business_logo_url
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Bank transfer')
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!id) return
    const inv = await fetchInvoice(id)
    setInvoice(inv)
  }

  useEffect(() => {
    load()
  }, [id])

  if (!invoice) return <p className="text-center text-sm text-slate-400 py-16">Loading…</p>

  const items = invoice.items ?? []
  const subtotal = invoiceSubtotal(items)
  const total = invoiceTotal(items, invoice.tax_rate, invoice.discount)
  const paid = amountPaid(invoice.payments ?? [])
  const balance = Math.max(0, total - paid)
  const status = deriveStatus(invoice)
  const daysOverdue = differenceInCalendarDays(new Date(), parseISO(invoice.due_date))

  async function handleDelete() {
    if (!id || !confirm('Delete this invoice? This cannot be undone.')) return
    await deleteInvoice(id)
    navigate('/')
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !user) return
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) return
    setSaving(true)
    try {
      await recordPayment(id, user.id, amount, new Date().toISOString().slice(0, 10), payMethod)
      setShowPayment(false)
      setPayAmount('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG'; width: number; height: number } | null> {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const format: 'PNG' | 'JPEG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const dims = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.src = dataUrl
      })
      return { dataUrl, format, ...dims }
    } catch {
      return null // logo failed to load — PDF still generates without it
    }
  }

  async function downloadPdf() {
    if (!invoice) return
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const marginX = 14
    const pageWidth = 210
    const pageHeight = 297
    const bottomLimit = pageHeight - 18 // leave room for footer/page number
    let page = 1
    let y = 20

    const paidAmt = paid
    const logo = logoUrl ? await loadImageAsDataUrl(logoUrl) : null

    function drawFooter() {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Page ${page}`, pageWidth - marginX, pageHeight - 10, { align: 'right' })
      doc.setTextColor(0, 0, 0)
    }

    function drawTableHeader() {
      doc.setFillColor(36, 84, 255)
      doc.rect(marginX, y, pageWidth - marginX * 2, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Description', marginX + 2, y + 5.5)
      doc.text('Qty', 130, y + 5.5)
      doc.text('Rate', 150, y + 5.5)
      doc.text('Amount', pageWidth - marginX, y + 5.5, { align: 'right' })
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      y += 8
    }

    // ensureSpace adds a new page (repeating the table header) if the next
    // block of `needed` mm would overflow the printable area.
    function ensureSpace(needed: number, opts?: { repeatTableHeader?: boolean }) {
      if (y + needed <= bottomLimit) return
      drawFooter()
      doc.addPage()
      page += 1
      y = 20
      doc.setFontSize(9)
      doc.setTextColor(120, 120, 120)
      doc.text(`${invoice!.invoice_number} (continued)`, marginX, y)
      doc.setTextColor(0, 0, 0)
      y += 8
      if (opts?.repeatTableHeader) drawTableHeader()
    }

    let titleX = marginX
    if (logo) {
      const logoHeight = 14
      const logoWidth = (logo.width / logo.height) * logoHeight
      doc.addImage(logo.dataUrl, logo.format, marginX, y - 10, logoWidth, logoHeight)
      titleX = marginX + logoWidth + 5
    }

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', titleX, y)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.invoice_number, pageWidth - marginX, y, { align: 'right' })

    y += 12
    const billToStartY = y
    doc.setFontSize(10)
    doc.text('Bill to', marginX, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text(invoice.client?.name ?? '', marginX, y)
    doc.setFont('helvetica', 'normal')
    if (invoice.client?.address) {
      y += 5
      doc.text(doc.splitTextToSize(invoice.client.address, 90), marginX, y)
    }
    if (invoice.client?.phone) {
      y += 5
      doc.text(invoice.client.phone, marginX, y)
    }

    doc.text(`Issue date: ${format(parseISO(invoice.issue_date), 'dd/MM/yyyy')}`, pageWidth - marginX, billToStartY, { align: 'right' })
    doc.text(`Due date: ${format(parseISO(invoice.due_date), 'dd/MM/yyyy')}`, pageWidth - marginX, billToStartY + 5, { align: 'right' })

    y = Math.max(y, billToStartY + 5) + 10
    drawTableHeader()

    for (const item of items) {
      ensureSpace(7, { repeatTableHeader: true })
      y += 7
      const lines = doc.splitTextToSize(item.description, 108)
      doc.text(lines, marginX + 2, y)
      doc.text(String(item.quantity), 130, y)
      doc.text(formatMoney(item.rate), 150, y)
      doc.text(formatMoney(item.quantity * item.rate), pageWidth - marginX, y, { align: 'right' })
      if (lines.length > 1) y += (lines.length - 1) * 4.5
    }

    const totalsBlockHeight = 10 + 6 + (invoice.tax_rate > 0 ? 6 : 0) + (invoice.discount > 0 ? 6 : 0) + (paidAmt > 0 ? 12 : 0)
    ensureSpace(totalsBlockHeight)

    y += 10
    doc.setDrawColor(220, 220, 220)
    doc.line(marginX, y - 6, pageWidth - marginX, y - 6)
    doc.text(`Subtotal: ${formatMoney(subtotal)}`, pageWidth - marginX, y, { align: 'right' })
    y += 6
    if (invoice.tax_rate > 0) {
      doc.text(`Tax (${invoice.tax_rate}%): ${formatMoney(subtotal * (invoice.tax_rate / 100))}`, pageWidth - marginX, y, { align: 'right' })
      y += 6
    }
    if (invoice.discount > 0) {
      doc.text(`Discount: -${formatMoney(invoice.discount)}`, pageWidth - marginX, y, { align: 'right' })
      y += 6
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`Total: ${formatMoney(total)}`, pageWidth - marginX, y, { align: 'right' })
    doc.setFontSize(10)

    if (paidAmt > 0) {
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(22, 128, 90)
      doc.text(`Paid: ${formatMoney(paidAmt)}`, pageWidth - marginX, y, { align: 'right' })
      y += 6
      doc.setTextColor(208, 72, 61)
      doc.text(`Balance due: ${formatMoney(balance)}`, pageWidth - marginX, y, { align: 'right' })
      doc.setTextColor(0, 0, 0)
    }

    if (invoice.notes) {
      const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - marginX * 2)
      ensureSpace(10 + noteLines.length * 4.5)
      y += 14
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text('Notes', marginX, y)
      y += 5
      doc.text(noteLines, marginX, y)
    }

    drawFooter()
    doc.save(`${invoice.invoice_number}.pdf`)
  }

  return (
    <div className="min-h-screen pb-8 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-slate-500">
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-display text-lg font-semibold font-mono-tab">{invoice.invoice_number}</h1>
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            <Link to={`/invoices/${invoice.id}/edit`}>
              <Pencil size={18} />
            </Link>
            <button onClick={handleDelete}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Document preview */}
        <div className="ledger-card p-5 mb-5">
          <div className="flex justify-between items-start mb-5">
            <div className="flex items-center gap-3">
              {logoUrl && <img src={logoUrl} alt="Business logo" className="w-11 h-11 object-contain rounded" />}
              <div>
                <p className="font-display font-bold text-lg">Invoice</p>
                <p className="text-xs text-slate-500 font-mono-tab">{invoice.invoice_number}</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Issued {format(parseISO(invoice.issue_date), 'dd/MM/yyyy')}</p>
              <p>Due {format(parseISO(invoice.due_date), 'dd/MM/yyyy')}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-0.5">Bill to</p>
            <p className="font-medium text-sm">{invoice.client?.name}</p>
            {invoice.client?.address && <p className="text-xs text-slate-500">{invoice.client.address}</p>}
            {invoice.client?.phone && <p className="text-xs text-slate-500">{invoice.client.phone}</p>}
          </div>

          <div className="rounded-lg overflow-hidden border border-[#E7E2D6]">
            <div className="bg-[color:var(--color-ledger)] text-white text-xs font-semibold grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2">
              <span>Description</span>
              <span>Qty</span>
              <span className="text-right">Amount</span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-sm border-t border-[#E7E2D6] first:border-t-0">
                <span className="truncate">{item.description}</span>
                <span className="font-mono-tab text-slate-500">{item.quantity}</span>
                <span className="font-mono-tab text-right">{formatMoney(item.quantity * item.rate)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono-tab">{formatMoney(subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Discount</span>
                <span className="font-mono-tab">-{formatMoney(invoice.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base pt-1 border-t border-[#E7E2D6]">
              <span>Total</span>
              <span className="font-mono-tab">{formatMoney(total)}</span>
            </div>
          </div>

          {invoice.notes && <p className="text-xs text-slate-500 mt-4 whitespace-pre-wrap">{invoice.notes}</p>}
        </div>

        {/* Payment summary */}
        <div className="ledger-card p-4 mb-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-500">
              Due {format(parseISO(invoice.due_date), 'dd/MM/yyyy')}
              {status === 'overdue' && <span className="text-[color:var(--color-bad)] font-medium"> · Overdue {daysOverdue}d</span>}
            </p>
            <StatusPill status={status} />
          </div>
          <p className="font-mono-tab text-2xl font-bold">{formatMoney(total)}</p>
          <p className="text-sm text-[color:var(--color-bad)] font-medium">{formatMoney(balance)} unpaid</p>
          {paid > 0 && <p className="text-xs text-slate-500 mt-0.5">{formatMoney(paid)} paid so far</p>}
        </div>

        {balance > 0 && !showPayment && (
          <button
            onClick={() => setShowPayment(true)}
            className="w-full rounded-lg bg-[color:var(--color-ledger)] text-white font-semibold py-3 text-sm mb-3 flex items-center justify-center gap-2"
          >
            <Wallet size={16} /> Record payment
          </button>
        )}

        {showPayment && (
          <form onSubmit={handleRecordPayment} className="ledger-card p-4 mb-3 space-y-3">
            <p className="font-medium text-sm">Record a payment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  max={balance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={balance.toFixed(2)}
                  className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm font-mono-tab"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm bg-white"
                >
                  <option>Bank transfer</option>
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowPayment(false)} className="flex-1 rounded-lg border border-[#E7E2D6] py-2.5 text-sm font-medium">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[color:var(--color-ledger)] text-white py-2.5 text-sm font-semibold disabled:opacity-60">
                {saving ? 'Saving…' : 'Save payment'}
              </button>
            </div>
          </form>
        )}

        <button
          onClick={downloadPdf}
          className="w-full rounded-lg border border-[#E7E2D6] bg-white text-sm font-semibold py-3 flex items-center justify-center gap-2"
        >
          <Download size={16} /> Download PDF
        </button>
      </div>
    </div>
  )
}
