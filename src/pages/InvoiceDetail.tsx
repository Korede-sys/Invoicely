import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, MoreHorizontal, Pencil, Printer, Send, Trash2, Wallet } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { deleteInvoice, fetchInvoice, recordPayment } from '../lib/data'
import { amountPaid, deriveStatus, formatMoney, invoiceSubtotal, invoiceTotal, type Invoice } from '../lib/types'
import { StatusPill } from '../components/StatusPill'
import { useAuth } from '../contexts/AuthContext'

export function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const invoiceRef = useRef<HTMLDivElement | null>(null)
  const meta = (user?.user_metadata ?? {}) as Record<string, string>
  const logoUrl = meta.business_logo_url
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Bank transfer')
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (id) setInvoice(await fetchInvoice(id))
  }, [id])

  useEffect(() => { void load() }, [load])

  if (!invoice) return <p className="text-center text-sm text-slate-400 py-16">Loading…</p>

  const items = invoice.items ?? []
  const subtotal = invoiceSubtotal(items)
  const total = invoiceTotal(items, invoice.tax_rate, invoice.discount)
  const paid = amountPaid(invoice.payments ?? [])
  const balance = Math.max(0, total - paid)
  const status = deriveStatus(invoice)
  const daysOverdue = Math.max(0, differenceInCalendarDays(new Date(), parseISO(invoice.due_date)))

  async function handleDelete() {
    if (!id || !confirm('Delete this invoice? This cannot be undone.')) return
    await deleteInvoice(id)
    navigate('/')
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault()
    if (!id || !user) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0 || amount > balance) return
    setSaving(true)
    try {
      await recordPayment(id, user.id, amount, new Date().toISOString().slice(0, 10), payMethod)
      setShowPayment(false)
      setPayAmount('')
      await load()
    } finally { setSaving(false) }
  }

  async function createPdf(): Promise<jsPDF | null> {
    const source = invoiceRef.current
    if (!source) return null
    let holder: HTMLDivElement | null = null
    try {
      if (document.fonts?.ready) await document.fonts.ready
      holder = document.createElement('div')
      holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:794px;background:#fff;z-index:-1;'
      const clone = source.cloneNode(true) as HTMLElement
      clone.removeAttribute('id')
      clone.style.cssText += ';width:794px;max-width:794px;min-width:794px;margin:0;padding:36px;box-sizing:border-box;background:#fff;color:#12203D;'
      holder.appendChild(clone)
      document.body.appendChild(holder)

      clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const c = getComputedStyle(el)
        el.style.fontFamily = c.fontFamily
        el.style.fontSize = c.fontSize
        el.style.fontWeight = c.fontWeight
        el.style.lineHeight = c.lineHeight
        el.style.letterSpacing = c.letterSpacing
        if (c.color.includes('oklch') || c.color.includes('oklab')) el.style.color = '#12203D'
        else el.style.color = c.color
        if (c.backgroundColor.includes('oklch') || c.backgroundColor.includes('oklab')) el.style.backgroundColor = '#fff'
        else el.style.backgroundColor = c.backgroundColor
        el.style.boxSizing = 'border-box'
      })

      clone.querySelectorAll<HTMLElement>('.invoice-items-table').forEach((table) => {
        table.style.width = '100%'
        table.style.tableLayout = 'fixed'
        table.style.borderCollapse = 'collapse'
      })
      clone.querySelectorAll<HTMLElement>('.invoice-description').forEach((el) => {
        el.style.width = '100%'
        el.style.whiteSpace = 'normal'
        el.style.wordBreak = 'break-word'
        el.style.overflow = 'visible'
      })
      clone.querySelectorAll<HTMLElement>('.invoice-number-cell').forEach((el) => {
        el.style.whiteSpace = 'nowrap'
        el.style.textAlign = 'right'
      })

      const canvas = await html2canvas(clone, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', width: 794, windowWidth: 794, logging: false, imageTimeout: 10000 })
      holder.remove(); holder = null
      if (!canvas.width || !canvas.height) return null

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      const margin = 8
      const pageWidth = 210 - margin * 2
      const pageHeight = 297 - margin * 2
      const scale = pageWidth / canvas.width
      const sourcePageHeight = pageHeight / scale
      let y = 0
      let page = 0
      while (y < canvas.height) {
        if (page > 0) pdf.addPage()
        const h = Math.min(sourcePageHeight, canvas.height - y)
        const part = document.createElement('canvas')
        part.width = canvas.width
        part.height = Math.ceil(h)
        const ctx = part.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, part.width, part.height)
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
        pdf.addImage(part.toDataURL('image/jpeg', 0.96), 'JPEG', margin, margin, pageWidth, h * scale, undefined, 'FAST')
        y += h
        page++
      }
      return pdf
    } catch (error) {
      console.error('PDF generation failed:', error)
      return null
    } finally { holder?.remove() }
  }

  async function downloadPdf() {
    setMessage('')
    const pdf = await createPdf()
    if (!pdf) { setMessage('Could not create the invoice PDF. Please try again.'); return }
    pdf.save(`${invoice.invoice_number}.pdf`)
    setMessage('Invoice PDF downloaded successfully.')
  }

  async function handleSend() {
    setSharing(true); setMessage('')
    try {
      const pdf = await createPdf()
      if (!pdf) { setMessage('Could not create the invoice PDF. Please try again.'); return }
      const file = new File([pdf.output('blob')], `${invoice.invoice_number}.pdf`, { type: 'application/pdf' })
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: `Invoice ${invoice.invoice_number}`, text: `Invoice ${invoice.invoice_number} from ${meta.business_name || 'your business'} — ${formatMoney(total)}.`, files: [file] })
          setMessage('Invoice PDF is ready to share.')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      pdf.save(`${invoice.invoice_number}.pdf`)
      setMessage('Direct sharing is unavailable in this browser. The PDF was downloaded instead.')
    } finally { setSharing(false) }
  }

  return (
    <div className="min-h-screen pb-8 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6] print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><button onClick={() => navigate(-1)} className="text-slate-500"><ArrowLeft size={20} /></button><h1 className="font-display text-lg font-semibold font-mono-tab">{invoice.invoice_number}</h1></div>
          <div className="flex items-center gap-3 text-slate-500"><Link to={`/invoices/${invoice.id}/edit`}><Pencil size={18} /></Link><button onClick={handleDelete}><Trash2 size={18} /></button></div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 pt-4">
        <div ref={invoiceRef} id="invoice-pdf" className="invoice-paper bg-white border border-[#E7E2D6] shadow-sm mx-auto p-5 sm:p-8" style={{ width: '100%', maxWidth: 794 }}>
          <div className="flex justify-between items-start gap-6 pb-5 mb-5 border-b border-[#E7E2D6]">
            <div className="flex items-start gap-3 min-w-0">
              {logoUrl && <img src={logoUrl} alt="Business logo" crossOrigin="anonymous" className="w-12 h-12 object-contain shrink-0" />}
              <div className="min-w-0">
                {meta.business_name && <p className="font-display font-bold text-base">{meta.business_name}</p>}
                {meta.business_address && <p className="text-[10px] text-slate-500 whitespace-pre-line leading-snug">{meta.business_address}</p>}
                {meta.business_phone && <p className="text-[10px] text-slate-500">{meta.business_phone}</p>}
                {meta.business_email && <p className="text-[10px] text-slate-500 break-all">{meta.business_email}</p>}
              </div>
            </div>
            <div className="text-right shrink-0"><p className="font-display font-bold text-3xl text-[color:var(--color-ledger)] tracking-wide">INVOICE</p><p className="font-mono-tab text-[10px] text-slate-500 mt-1">{invoice.invoice_number}</p></div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-8 mb-6">
            <div className="min-w-0"><p className="text-[10px] font-bold tracking-widest mb-1">BILL TO</p><p className="font-semibold text-sm">{invoice.client?.name}</p>{invoice.client?.address && <p className="text-[10px] text-slate-500 whitespace-pre-line">{invoice.client.address}</p>}{invoice.client?.phone && <p className="text-[10px] text-slate-500">{invoice.client.phone}</p>}{invoice.client?.email && <p className="text-[10px] text-slate-500">{invoice.client.email}</p>}</div>
            <div className="text-[10px] grid grid-cols-[auto_auto] gap-x-5 gap-y-1 shrink-0"><b>INVOICE #</b><span className="invoice-number-cell">{invoice.invoice_number}</span><b>DATE</b><span className="invoice-number-cell">{format(parseISO(invoice.issue_date), 'dd/MM/yyyy')}</span><b>DUE DATE</b><span className="invoice-number-cell">{format(parseISO(invoice.due_date), 'dd/MM/yyyy')}</span></div>
          </div>

          <table className="invoice-items-table w-full text-[10px] sm:text-[11px]" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup><col style={{ width: '52%' }} /><col style={{ width: '10%' }} /><col style={{ width: '19%' }} /><col style={{ width: '19%' }} /></colgroup>
            <thead><tr className="bg-[color:var(--color-ledger)] text-white"><th className="text-left px-2.5 py-2 font-semibold">Description</th><th className="text-center px-1 py-2 font-semibold">QTY</th><th className="text-right px-2 py-2 font-semibold">Price</th><th className="text-right px-2 py-2 font-semibold">Amount</th></tr></thead>
            <tbody>
              {items.map((item, i) => <tr key={item.id} className={i % 2 ? 'bg-[#F5F7FB]' : 'bg-white'}><td className="invoice-description px-2.5 py-2 align-top whitespace-normal break-words">{item.description}</td><td className="px-1 py-2 text-center align-top font-mono-tab whitespace-nowrap">{item.quantity}</td><td className="px-2 py-2 text-right align-top font-mono-tab whitespace-nowrap">{formatMoney(item.rate)}</td><td className="px-2 py-2 text-right align-top font-mono-tab whitespace-nowrap">{formatMoney(item.quantity * item.rate)}</td></tr>)}
            </tbody>
          </table>

          <div className="flex justify-end mt-4"><div className="w-full sm:w-64 text-xs"><div className="flex justify-between py-1"><span className="font-semibold">Subtotal</span><span className="font-mono-tab whitespace-nowrap">{formatMoney(subtotal)}</span></div>{invoice.tax_rate > 0 && <div className="flex justify-between py-1 text-slate-500"><span>Tax ({invoice.tax_rate}%)</span><span className="font-mono-tab">{formatMoney(subtotal * invoice.tax_rate / 100)}</span></div>}{invoice.discount > 0 && <div className="flex justify-between py-1 text-slate-500"><span>Discount</span><span className="font-mono-tab">-{formatMoney(invoice.discount)}</span></div>}<div className="flex justify-between items-center px-3 py-2 mt-1 bg-[color:var(--color-ledger)] text-white"><b>Total</b><b className="font-mono-tab text-sm whitespace-nowrap">{formatMoney(total)}</b></div></div></div>

          {(meta.business_payment_details || paid > 0) && <div className="mt-5 pt-4 border-t border-[#E7E2D6]"><p className="text-[10px] font-bold mb-1">PAYMENT DETAILS</p>{meta.business_payment_details && <p className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">{meta.business_payment_details}</p>}{paid > 0 && <p className="text-[10px] text-[color:var(--color-good)] font-medium mt-1">{formatMoney(paid)} received · {formatMoney(balance)} balance due</p>}</div>}
          {(meta.business_terms || invoice.notes) && <div className="mt-5 pt-4 border-t border-[#E7E2D6]"><p className="text-[10px] font-bold mb-1">TERMS & CONDITIONS</p>{meta.business_terms && <p className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">{meta.business_terms}</p>}{invoice.notes && <p className="text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed mt-1">{invoice.notes}</p>}</div>}
        </div>

        <div className="mt-5 print:hidden">
          <div className="flex items-center justify-between mb-1"><p className="text-sm text-slate-500">Due on {format(parseISO(invoice.due_date), 'dd/MM/yyyy')}{status === 'overdue' && <span className="text-[color:var(--color-bad)] font-medium"> · {daysOverdue}d late</span>}</p><StatusPill status={status} /></div>
          <p className="font-mono-tab text-3xl font-bold">{formatMoney(total)}</p><p className="text-base font-medium">{invoice.client?.name}</p>{balance > 0 && balance < total && <p className="text-sm text-[color:var(--color-bad)] font-medium">{formatMoney(balance)} unpaid</p>}
          <button onClick={handleSend} disabled={sharing} className="w-full rounded-xl bg-[color:var(--color-ledger)] text-white font-semibold py-3.5 text-sm mt-4 mb-2 flex items-center justify-center gap-2 disabled:opacity-60"><Send size={16} />{sharing ? 'Preparing PDF…' : 'Share invoice PDF'}</button>
          {message && <p className="text-center text-xs text-slate-500 mb-3">{message}</p>}
          <div className="grid grid-cols-4 gap-2 mb-5"><button onClick={downloadPdf} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><Download size={18} /></span>Download</button><button onClick={() => window.print()} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><Printer size={18} /></span>Print</button><Link to={`/invoices/${invoice.id}/edit`} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><Pencil size={18} /></span>Edit</Link><div className="relative"><button onClick={() => setShowMore(v => !v)} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium w-full"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><MoreHorizontal size={18} /></span>More</button>{showMore && <div className="absolute right-0 top-full z-10 bg-white border border-[#E7E2D6] rounded-lg shadow-lg py-1 w-36"><button onClick={handleDelete} className="w-full px-3 py-2 text-left text-xs font-medium text-[color:var(--color-bad)] flex items-center gap-2"><Trash2 size={14} />Delete invoice</button></div>}</div></div>
          {balance > 0 && !showPayment && <button onClick={() => setShowPayment(true)} className="w-full rounded-lg border border-[color:var(--color-ledger)] text-[color:var(--color-ledger)] bg-white font-semibold py-3 text-sm mb-3 flex items-center justify-center gap-2"><Wallet size={16} />Record payment</button>}
          {showPayment && <form onSubmit={handleRecordPayment} className="ledger-card p-4 mb-3 space-y-3"><p className="font-medium text-sm">Record a payment</p><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 mb-1 block">Amount</label><input type="number" step="0.01" min="0.01" max={balance} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={balance.toFixed(2)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm font-mono-tab" required /></div><div><label className="text-xs font-medium text-slate-600 mb-1 block">Method</label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm bg-white"><option>Bank transfer</option><option>Cash</option><option>Card</option><option>Other</option></select></div></div><div className="flex gap-2"><button type="button" onClick={() => setShowPayment(false)} className="flex-1 rounded-lg border border-[#E7E2D6] py-2.5 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[color:var(--color-ledger)] text-white py-2.5 text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save payment'}</button></div></form>}
        </div>
      </main>
    </div>
  )
}
