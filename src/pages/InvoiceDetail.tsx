import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  useNavigate,
  useParams,
  Link,
} from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  MoreHorizontal,
  Pencil,
  Printer,
  Send,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import {
  deleteInvoice,
  fetchInvoice,
  recordPayment,
} from '../lib/data'
import {
  amountPaid,
  deriveStatus,
  formatMoney,
  invoiceSubtotal,
  invoiceTotal,
  type Invoice,
} from '../lib/types'
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

    const inv = await fetchInvoice(id)
    setInvoice(inv)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!invoice) {
    return (
      <p className="text-center text-sm text-slate-400 py-16">
        Loading…
      </p>
    )
  }

  const items = invoice.items ?? []

  const subtotal = invoiceSubtotal(items)

  const total = invoiceTotal(
    items,
    invoice.tax_rate,
    invoice.discount
  )

  const paid = amountPaid(invoice.payments ?? [])

  const balance = Math.max(
    0,
    total - paid
  )

  const status = deriveStatus(invoice)

  const daysOverdue = differenceInCalendarDays(
    new Date(),
    parseISO(invoice.due_date)
  )

  async function handleDelete() {
    if (
      !id ||
      !confirm(
        'Delete this invoice? This cannot be undone.'
      )
    ) {
      return
    }

    await deleteInvoice(id)

    navigate('/')
  }

  async function handleRecordPayment(
    e: React.FormEvent
  ) {
    e.preventDefault()

    if (!id || !user) return

    const amount = parseFloat(payAmount)

    if (!amount || amount <= 0) return

    setSaving(true)

    try {
      await recordPayment(
        id,
        user.id,
        amount,
        new Date().toISOString().slice(0, 10),
        payMethod
      )

      setShowPayment(false)
      setPayAmount('')

      await load()
    } finally {
      setSaving(false)
    }
  }

  /*
   * ==========================================================
   * WAIT FOR INVOICE TO BE FULLY RENDERED
   * ==========================================================
   */

  async function waitForInvoiceRender(
    element: HTMLElement
  ) {
    if (document.fonts?.ready) {
      await document.fonts.ready
    }

    const images = Array.from(
      element.querySelectorAll('img')
    )

    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve()
              return
            }

            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
      )
    )

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })
  }

  /*
   * ==========================================================
   * CREATE PDF
   * ==========================================================
   *
   * IMPORTANT:
   *
   * The PDF is generated directly from the invoice preview.
   * Therefore the invoice items, spacing, typography and
   * branding remain visually consistent with the screen.
   */

  async function createPdf(): Promise<Blob | null> {
    const element = invoiceRef.current

    if (!element) {
      return null
    }

    await waitForInvoiceRender(element)

    /*
     * Store the original styles so we can restore everything
     * after html2canvas finishes.
     */
    const originalWidth = element.style.width
    const originalMaxWidth = element.style.maxWidth
    const originalTransform = element.style.transform
    const originalTransformOrigin =
      element.style.transformOrigin

    try {
      /*
       * Keep the invoice at its actual preview width.
       * Do NOT change the invoice layout before capturing.
       */
      element.style.width = `${element.scrollWidth}px`
      element.style.maxWidth = 'none'
      element.style.transform = 'none'
      element.style.transformOrigin = 'top left'

      const width = element.scrollWidth
      const height = element.scrollHeight

      if (!width || !height) {
        return null
      }

      const canvas = await html2canvas(
        element,
        {
          scale: Math.min(
            2,
            window.devicePixelRatio || 1
          ),

          useCORS: true,

          allowTaint: false,

          backgroundColor: '#ffffff',

          logging: false,

          imageTimeout: 20000,

          width,

          height,

          windowWidth: Math.max(
            document.documentElement.clientWidth,
            width
          ),

          windowHeight: Math.max(
            document.documentElement.clientHeight,
            height
          ),

          scrollX: 0,

          scrollY: -window.scrollY,
        }
      )

      if (
        !canvas.width ||
        !canvas.height
      ) {
        return null
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      })

      const pageWidth = 210
      const pageHeight = 297

      const margin = 8

      const printableWidth =
        pageWidth - margin * 2

      const printableHeight =
        pageHeight - margin * 2

      /*
       * Calculate how many source pixels correspond
       * to the printable A4 height.
       */
      const scale =
        printableWidth / canvas.width

      const sourcePageHeight =
        printableHeight / scale

      let sourceY = 0
      let pageIndex = 0

      while (
        sourceY < canvas.height
      ) {
        if (pageIndex > 0) {
          pdf.addPage()
        }

        const remainingHeight =
          canvas.height - sourceY

        const currentHeight =
          Math.min(
            sourcePageHeight,
            remainingHeight
          )

        const pageCanvas =
          document.createElement(
            'canvas'
          )

        pageCanvas.width =
          canvas.width

        pageCanvas.height =
          Math.ceil(currentHeight)

        const context =
          pageCanvas.getContext('2d')

        if (!context) {
          return null
        }

        /*
         * Always paint a white background.
         */
        context.fillStyle = '#ffffff'

        context.fillRect(
          0,
          0,
          pageCanvas.width,
          pageCanvas.height
        )

        /*
         * Copy the corresponding section
         * of the original invoice.
         */
        context.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          currentHeight,
          0,
          0,
          canvas.width,
          currentHeight
        )

        const renderedHeight =
          currentHeight * scale

        const imageData =
          pageCanvas.toDataURL(
            'image/jpeg',
            0.95
          )

        pdf.addImage(
          imageData,
          'JPEG',
          margin,
          margin,
          printableWidth,
          renderedHeight,
          undefined,
          'FAST'
        )

        sourceY += currentHeight

        pageIndex += 1
      }

      /*
       * Return the completed PDF as a Blob.
       */
      return pdf.output('blob')
    } catch (error) {
      console.error(
        'Invoice PDF generation failed:',
        error
      )

      return null
    } finally {
      /*
       * Restore the invoice preview exactly as it was.
       */
      element.style.width =
        originalWidth

      element.style.maxWidth =
        originalMaxWidth

      element.style.transform =
        originalTransform

      element.style.transformOrigin =
        originalTransformOrigin
    }
  }

  /*
   * ==========================================================
   * DOWNLOAD PDF
   * ==========================================================
   */

  async function downloadPdf() {
    if (!invoice || sharing) return

    setSharing(true)
    setShareMessage('')

    try {
      const pdf = await createPdf()

      if (!pdf) {
        setShareMessage(
          'Could not create the invoice PDF. Please try again.'
        )

        return
      }

      const url =
        URL.createObjectURL(pdf)

      const link =
        document.createElement('a')

      link.href = url

      link.download =
        `${invoice.invoice_number}.pdf`

      link.style.display = 'none'

      document.body.appendChild(link)

      link.click()

      document.body.removeChild(link)

      /*
       * Give the browser time to start the download
       * before releasing the Blob URL.
       */
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)

      setShareMessage(
        'Invoice PDF downloaded successfully.'
      )
    } catch (error) {
      console.error(
        'PDF download failed:',
        error
      )

      setShareMessage(
        'Could not download the PDF. Please try again.'
      )
    } finally {
      setSharing(false)
    }
  }

  /*
   * ==========================================================
   * SHARE PDF
   * ==========================================================
   */

  async function handleSend() {
    if (!invoice || sharing) return

    setSharing(true)
    setShareMessage('')

    try {
      const pdf = await createPdf()

      if (!pdf) {
        setShareMessage(
          'Could not create the invoice PDF.'
        )

        return
      }

      const file =
        new File(
          [pdf],
          `${invoice.invoice_number}.pdf`,
          {
            type: 'application/pdf',
          }
        )

      const shareData: ShareData = {
        title:
          `Invoice ${invoice.invoice_number}`,

        text:
          `Invoice ${invoice.invoice_number} from ${
            meta.business_name ||
            'your business'
          } — ${formatMoney(total)}.`,

        files: [file],
      }

      /*
       * Use native sharing only when the browser
       * explicitly supports file sharing.
       */
      const canShareFiles =
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({
          files: [file],
        })

      if (canShareFiles) {
        await navigator.share(
          shareData
        )

        setShareMessage(
          'Invoice PDF is ready to share.'
        )

        return
      }

      /*
       * Desktop browsers such as Chrome/Edge may not
       * support navigator.share().
       *
       * In that case download the PDF instead.
       */
      const url =
        URL.createObjectURL(pdf)

      const link =
        document.createElement('a')

      link.href = url

      link.download =
        `${invoice.invoice_number}.pdf`

      link.style.display = 'none'

      document.body.appendChild(link)

      link.click()

      document.body.removeChild(link)

      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)

      setShareMessage(
        'PDF downloaded. You can attach it to WhatsApp, email, or another app.'
      )
    } catch (error) {
      console.error(
        'Invoice sharing failed:',
        error
      )

      /*
       * User cancelled the native share dialog.
       */
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        setShareMessage('')
        return
      }

      /*
       * If sharing fails, automatically attempt
       * a direct download.
       */
      try {
        const pdf =
          await createPdf()

        if (!pdf) {
          throw new Error(
            'PDF creation failed'
          )
        }

        const url =
          URL.createObjectURL(pdf)

        const link =
          document.createElement('a')

        link.href = url

        link.download =
          `${invoice.invoice_number}.pdf`

        link.style.display = 'none'

        document.body.appendChild(link)

        link.click()

        document.body.removeChild(link)

        setTimeout(() => {
          URL.revokeObjectURL(url)
        }, 1000)

        setShareMessage(
          'PDF downloaded successfully. You can attach it to WhatsApp, email, or another app.'
        )
      } catch (downloadError) {
        console.error(
          'Fallback PDF download failed:',
          downloadError
        )

        setShareMessage(
          'Could not create the PDF. Please refresh the page and try again.'
        )
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="min-h-screen pb-8 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-slate-500"
            >
              <ArrowLeft size={20} />
            </button>

            <h1 className="font-display text-lg font-semibold font-mono-tab">
              {invoice.invoice_number}
            </h1>
          </div>

          <div className="flex items-center gap-3 text-slate-500">
            <Link
              to={`/invoices/${invoice.id}/edit`}
            >
              <Pencil size={18} />
            </Link>

            <button
              onClick={handleDelete}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">

        {/* =====================================================
            INVOICE PREVIEW
            ===================================================== */}

        <div
          ref={invoiceRef}
          id="invoice-pdf"
          className="ledger-card p-5 mb-5 bg-white"
        >

          {/* Branded header */}

          <div className="flex justify-between items-start gap-4 mb-6">
            <div className="flex items-start gap-2.5 min-w-0">

              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Business logo"
                  crossOrigin="anonymous"
                  className="w-10 h-10 object-contain shrink-0"
                />
              )}

              <div className="min-w-0">

                {meta.business_name && (
                  <p className="font-semibold text-sm leading-tight">
                    {meta.business_name}
                  </p>
                )}

                {meta.business_address && (
                  <p className="text-[11px] text-slate-500 whitespace-pre-line leading-snug">
                    {meta.business_address}
                  </p>
                )}

                {meta.business_phone && (
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {meta.business_phone}
                  </p>
                )}

                {meta.business_email && (
                  <p className="text-[11px] text-slate-500 leading-snug break-all">
                    {meta.business_email}
                  </p>
                )}

              </div>
            </div>

            <p className="font-display font-bold text-2xl text-[color:var(--color-ledger)] tracking-wide shrink-0">
              INVOICE
            </p>
          </div>

          {/* Bill to + invoice metadata */}

          <div className="flex justify-between gap-4 mb-5">

            <div className="min-w-0">

              <p className="text-[10px] font-bold tracking-widest text-slate-900 mb-1">
                BILL TO
              </p>

              <p className="font-semibold text-sm">
                {invoice.client?.name}
              </p>

              {invoice.client?.address && (
                <p className="text-xs text-slate-500 whitespace-pre-line">
                  {invoice.client.address}
                </p>
              )}

              {invoice.client?.phone && (
                <p className="text-xs text-slate-500">
                  {invoice.client.phone}
                </p>
              )}

            </div>

            <div className="text-xs shrink-0">

              <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">

                <span className="font-bold tracking-wide text-slate-900">
                  INVOICE #
                </span>

                <span className="text-right text-slate-500 font-mono-tab">
                  {invoice.invoice_number}
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(
                      invoice.issue_date
                    ),
                    'dd/MM/yyyy'
                  )}
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DUE DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(
                      invoice.due_date
                    ),
                    'dd/MM/yyyy'
                  )}
                </span>

              </div>
            </div>
          </div>

          {/* Line items */}

          <div className="rounded-md overflow-hidden border border-[#E7E2D6]">

            <div className="bg-[color:var(--color-ledger)] text-white text-[10px] sm:text-[11px] font-semibold grid grid-cols-[minmax(0,1fr)_32px_56px_68px] sm:grid-cols-[minmax(0,1fr)_44px_76px_92px] gap-1 sm:gap-2 px-2 sm:px-3 py-2">

              <span>
                Description
              </span>

              <span className="text-center">
                QTY
              </span>

              <span className="text-right">
                Price
              </span>

              <span className="text-right">
                Amount
              </span>

            </div>

            {items.map(
              (item, i) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(0,1fr)_32px_56px_68px] sm:grid-cols-[minmax(0,1fr)_44px_76px_92px] gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-[10px] sm:text-xs ${
                    i % 2 === 1
                      ? 'bg-[#F5F7FB]'
                      : 'bg-white'
                  }`}
                >

                  <span className="truncate">
                    {item.description}
                  </span>

                  <span className="font-mono-tab text-center text-slate-600">
                    {item.quantity}
                  </span>

                  <span className="font-mono-tab text-right text-slate-600">
                    {formatMoney(
                      item.rate
                    )}
                  </span>

                  <span className="font-mono-tab text-right">
                    {formatMoney(
                      item.quantity *
                        item.rate
                    )}
                  </span>

                </div>
              )
            )}

            {/* Totals */}

            <div className="border-t border-[#E7E2D6] bg-white">

              <div className="flex justify-between px-3 py-1.5 text-xs">

                <span className="font-semibold">
                  Subtotal
                </span>

                <span className="font-mono-tab">
                  {formatMoney(
                    subtotal
                  )}
                </span>

              </div>

              {invoice.tax_rate >
                0 && (
                <div className="flex justify-between px-3 py-1.5 text-xs text-slate-500">

                  <span>
                    Tax (
                    {
                      invoice.tax_rate
                    }
                    %)
                  </span>

                  <span className="font-mono-tab">
                    {formatMoney(
                      subtotal *
                        (invoice.tax_rate /
                          100)
                    )}
                  </span>

                </div>
              )}

              {invoice.discount >
                0 && (
                <div className="flex justify-between px-3 py-1.5 text-xs text-slate-500">

                  <span>
                    Discount
                  </span>

                  <span className="font-mono-tab">
                    -
                    {formatMoney(
                      invoice.discount
                    )}
                  </span>

                </div>
              )}

              <div className="flex justify-between items-center px-3 py-2 bg-[color:var(--color-ledger)] text-white">

                <span className="text-xs font-semibold">
                  Total
                </span>

                <span className="font-mono-tab font-bold text-sm">
                  {formatMoney(total)}
                </span>

              </div>
            </div>
          </div>

          {/* Payment method */}

          {(meta.business_payment_details ||
            paid > 0) && (
            <div className="mt-5">

              <p className="text-xs font-bold mb-1">
                Payment Method
              </p>

              {meta.business_payment_details && (
                <p className="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">
                  {
                    meta.business_payment_details
                  }
                </p>
              )}

              {paid > 0 && (
                <p className="text-[11px] text-[color:var(--color-good)] font-medium mt-1">
                  {formatMoney(
                    paid
                  )}{' '}
                  received ·{' '}
                  {formatMoney(
                    balance
                  )}{' '}
                  balance due
                </p>
              )}

            </div>
          )}

          {/* Terms */}

          {(meta.business_terms ||
            invoice.notes) && (
            <div className="mt-5">

              <p className="text-xs font-bold mb-1">
                Terms &amp; Conditions
              </p>

              {meta.business_terms && (
                <p className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">
                  {
                    meta.business_terms
                  }
                </p>
              )}

              {invoice.notes && (
                <p className="text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed mt-1">
                  {invoice.notes}
                </p>
              )}

            </div>
          )}

        </div>

        {/* =====================================================
            STATUS SUMMARY
            ===================================================== */}

        <div className="mb-5">

          <div className="flex items-center justify-between mb-1">

            <p className="text-sm text-slate-500">

              Due on{' '}

              {format(
                parseISO(
                  invoice.due_date
                ),
                'dd/MM/yyyy'
              )}

              {status ===
                'overdue' && (
                <span className="text-[color:var(--color-bad)] font-medium">
                  {' '}
                  ·{' '}
                  {
                    daysOverdue
                  }
                  d late
                </span>
              )}

            </p>

            <StatusPill
              status={status}
            />

          </div>

          <p className="font-mono-tab text-3xl font-bold">
            {formatMoney(total)}
          </p>

          <div className="flex items-center justify-between mt-0.5">

            <p className="text-base font-medium">
              {invoice.client?.name}
            </p>

            {invoice.status ===
              'draft' && (
              <span className="rounded-full bg-[#EFEFEF] text-slate-500 text-xs font-medium px-2.5 py-1">
                Not Sent
              </span>
            )}

          </div>

          {balance > 0 &&
            balance < total && (
              <p className="text-sm text-[color:var(--color-bad)] font-medium mt-0.5">
                {formatMoney(
                  balance
                )}{' '}
                unpaid
              </p>
            )}

        </div>

        {/* =====================================================
            SHARE
            ===================================================== */}

        <button
          onClick={handleSend}
          disabled={sharing}
          className="w-full rounded-xl bg-[color:var(--color-ledger)] text-white font-semibold py-3.5 text-sm mb-2 flex items-center justify-center gap-2 disabled:opacity-60"
        >

          <Send size={16} />

          {sharing
            ? 'Preparing PDF…'
            : 'Share invoice PDF'}

        </button>

        {shareMessage && (
          <p className="text-center text-xs text-slate-500 mb-4">
            {shareMessage}
          </p>
        )}

        {/* =====================================================
            SECONDARY ACTIONS
            ===================================================== */}

        <div className="grid grid-cols-4 gap-2 mb-5">

          <button
            onClick={downloadPdf}
            disabled={sharing}
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
          >

            <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">

              <Download
                size={18}
              />

            </span>

            Download

          </button>

          <button
            onClick={() =>
              window.print()
            }
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"
          >

            <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">

              <Printer
                size={18}
              />

            </span>

            Print

          </button>

          <Link
            to={`/invoices/${invoice.id}/edit`}
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"
          >

            <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">

              <Pencil
                size={18}
              />

            </span>

            Edit

          </Link>

          <div className="relative">

            <button
              onClick={() =>
                setShowMore(
                  (v) => !v
                )
              }
              className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700 w-full"
            >

              <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">

                <MoreHorizontal
                  size={18}
                />

              </span>

              More

            </button>

            {showMore && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-[#E7E2D6] rounded-lg shadow-lg py-1 w-36">

                <button
                  onClick={
                    handleDelete
                  }
                  className="w-full px-3 py-2 text-left text-xs font-medium text-[color:var(--color-bad)] flex items-center gap-2 hover:bg-[color:var(--color-bad-dim)]"
                >

                  <Trash2
                    size={14}
                  />

                  Delete invoice

                </button>

              </div>
            )}

          </div>

        </div>

        {/* =====================================================
            RECORD PAYMENT
            ===================================================== */}

        {balance > 0 &&
          !showPayment && (
            <button
              onClick={() =>
                setShowPayment(true)
              }
              className="w-full rounded-lg border border-[color:var(--color-ledger)] text-[color:var(--color-ledger)] bg-white font-semibold py-3 text-sm mb-3 flex items-center justify-center gap-2"
            >

              <Wallet
                size={16}
              />

              Record payment

            </button>
          )}

        {showPayment && (
          <form
            onSubmit={
              handleRecordPayment
            }
            className="ledger-card p-4 mb-3 space-y-3"
          >

            <p className="font-medium text-sm">
              Record a payment
            </p>

            <div className="grid grid-cols-2 gap-3">

              <div>

                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  Amount
                </label>

                <input
                  type="number"
                  step="0.01"
                  max={balance}
                  value={
                    payAmount
                  }
                  onChange={(e) =>
                    setPayAmount(
                      e.target.value
                    )
                  }
                  placeholder={balance.toFixed(
                    2
                  )}
                  className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm font-mono-tab"
                  required
                />

              </div>

              <div>

                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  Method
                </label>

                <select
                  value={
                    payMethod
                  }
                  onChange={(e) =>
                    setPayMethod(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2 text-sm bg-white"
                >

                  <option>
                    Bank transfer
                  </option>

                  <option>
                    Cash
                  </option>

                  <option>
                    Card
                  </option>

                  <option>
                    Other
                  </option>

                </select>

              </div>

            </div>

            <div className="flex gap-2">

              <button
                type="button"
                onClick={() =>
                  setShowPayment(
                    false
                  )
                }
                className="flex-1 rounded-lg border border-[#E7E2D6] py-2.5 text-sm font-medium"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-[color:var(--color-ledger)] text-white py-2.5 text-sm font-semibold disabled:opacity-60"
              >

                {saving
                  ? 'Saving…'
                  : 'Save payment'}

              </button>

            </div>

          </form>
        )}

      </div>
    </div>
  )
}
