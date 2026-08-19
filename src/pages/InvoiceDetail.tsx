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
  const [showMore, setShowMore] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Bank transfer')
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareMessage, setShareMessage] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setInvoice(await fetchInvoice(id))
  }, [id])

  useEffect(() => { void load() }, [load])

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

  async function handleRecordPayment(e: FormEvent) {
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

  async function createPdf(): Promise<jsPDF | null> {
    let host: HTMLDivElement | null = null
    try {
      const source = invoiceRef.current?.querySelector('[data-invoice-document]') as HTMLElement | null
      if (!source) return null
      if (document.fonts?.ready) await document.fonts.ready

      host = document.createElement('div')
      host.style.position = 'fixed'
      host.style.left = '-100000px'
      host.style.top = '0'
      host.style.width = '794px'
      host.style.background = '#fff'
      host.style.padding = '0'
      host.style.margin = '0'
      host.style.zIndex = '-9999'
      host.style.pointerEvents = 'none'

      const clone = source.cloneNode(true) as HTMLElement
      clone.style.width = '794px'
      clone.style.maxWidth = '794px'
      clone.style.minWidth = '794px'
      clone.style.margin = '0'
      clone.style.padding = '34px'
      clone.style.boxSizing = 'border-box'
      clone.style.background = '#fff'
      clone.style.color = '#0f172a'
      clone.style.fontSize = '11px'
      clone.style.lineHeight = '1.25'
      host.appendChild(clone)
      document.body.appendChild(host)

      const sourceEls = Array.from(source.querySelectorAll('*'))
      const cloneEls = Array.from(clone.querySelectorAll('*'))
      sourceEls.forEach((el, index) => {
        const target = cloneEls[index] as HTMLElement | undefined
        if (!target) return
        const computed = getComputedStyle(el as HTMLElement)
        target.style.fontFamily = computed.fontFamily
        target.style.fontWeight = computed.fontWeight
        target.style.fontStyle = computed.fontStyle
        target.style.letterSpacing = computed.letterSpacing
        target.style.textTransform = computed.textTransform
        target.style.textAlign = computed.textAlign
        target.style.verticalAlign = computed.verticalAlign
        target.style.boxSizing = 'border-box'
        if (computed.color) target.style.color = computed.color.includes('oklch') || computed.color.includes('oklab') ? '#0f172a' : computed.color
        if (computed.backgroundColor) target.style.backgroundColor = computed.backgroundColor.includes('oklch') || computed.backgroundColor.includes('oklab') ? '#ffffff' : computed.backgroundColor
      })

      const table = clone.querySelector('table') as HTMLTableElement | null
      if (table) {
        table.style.width = '100%'
        table.style.tableLayout = 'fixed'
        table.style.borderCollapse = 'collapse'
        table.style.fontSize = '10px'
        table.querySelectorAll<HTMLElement>('th,td').forEach(cell => {
          cell.style.paddingTop = '5px'
          cell.style.paddingBottom = '5px'
        })
      }

      clone.querySelectorAll<HTMLElement>('[data-description]').forEach(el => {
        el.style.whiteSpace = 'normal'
        el.style.overflow = 'visible'
        el.style.overflowWrap = 'anywhere'
        el.style.wordBreak = 'break-word'
      })
      clone.querySelectorAll<HTMLElement>('[data-number]').forEach(el => {
        el.style.whiteSpace = 'nowrap'
        el.style.wordBreak = 'normal'
      })

      const images = Array.from(clone.querySelectorAll('img'))
      for (const image of images) {
        if (!image.complete) await new Promise<void>(resolve => {
          const done = () => { image.removeEventListener('load', done); image.removeEventListener('error', done); resolve() }
          image.addEventListener('load', done)
          image.addEventListener('error', done)
          window.setTimeout(done, 4000)
        })
        if (typeof image.decode === 'function') await image.decode().catch(() => undefined)
      }

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 8000,
        width: 794,
        windowWidth: 794,
        removeContainer: true,
      })

      host.remove()
      host = null
      if (!canvas.width || !canvas.height) return null

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      const margin = 7
      const availableWidth = 210 - margin * 2
      const availableHeight = 297 - margin * 2
      const fitScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height)
      const renderedWidth = canvas.width * fitScale
      const renderedHeight = canvas.height * fitScale
      const x = (210 - renderedWidth) / 2
      const y = (297 - renderedHeight) / 2

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, renderedWidth, renderedHeight, undefined, 'FAST')
      return pdf
    } catch (error) {
      console.error('PDF generation failed:', error)
      return null
    } finally {
      if (host) host.remove()
    }
  }

  async function downloadPdf() {
    setShareMessage('')
    const pdf = await createPdf()
    if (!pdf) { setShareMessage('Could not create the invoice PDF. Please try again.'); return }
    pdf.save(`${invoice.invoice_number}.pdf`)
    setShareMessage('Invoice PDF downloaded successfully.')
  }

  async function handleSend() {
    setSharing(true)
    setShareMessage('')
    try {
      const pdf = await createPdf()
      if (!pdf) { setShareMessage('Could not create the invoice PDF. Please try again.'); return }
      const fileName = `${invoice.invoice_number}.pdf`
      const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' })
      if (typeof navigator.share === 'function') {
        let canShare = false
        if (typeof navigator.canShare === 'function') {
          try { canShare = navigator.canShare({ files: [file] }) } catch { canShare = false }
        }
        if (canShare) {
          try {
            await navigator.share({ title: `Invoice ${invoice.invoice_number}`, text: `Invoice ${invoice.invoice_number} from ${meta.business_name || 'your business'} — ${formatMoney(total)}.`, files: [file] })
            setShareMessage('Invoice PDF is ready to share.')
            return
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            console.error('Native sharing failed:', error)
          }
        }
      }
      pdf.save(fileName)
      setShareMessage('Your browser does not support direct file sharing. The PDF has been downloaded instead.')
    } catch (error) {
      console.error('Share PDF failed:', error)
      setShareMessage('Could not create or share the PDF. Please try again.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="min-h-screen pb-8 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><button onClick={() => navigate(-1)} className="text-slate-500"><ArrowLeft size={20} /></button><h1 className="font-display text-lg font-semibold font-mono-tab">{invoice.invoice_number}</h1></div>
          <div className="flex items-center gap-3 text-slate-500"><Link to={`/invoices/${invoice.id}/edit`}><Pencil size={18} /></Link><button onClick={handleDelete}><Trash2 size={18} /></button></div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div ref={invoiceRef} className="mb-5">
          <div data-invoice-document className="ledger-card p-5 bg-white">
            <div className="flex justify-between items-start gap-4 mb-6">
              <div className="flex items-start gap-2.5 min-w-0">
                {logoUrl && <img src={logoUrl} alt="Business logo" crossOrigin="anonymous" className="w-10 h-10 object-contain shrink-0" />}
                <div className="min-w-0">
                  {meta.business_name && <p className="font-semibold text-sm leading-tight">{meta.business_name}</p>}
                  {meta.business_address && <p className="text-[11px] text-slate-500 whitespace-pre-line leading-snug">{meta.business_address}</p>}
                  {meta.business_phone && <p className="text-[11px] text-slate-500 leading-snug">{meta.business_phone}</p>}
                  {meta.business_email && <p className="text-[11px] text-slate-500 leading-snug break-all">{meta.business_email}</p>}
                </div>
              </div>
              <p className="font-display font-bold text-2xl text-[color:var(--color-ledger)] tracking-wide shrink-0">INVOICE</p>
            </div>

            <div className="flex justify-between gap-4 mb-5">
              <div className="min-w-0"><p className="text-[10px] font-bold tracking-widest text-slate-900 mb-1">BILL TO</p><p className="font-semibold text-sm">{invoice.client?.name}</p>{invoice.client?.address && <p className="text-xs text-slate-500 whitespace-pre-line">{invoice.client.address}</p>}{invoice.client?.phone && <p className="text-xs text-slate-500">{invoice.client.phone}</p>}</div>
              <div className="text-xs shrink-0"><div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1"><span className="font-bold text-slate-900">INVOICE #</span><span className="text-right text-slate-500 font-mono-tab">{invoice.invoice_number}</span><span className="font-bold text-slate-900">DATE</span><span className="text-right text-slate-500">{format(parseISO(invoice.issue_date), 'dd/MM/yyyy')}</span><span className="font-bold text-slate-900">DUE DATE</span><span className="text-right text-slate-500">{format(parseISO(invoice.due_date), 'dd/MM/yyyy')}</span></div></div>
            </div>

            <div className="rounded-md overflow-hidden border border-[#E7E2D6]">
              <table className="w-full border-collapse table-fixed" style={{ tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: '38%' }} /><col style={{ width: '12%' }} /><col style={{ width: '23%' }} /><col style={{ width: '27%' }} /></colgroup>
                <thead><tr className="bg-[color:var(--color-ledger)] text-white text-[10px] sm:text-[11px] font-semibold"><th className="text-left px-2 sm:px-3 py-2 font-semibold">Description</th><th className="text-center px-1 py-2 font-semibold">QTY</th><th className="text-right px-1.5 py-2 font-semibold">Price</th><th className="text-right px-2 sm:px-3 py-2 font-semibold">Amount</th></tr></thead>
                <tbody>
                  {items.map((item, i) => <tr key={item.id} className={i % 2 === 1 ? 'bg-[#F5F7FB]' : 'bg-white'}><td data-description className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs align-top whitespace-normal break-words leading-snug">{item.description}</td><td data-number className="px-1 py-2 text-[10px] sm:text-xs font-mono-tab text-center text-slate-600 align-top whitespace-nowrap">{item.quantity}</td><td data-number className="px-1.5 py-2 text-[10px] sm:text-xs font-mono-tab text-right text-slate-600 align-top whitespace-nowrap">{formatMoney(item.rate)}</td><td data-number className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-mono-tab text-right align-top whitespace-nowrap">{formatMoney(item.quantity * item.rate)}</td></tr>)}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E7E2D6] bg-white"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-right">Subtotal</td><td className="px-2 sm:px-3 py-1.5 text-xs font-mono-tab text-right whitespace-nowrap">{formatMoney(subtotal)}</td></tr>
                  {invoice.tax_rate > 0 && <tr className="bg-white"><td colSpan={3} className="px-3 py-1.5 text-xs text-slate-500 text-right">Tax ({invoice.tax_rate}%)</td><td className="px-2 sm:px-3 py-1.5 text-xs font-mono-tab text-right whitespace-nowrap">{formatMoney(subtotal * (invoice.tax_rate / 100))}</td></tr>}
                  {invoice.discount > 0 && <tr className="bg-white"><td colSpan={3} className="px-3 py-1.5 text-xs text-slate-500 text-right">Discount</td><td className="px-2 sm:px-3 py-1.5 text-xs font-mono-tab text-right whitespace-nowrap">-{formatMoney(invoice.discount)}</td></tr>}
                  <tr className="bg-[color:var(--color-ledger)] text-white"><td colSpan={3} className="px-3 py-2 text-xs font-semibold text-right">Total</td><td className="px-2 sm:px-3 py-2 text-sm font-mono-tab font-bold text-right whitespace-nowrap">{formatMoney(total)}</td></tr>
                </tfoot>
              </table>
            </div>

            {(meta.business_payment_details || paid > 0) && <div className="mt-5"><p className="text-xs font-bold mb-1">Payment Method</p>{meta.business_payment_details && <p className="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">{meta.business_payment_details}</p>}{paid > 0 && <p className="text-[11px] text-[color:var(--color-good)] font-medium mt-1">{formatMoney(paid)} received · {formatMoney(balance)} balance due</p>}</div>}
            {(meta.business_terms || invoice.notes) && <div className="mt-5"><p className="text-xs font-bold mb-1">Terms &amp; Conditions</p>{meta.business_terms && <p className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">{meta.business_terms}</p>}{invoice.notes && <p className="text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed mt-1">{invoice.notes}</p>}</div>}
          </div>
        </div>

        <div className="mb-5"><div className="flex items-center justify-between mb-1"><p className="text-sm text-slate-500">Due on {format(parseISO(invoice.due_date), 'dd/MM/yyyy')}{status === 'overdue' && <span className="text-[color:var(--color-bad)] font-medium"> · {daysOverdue}d late</span>}</p><StatusPill status={status} /></div><p className="font-mono-tab text-3xl font-bold">{formatMoney(total)}</p><div className="flex items-center justify-between mt-0.5"><p className="text-base font-medium">{invoice.client?.name}</p>{invoice.status === 'draft' && <span className="rounded-full bg-[#EFEFEF] text-slate-500 text-xs font-medium px-2.5 py-1">Not Sent</span>}</div>{balance > 0 && balance < total && <p className="text-sm text-[color:var(--color-bad)] font-medium mt-0.5">{formatMoney(balance)} unpaid</p>}</div>
        <button onClick={handleSend} disabled={sharing} className="w-full rounded-xl bg-[color:var(--color-ledger)] text-white font-semibold py-3.5 text-sm mb-2 flex items-center justify-center gap-2 disabled:opacity-60"><Send size={16} />{sharing ? 'Preparing PDF…' : 'Share invoice PDF'}</button>
        {shareMessage && <p className="text-center text-xs text-slate-500 mb-4">{shareMessage}</p>}
        <div className="grid grid-cols-4 gap-2 mb-5"><button onClick={downloadPdf} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><Download size={18} /></span>Download</button><button onClick={() => window.print()} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><Printer size={18} /></span>Print</button><Link to={`/invoices/${invoice.id}/edit`} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><Pencil size={18} /></span>Edit</Link><div className="relative"><button onClick={() => setShowMore(v => !v)} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700 w-full"><span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]"><MoreHorizontal size={18} /></span>More</button>{showMore && <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-[#E7E2D6] rounded-lg shadow-lg py-1 w-36"><button onClick={handleDelete} className="w-full px-3 py-2 text-left text-xs font-medium text-[color:var(--color-bad)] flex items-center gap-2 hover:bg-[color:var(--color-bad-dim)]"><Trash2 size={14} />Delete invoice</button></div>}</div></div>
        {balance > 0 && !showPayment && <button onClick={() => setShowPayment(true)} className="w-full rounded-lg border border-[color:var(--color-ledger)] text-[color:var(--color-ledger)] bg-white font-semibold py-3 text-sm mb-3 flex items-center justify-center gap-2"><Wallet size={16} />Record payment</button>}
        {showPayment && <form onSubmit={handleRecordPayment} className="ledger-card p-4 mb-3 space-y-3"><p className="font-medium text-sm">Record a payment</p><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 mb-1 block">Amount</label><input type="number" step="0.01" max={balance} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={balance.toFixed(2)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm font-mono-tab" required /></div><div><label className="text-xs font-medium text-slate-600 mb-1 block">Method</label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm bg-white"><option>Bank transfer</option><option>Cash</option><option>Card</option><option>Other</option></select></div></div><div className="flex gap-2"><button type="button" onClick={() => setShowPayment(false)} className="flex-1 rounded-lg border border-[#E7E2D6] py-2.5 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[color:var(--color-ledger)] text-white py-2.5 text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save payment'}</button></div></form>}
      </div>
    </div>
  )
}
