import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
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
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
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

  async function load() {
    if (!id) return

    const inv = await fetchInvoice(id)
    setInvoice(inv)
  }

  useEffect(() => {
    load()
  }, [id])

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
  const balance = Math.max(0, total - paid)
  const status = deriveStatus(invoice)

  const daysOverdue = differenceInCalendarDays(
    new Date(),
    parseISO(invoice.due_date)
  )

  async function handleDelete() {
    if (
      !id ||
      !confirm('Delete this invoice? This cannot be undone.')
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

  async function loadImageAsDataUrl(
    url: string
  ): Promise<{
    dataUrl: string
    format: 'PNG' | 'JPEG'
    width: number
    height: number
  } | null> {
    try {
      const res = await fetch(url)
      const blob = await res.blob()

      const format: 'PNG' | 'JPEG' =
        blob.type.includes('png') ? 'PNG' : 'JPEG'

      const dataUrl = await new Promise<string>(
        (resolve, reject) => {
          const reader = new FileReader()

          reader.onload = () =>
            resolve(reader.result as string)

          reader.onerror = reject

          reader.readAsDataURL(blob)
        }
      )

      const dims = await new Promise<{
        width: number
        height: number
      }>((resolve) => {
        const img = new Image()

        img.onload = () =>
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight,
          })

        img.src = dataUrl
      })

      return {
        dataUrl,
        format,
        ...dims,
      }
    } catch {
      return null
    }
  }

  async function createPdf(): Promise<Blob | undefined> {
    if (!invoice) return

    const doc = new jsPDF({
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = 210
    const pageHeight = 297
    const marginX = 14
    const contentWidth = pageWidth - marginX * 2
    const bottomLimit = pageHeight - 20

    let y = 18
    let page = 1

    const blue = {
      r: 36,
      g: 84,
      b: 255,
    }

    const text = {
      r: 15,
      g: 23,
      b: 42,
    }

    const muted = {
      r: 100,
      g: 116,
      b: 139,
    }

    const border = {
      r: 231,
      g: 226,
      b: 214,
    }

    const rowAlt = {
      r: 245,
      g: 247,
      b: 251,
    }

    const good = {
      r: 22,
      g: 128,
      b: 90,
    }

    function setTextColor(
      color: {
        r: number
        g: number
        b: number
      }
    ) {
      doc.setTextColor(
        color.r,
        color.g,
        color.b
      )
    }

    function setFillColor(
      color: {
        r: number
        g: number
        b: number
      }
    ) {
      doc.setFillColor(
        color.r,
        color.g,
        color.b
      )
    }

    function setDrawColor(
      color: {
        r: number
        g: number
        b: number
      }
    ) {
      doc.setDrawColor(
        color.r,
        color.g,
        color.b
      )
    }

    function drawFooter() {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)

      doc.text(
        `Page ${page}`,
        pageWidth - marginX,
        pageHeight - 10,
        {
          align: 'right',
        }
      )

      setTextColor(text)
    }

    function addNewPage() {
      drawFooter()

      doc.addPage()

      page += 1
      y = 18
    }

    function ensureSpace(requiredHeight: number) {
      if (y + requiredHeight <= bottomLimit) {
        return
      }

      addNewPage()
    }

    const logo = logoUrl
      ? await loadImageAsDataUrl(logoUrl)
      : null

    /*
     * ==========================================
     * HEADER
     * ==========================================
     */

    let businessX = marginX

    if (logo) {
      const logoHeight = 12

      const logoWidth = Math.min(
        34,
        (logo.width / logo.height) * logoHeight
      )

      doc.addImage(
        logo.dataUrl,
        logo.format,
        marginX,
        y,
        logoWidth,
        logoHeight
      )

      businessX = marginX + logoWidth + 4
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setTextColor(text)

    if (meta.business_name) {
      doc.text(
        meta.business_name,
        businessX,
        y + 4
      )
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setTextColor(muted)

    let businessY = y + 8

    const businessDetails = [
      meta.business_address,
      meta.business_phone,
      meta.business_email,
    ].filter(Boolean)

    businessDetails.forEach((line) => {
      const lines = doc.splitTextToSize(
        String(line),
        72
      )

      doc.text(
        lines,
        businessX,
        businessY
      )

      businessY +=
        lines.length * 3.4
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    setTextColor(blue)

    doc.text(
      'INVOICE',
      pageWidth - marginX,
      y + 7,
      {
        align: 'right',
      }
    )

    y = Math.max(
      y + 16,
      businessY + 2
    )

    /*
     * ==========================================
     * BILL TO + INVOICE INFORMATION
     * ==========================================
     */

    const sectionStartY = y

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setTextColor(text)

    doc.text(
      'BILL TO',
      marginX,
      sectionStartY
    )

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setTextColor(text)

    doc.text(
      invoice.client?.name ?? '',
      marginX,
      sectionStartY + 6
    )

    let clientY = sectionStartY + 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setTextColor(muted)

    if (invoice.client?.address) {
      const addressLines = doc.splitTextToSize(
        invoice.client.address,
        82
      )

      doc.text(
        addressLines,
        marginX,
        clientY
      )

      clientY +=
        addressLines.length * 3.5
    }

    if (invoice.client?.phone) {
      doc.text(
        invoice.client.phone,
        marginX,
        clientY
      )

      clientY += 3.5
    }

    const metadataX = 138
    const metadataValueX = pageWidth - marginX

    const metadata = [
      [
        'INVOICE #',
        invoice.invoice_number,
      ],
      [
        'DATE',
        format(
          parseISO(invoice.issue_date),
          'dd/MM/yyyy'
        ),
      ],
      [
        'DUE DATE',
        format(
          parseISO(invoice.due_date),
          'dd/MM/yyyy'
        ),
      ],
    ]

    metadata.forEach(
      ([label, value], index) => {
        const rowY =
          sectionStartY +
          index * 5

        doc.setFont(
          'helvetica',
          'bold'
        )
        doc.setFontSize(7)
        setTextColor(text)

        doc.text(
          label,
          metadataX,
          rowY
        )

        doc.setFont(
          'helvetica',
          'normal'
        )
        setTextColor(muted)

        doc.text(
          value,
          metadataValueX,
          rowY,
          {
            align: 'right',
          }
        )
      }
    )

    y =
      Math.max(
        clientY,
        sectionStartY + 15
      ) + 8

    /*
     * ==========================================
     * ITEMS TABLE HEADER
     * ==========================================
     */

    const tableX = marginX
    const tableWidth = contentWidth

    const descriptionX = tableX + 3
    const qtyX = 128
    const priceX = 156
    const amountX = pageWidth - marginX

    const tableHeaderHeight = 8

    setFillColor(blue)

    doc.roundedRect(
      tableX,
      y,
      tableWidth,
      tableHeaderHeight,
      1.5,
      1.5,
      'F'
    )

    doc.setFont(
      'helvetica',
      'bold'
    )

    doc.setFontSize(7.5)

    doc.setTextColor(
      255,
      255,
      255
    )

    doc.text(
      'Description',
      descriptionX,
      y + 5.3
    )

    doc.text(
      'QTY',
      qtyX,
      y + 5.3,
      {
        align: 'center',
      }
    )

    doc.text(
      'Price',
      priceX,
      y + 5.3,
      {
        align: 'right',
      }
    )

    doc.text(
      'Amount',
      amountX,
      y + 5.3,
      {
        align: 'right',
      }
    )

    y += tableHeaderHeight

    /*
     * ==========================================
     * ITEMS
     * ==========================================
     */

    items.forEach(
      (item, index) => {
        const descriptionLines =
          doc.splitTextToSize(
            item.description,
            105
          )

        const rowHeight = Math.max(
          8,
          descriptionLines.length * 4 + 4
        )

        ensureSpace(
          rowHeight + 2
        )

        if (index % 2 === 1) {
          setFillColor(rowAlt)
        } else {
          setFillColor({
            r: 255,
            g: 255,
            b: 255,
          })
        }

        doc.rect(
          tableX,
          y,
          tableWidth,
          rowHeight,
          'F'
        )

        setDrawColor(border)

        doc.setLineWidth(0.15)

        doc.line(
          tableX,
          y + rowHeight,
          tableX + tableWidth,
          y + rowHeight
        )

        doc.setFont(
          'helvetica',
          'normal'
        )

        doc.setFontSize(7.5)
        setTextColor(text)

        doc.text(
          descriptionLines,
          descriptionX,
          y + 5
        )

        setTextColor(muted)

        doc.text(
          String(item.quantity),
          qtyX,
          y + 5,
          {
            align: 'center',
          }
        )

        doc.text(
          formatMoney(item.rate),
          priceX,
          y + 5,
          {
            align: 'right',
          }
        )

        setTextColor(text)

        doc.text(
          formatMoney(
            item.quantity *
              item.rate
          ),
          amountX,
          y + 5,
          {
            align: 'right',
          }
        )

        y += rowHeight
      }
    )

    /*
     * ==========================================
     * TOTALS
     * ==========================================
     */

    const totalsHeight =
      8 +
      (invoice.tax_rate > 0
        ? 6
        : 0) +
      (invoice.discount > 0
        ? 6
        : 0) +
      10

    ensureSpace(
      totalsHeight + 5
    )

    setDrawColor(border)

    doc.setLineWidth(0.2)

    doc.line(
      tableX,
      y,
      tableX + tableWidth,
      y
    )

    y += 6

    doc.setFont(
      'helvetica',
      'bold'
    )

    doc.setFontSize(8)

    setTextColor(text)

    doc.text(
      'Subtotal',
      tableX + 3,
      y
    )

    doc.setFont(
      'helvetica',
      'normal'
    )

    doc.text(
      formatMoney(subtotal),
      amountX,
      y,
      {
        align: 'right',
      }
    )

    y += 5

    if (invoice.tax_rate > 0) {
      setTextColor(muted)

      doc.text(
        `Tax (${invoice.tax_rate}%)`,
        tableX + 3,
        y
      )

      doc.text(
        formatMoney(
          subtotal *
            (invoice.tax_rate /
              100)
        ),
        amountX,
        y,
        {
          align: 'right',
        }
      )

      y += 5
    }

    if (invoice.discount > 0) {
      setTextColor(muted)

      doc.text(
        'Discount',
        tableX + 3,
        y
      )

      doc.text(
        `-${formatMoney(
          invoice.discount
        )}`,
        amountX,
        y,
        {
          align: 'right',
        }
      )

      y += 5
    }

    /*
     * ==========================================
     * TOTAL BAR
     * ==========================================
     */

    setFillColor(blue)

    doc.roundedRect(
      tableX,
      y,
      tableWidth,
      9,
      1.5,
      1.5,
      'F'
    )

    doc.setFont(
      'helvetica',
      'bold'
    )

    doc.setFontSize(9)

    doc.setTextColor(
      255,
      255,
      255
    )

    doc.text(
      'Total',
      tableX + 3,
      y + 6
    )

    doc.text(
      formatMoney(total),
      amountX,
      y + 6,
      {
        align: 'right',
      }
    )

    y += 15

    /*
     * ==========================================
     * PAYMENT METHOD
     * ==========================================
     */

    if (
      meta.business_payment_details ||
      paid > 0
    ) {
      ensureSpace(30)

      doc.setFont(
        'helvetica',
        'bold'
      )

      doc.setFontSize(8)

      setTextColor(text)

      doc.text(
        'Payment Method',
        marginX,
        y
      )

      y += 5

      if (
        meta.business_payment_details
      ) {
        doc.setFont(
          'helvetica',
          'normal'
        )

        doc.setFontSize(7.5)

        setTextColor(muted)

        const paymentLines =
          doc.splitTextToSize(
            meta.business_payment_details,
            contentWidth
          )

        doc.text(
          paymentLines,
          marginX,
          y
        )

        y +=
          paymentLines.length *
          3.5
      }

      if (paid > 0) {
        y += 2

        doc.setFont(
          'helvetica',
          'bold'
        )

        doc.setFontSize(7.5)

        setTextColor(good)

        doc.text(
          `${formatMoney(
            paid
          )} received · ${formatMoney(
            balance
          )} balance due`,
          marginX,
          y
        )

        y += 5
      }
    }

    /*
     * ==========================================
     * TERMS & CONDITIONS
     * ==========================================
     */

    if (
      meta.business_terms ||
      invoice.notes
    ) {
      ensureSpace(30)

      y += 5

      doc.setFont(
        'helvetica',
        'bold'
      )

      doc.setFontSize(8)

      setTextColor(text)

      doc.text(
        'Terms & Conditions',
        marginX,
        y
      )

      y += 5

      doc.setFont(
        'helvetica',
        'normal'
      )

      doc.setFontSize(7.5)

      setTextColor(muted)

      if (meta.business_terms) {
        const termLines =
          doc.splitTextToSize(
            meta.business_terms,
            contentWidth
          )

        doc.text(
          termLines,
          marginX,
          y
        )

        y +=
          termLines.length *
          3.5
      }

      if (invoice.notes) {
        if (meta.business_terms) {
          y += 2
        }

        const noteLines =
          doc.splitTextToSize(
            invoice.notes,
            contentWidth
          )

        doc.text(
          noteLines,
          marginX,
          y
        )

        y +=
          noteLines.length *
          3.5
      }
    }

    drawFooter()

    return doc.output('blob')
  }

  async function downloadPdf() {
    const pdf = await createPdf()

    if (!pdf || !invoice) return

    const url =
      URL.createObjectURL(pdf)

    const link =
      document.createElement('a')

    link.href = url
    link.download = `${invoice.invoice_number}.pdf`

    link.click()

    URL.revokeObjectURL(url)
  }

  async function handleSend() {
    if (!invoice) return

    setSharing(true)
    setShareMessage('')

    try {
      const pdf = await createPdf()

      if (!pdf) return

      const file = new File(
        [pdf],
        `${invoice.invoice_number}.pdf`,
        {
          type: 'application/pdf',
        }
      )

      const shareData = {
        title: `Invoice ${invoice.invoice_number}`,
        text: `Invoice ${invoice.invoice_number} from ${
          meta.business_name ||
          'your business'
        } — ${formatMoney(total)}.`,
        files: [file],
      }

      if (
        navigator.share &&
        (!navigator.canShare ||
          navigator.canShare(shareData))
      ) {
        await navigator.share(
          shareData
        )

        setShareMessage(
          'Invoice PDF is ready to share.'
        )
      } else {
        await downloadPdf()

        setShareMessage(
          'Your browser downloaded the PDF. Attach it in the app you want to use.'
        )
      }
    } catch (error) {
      if (
        !(
          error instanceof DOMException &&
          error.name === 'AbortError'
        )
      ) {
        setShareMessage(
          'Could not open sharing. Please try downloading the PDF instead.'
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

            <button onClick={handleDelete}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Document preview */}
        <div className="ledger-card p-5 mb-5">

          {/* Branded header */}
          <div className="flex justify-between items-start gap-4 mb-6">
            <div className="flex items-start gap-2.5 min-w-0">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Business logo"
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

          {/* Bill to + invoice meta */}
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
                    parseISO(invoice.issue_date),
                    'dd/MM/yyyy'
                  )}
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DUE DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(invoice.due_date),
                    'dd/MM/yyyy'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-md overflow-hidden border border-[#E7E2D6]">
            <div className="bg-[color:var(--color-ledger)] text-white text-[10px] sm:text-[11px] font-semibold grid grid-cols-[minmax(0,1fr)_32px_56px_68px] sm:grid-cols-[minmax(0,1fr)_44px_76px_92px] gap-1 sm:gap-2 px-2 sm:px-3 py-2">
              <span>Description</span>

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

            {items.map((item, i) => (
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
                  {formatMoney(item.rate)}
                </span>

                <span className="font-mono-tab text-right">
                  {formatMoney(
                    item.quantity *
                      item.rate
                  )}
                </span>
              </div>
            ))}

            {/* Totals */}
            <div className="border-t border-[#E7E2D6] bg-white">
              <div className="flex justify-between px-3 py-1.5 text-xs">
                <span className="font-semibold">
                  Subtotal
                </span>

                <span className="font-mono-tab">
                  {formatMoney(subtotal)}
                </span>
              </div>

              {invoice.tax_rate > 0 && (
                <div className="flex justify-between px-3 py-1.5 text-xs text-slate-500">
                  <span>
                    Tax ({invoice.tax_rate}%)
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

              {invoice.discount > 0 && (
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
                  {formatMoney(paid)} received ·{' '}
                  {formatMoney(balance)} balance due
                </p>
              )}
            </div>
          )}

          {/* Terms & conditions */}
          {(meta.business_terms ||
            invoice.notes) && (
            <div className="mt-5">
              <p className="text-xs font-bold mb-1">
                Terms &amp; Conditions
              </p>

              {meta.business_terms && (
                <p className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">
                  {meta.business_terms}
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

        {/* Status summary */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-500">
              Due on{' '}
              {format(
                parseISO(invoice.due_date),
                'dd/MM/yyyy'
              )}

              {status === 'overdue' && (
                <span className="text-[color:var(--color-bad)] font-medium">
                  {' '}
                  · {daysOverdue}d late
                </span>
              )}
            </p>

            <StatusPill status={status} />
          </div>

          <p className="font-mono-tab text-3xl font-bold">
            {formatMoney(total)}
          </p>

          <div className="flex items-center justify-between mt-0.5">
            <p className="text-base font-medium">
              {invoice.client?.name}
            </p>

            {invoice.status === 'draft' && (
              <span className="rounded-full bg-[#EFEFEF] text-slate-500 text-xs font-medium px-2.5 py-1">
                Not Sent
              </span>
            )}
          </div>

          {balance > 0 &&
            balance < total && (
              <p className="text-sm text-[color:var(--color-bad)] font-medium mt-0.5">
                {formatMoney(balance)} unpaid
              </p>
            )}
        </div>

        {/* Primary action */}
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

        {/* Secondary actions */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <button
            onClick={downloadPdf}
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"
          >
            <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">
              <Download size={18} />
            </span>

            Download
          </button>

          <button
            onClick={() => window.print()}
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"
          >
            <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">
              <Printer size={18} />
            </span>

            Print
          </button>

          <Link
            to={`/invoices/${invoice.id}/edit`}
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"
          >
            <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">
              <Pencil size={18} />
            </span>

            Edit
          </Link>

          <div className="relative">
            <button
              onClick={() =>
                setShowMore((v) => !v)
              }
              className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700 w-full"
            >
              <span className="w-11 h-11 rounded-full bg-[color:var(--color-ledger-dim)] flex items-center justify-center text-[color:var(--color-ledger)]">
                <MoreHorizontal size={18} />
              </span>

              More
            </button>

            {showMore && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-[#E7E2D6] rounded-lg shadow-lg py-1 w-36">
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-[color:var(--color-bad)] flex items-center gap-2 hover:bg-[color:var(--color-bad-dim)]"
                >
                  <Trash2 size={14} />

                  Delete invoice
                </button>
              </div>
            )}
          </div>
        </div>

        {balance > 0 &&
          !showPayment && (
            <button
              onClick={() =>
                setShowPayment(true)
              }
              className="w-full rounded-lg border border-[color:var(--color-ledger)] text-[color:var(--color-ledger)] bg-white font-semibold py-3 text-sm mb-3 flex items-center justify-center gap-2"
            >
              <Wallet size={16} />

              Record payment
            </button>
          )}

        {showPayment && (
          <form
            onSubmit={handleRecordPayment}
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
                  value={payAmount}
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
                  value={payMethod}
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
                  setShowPayment(false)
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
