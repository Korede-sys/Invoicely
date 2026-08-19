import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
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

/*
 * ==========================================================
 * WHOLE NAIRA FORMAT
 * ==========================================================
 *
 * Used ONLY for:
 *   - Price
 *   - Amount
 *
 * The invoice Total continues using formatMoney(), so the
 * total can display Kobo/decimal places.
 *
 * Example:
 *
 * Price  -> ₦9,000
 * Amount -> ₦499,500
 * Total  -> ₦2,197,980.00
 */

function formatWholeMoney(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

export function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const invoiceRef =
    useRef<HTMLDivElement | null>(null)

  const meta = (user?.user_metadata ?? {}) as Record<
    string,
    string
  >

  const logoUrl =
    meta.business_logo_url

  const [showMore, setShowMore] =
    useState(false)

  const [invoice, setInvoice] =
    useState<Invoice | null>(null)

  const [showPayment, setShowPayment] =
    useState(false)

  const [payAmount, setPayAmount] =
    useState('')

  const [payMethod, setPayMethod] =
    useState('Bank transfer')

  const [saving, setSaving] =
    useState(false)

  const [sharing, setSharing] =
    useState(false)

  const [shareMessage, setShareMessage] =
    useState('')

  const load = useCallback(
    async () => {
      if (!id) return

      const inv =
        await fetchInvoice(id)

      setInvoice(inv)
    },
    [id],
  )

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

  /*
   * Keep a non-null reference for nested functions.
   */
  const invoiceData =
    invoice

  const items =
    invoiceData.items ?? []

  const subtotal =
    invoiceSubtotal(items)

  const total =
    invoiceTotal(
      items,
      invoiceData.tax_rate,
      invoiceData.discount,
    )

  const paid =
    amountPaid(
      invoiceData.payments ?? [],
    )

  const balance =
    Math.max(
      0,
      total - paid,
    )

  const status =
    deriveStatus(invoiceData)

  const daysOverdue =
    differenceInCalendarDays(
      new Date(),
      parseISO(invoiceData.due_date),
    )

  async function handleDelete() {
    if (
      !id ||
      !confirm(
        'Delete this invoice? This cannot be undone.',
      )
    ) {
      return
    }

    await deleteInvoice(id)

    navigate('/')
  }

  async function handleRecordPayment(
    e: FormEvent,
  ) {
    e.preventDefault()

    if (!id || !user) return

    const amount =
      parseFloat(payAmount)

    if (
      !amount ||
      amount <= 0
    ) {
      return
    }

    setSaving(true)

    try {
      await recordPayment(
        id,
        user.id,
        amount,
        new Date()
          .toISOString()
          .slice(0, 10),
        payMethod,
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
   * CREATE PDF
   * ==========================================================
   */

  async function createPdf(): Promise<jsPDF | null> {
    let pdfContainer:
      | HTMLDivElement
      | null = null

    try {
      const original =
        invoiceRef.current ||
        document.getElementById(
          'invoice-pdf',
        )

      if (!original) {
        console.error(
          'Invoice PDF element could not be found.',
        )

        return null
      }

      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      /*
       * --------------------------------------------------------
       * TEMPORARY PDF CONTAINER
       * --------------------------------------------------------
       */

      pdfContainer =
        document.createElement('div')

      pdfContainer.style.position =
        'fixed'

      pdfContainer.style.left =
        '-100000px'

      pdfContainer.style.top =
        '0'

      pdfContainer.style.width =
        '760px'

      pdfContainer.style.margin =
        '0'

      pdfContainer.style.padding =
        '0'

      pdfContainer.style.background =
        '#ffffff'

      pdfContainer.style.zIndex =
        '-9999'

      pdfContainer.style.pointerEvents =
        'none'

      /*
       * --------------------------------------------------------
       * CLONE INVOICE
       * --------------------------------------------------------
       */

      const pdfClone =
        original.cloneNode(
          true,
        ) as HTMLElement

      pdfClone.removeAttribute(
        'id',
      )

      pdfClone.style.width =
        '760px'

      pdfClone.style.minWidth =
        '760px'

      pdfClone.style.maxWidth =
        '760px'

      pdfClone.style.margin =
        '0'

      pdfClone.style.padding =
        '20px'

      pdfClone.style.boxSizing =
        'border-box'

      pdfClone.style.background =
        '#ffffff'

      pdfContainer.appendChild(
        pdfClone,
      )

      document.body.appendChild(
        pdfContainer,
      )

      /*
       * --------------------------------------------------------
       * COPY COMPUTED STYLES
       * --------------------------------------------------------
       */

      const originalElements =
        Array.from(
          original.querySelectorAll('*'),
        )

      const cloneElements =
        Array.from(
          pdfClone.querySelectorAll('*'),
        )

      originalElements.forEach(
        (
          originalElement,
          index,
        ) => {
          const cloneElement =
            cloneElements[index]

          if (!cloneElement) {
            return
          }

          const source =
            originalElement as HTMLElement

          const target =
            cloneElement as HTMLElement

          const computed =
            window.getComputedStyle(
              source,
            )

          target.style.fontFamily =
            computed.fontFamily

          target.style.fontSize =
            computed.fontSize

          target.style.fontWeight =
            computed.fontWeight

          target.style.fontStyle =
            computed.fontStyle

          target.style.lineHeight =
            computed.lineHeight

          target.style.letterSpacing =
            computed.letterSpacing

          target.style.textTransform =
            computed.textTransform

          target.style.textAlign =
            computed.textAlign

          target.style.verticalAlign =
            computed.verticalAlign

          target.style.boxSizing =
            'border-box'

          /*
           * Colors
           */

          if (
            computed.color
          ) {
            target.style.color =
              computed.color.includes(
                'oklch',
              ) ||
              computed.color.includes(
                'oklab',
              )
                ? '#0f172a'
                : computed.color
          }

          if (
            computed.backgroundColor
          ) {
            target.style.backgroundColor =
              computed.backgroundColor.includes(
                'oklch',
              ) ||
              computed.backgroundColor.includes(
                'oklab',
              )
                ? '#ffffff'
                : computed.backgroundColor
          }

          /*
           * Borders
           */

          if (
            computed.borderTopColor
          ) {
            target.style.borderTopColor =
              computed.borderTopColor.includes(
                'oklch',
              ) ||
              computed.borderTopColor.includes(
                'oklab',
              )
                ? '#e7e2d6'
                : computed.borderTopColor
          }

          if (
            computed.borderRightColor
          ) {
            target.style.borderRightColor =
              computed.borderRightColor.includes(
                'oklch',
              ) ||
              computed.borderRightColor.includes(
                'oklab',
              )
                ? '#e7e2d6'
                : computed.borderRightColor
          }

          if (
            computed.borderBottomColor
          ) {
            target.style.borderBottomColor =
              computed.borderBottomColor.includes(
                'oklch',
              ) ||
              computed.borderBottomColor.includes(
                'oklab',
              )
                ? '#e7e2d6'
                : computed.borderBottomColor
          }

          if (
            computed.borderLeftColor
          ) {
            target.style.borderLeftColor =
              computed.borderLeftColor.includes(
                'oklch',
              ) ||
              computed.borderLeftColor.includes(
                'oklab',
              )
                ? '#e7e2d6'
                : computed.borderLeftColor
          }
        },
      )

      /*
       * --------------------------------------------------------
       * FORCE TABLE LAYOUT
       * --------------------------------------------------------
       */

      const tables =
        Array.from(
          pdfClone.querySelectorAll(
            'table',
          ),
        )

      tables.forEach(
        (table) => {
          const element =
            table as HTMLTableElement

          element.style.width =
            '100%'

          element.style.minWidth =
            '0'

          element.style.maxWidth =
            '100%'

          element.style.tableLayout =
            'fixed'

          element.style.borderCollapse =
            'collapse'

          element.style.borderSpacing =
            '0'

          const colgroup =
            element.querySelector(
              'colgroup',
            )

          if (colgroup) {
            const cols =
              Array.from(
                colgroup.querySelectorAll(
                  'col',
                ),
              )

            if (
              cols.length >= 4
            ) {
              cols[0].style.width =
                '38%'

              cols[1].style.width =
                '12%'

              cols[2].style.width =
                '23%'

              cols[3].style.width =
                '27%'
            }
          }

          const cells =
            Array.from(
              element.querySelectorAll(
                'th, td',
              ),
            )

          cells.forEach(
            (cell) => {
              const cellElement =
                cell as HTMLElement

              cellElement.style.boxSizing =
                'border-box'

              cellElement.style.overflow =
                'hidden'

              cellElement.style.verticalAlign =
                'top'
            },
          )

          const descriptionCells =
            Array.from(
              element.querySelectorAll(
                '[data-description]',
              ),
            )

          descriptionCells.forEach(
            (cell) => {
              const cellElement =
                cell as HTMLElement

              cellElement.style.whiteSpace =
                'normal'

              cellElement.style.wordBreak =
                'normal'

              cellElement.style.overflowWrap =
                'anywhere'

              cellElement.style.textOverflow =
                'clip'

              cellElement.style.minWidth =
                '0'

              cellElement.style.width =
                '38%'
            },
          )

          const numberCells =
            Array.from(
              element.querySelectorAll(
                '[data-number]',
              ),
            )

          numberCells.forEach(
            (cell) => {
              const cellElement =
                cell as HTMLElement

              cellElement.style.whiteSpace =
                'nowrap'

              cellElement.style.wordBreak =
                'normal'

              cellElement.style.overflow =
                'hidden'

              cellElement.style.textOverflow =
                'clip'
            },
          )

          const bodyRows =
            Array.from(
              element.querySelectorAll(
                'tbody tr',
              ),
            )

          bodyRows.forEach(
            (row) => {
              const cells =
                Array.from(
                  row.children,
                )

              if (
                cells.length === 4
              ) {
                const [
                  description,
                  quantity,
                  price,
                  amount,
                ] =
                  cells as HTMLElement[]

                description.style.width =
                  '38%'

                quantity.style.width =
                  '12%'

                price.style.width =
                  '23%'

                amount.style.width =
                  '27%'

                description.style.whiteSpace =
                  'normal'

                description.style.overflowWrap =
                  'anywhere'

                quantity.style.whiteSpace =
                  'nowrap'

                price.style.whiteSpace =
                  'nowrap'

                amount.style.whiteSpace =
                  'nowrap'
              }
            },
          )
        },
      )

      /*
       * --------------------------------------------------------
       * LOAD IMAGES
       * --------------------------------------------------------
       */

      const images =
        Array.from(
          pdfClone.querySelectorAll(
            'img',
          ),
        )

      for (const image of images) {
        try {
          if (!image.complete) {
            await new Promise<void>(
              (resolve) => {
                let finished =
                  false

                const done =
                  () => {
                    if (
                      finished
                    ) {
                      return
                    }

                    finished =
                      true

                    image.removeEventListener(
                      'load',
                      done,
                    )

                    image.removeEventListener(
                      'error',
                      done,
                    )

                    resolve()
                  }

                image.addEventListener(
                  'load',
                  done,
                )

                image.addEventListener(
                  'error',
                  done,
                )

                window.setTimeout(
                  done,
                  5000,
                )
              },
            )
          }

          if (
            typeof image.decode ===
            'function'
          ) {
            await image
              .decode()
              .catch(
                () => undefined,
              )
          }
        } catch {
          // Ignore image problems.
        }
      }

      /*
       * --------------------------------------------------------
       * CAPTURE
       * --------------------------------------------------------
       */

      const canvas =
        await html2canvas(
          pdfClone,
          {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor:
              '#ffffff',
            logging: false,
            imageTimeout:
              10000,
            removeContainer:
              true,
            width: 760,
            windowWidth: 760,
            ignoreElements:
              () => false,
          },
        )

      pdfContainer.remove()

      pdfContainer = null

      if (
        !canvas ||
        canvas.width <= 0 ||
        canvas.height <= 0
      ) {
        console.error(
          'PDF canvas is empty.',
        )

        return null
      }

      /*
       * --------------------------------------------------------
       * CREATE A4 PDF
       * --------------------------------------------------------
       */

      const pdf =
        new jsPDF({
          orientation:
            'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        })

      const pageWidth =
        210

      const pageHeight =
        297

      const margin =
        8

      const printableWidth =
        pageWidth -
        margin * 2

      const printableHeight =
        pageHeight -
        margin * 2

      const pdfScale =
        printableWidth /
        canvas.width

      const renderedHeight =
        canvas.height *
        pdfScale

      /*
       * --------------------------------------------------------
       * SINGLE PAGE
       * --------------------------------------------------------
       */

      if (
        renderedHeight <=
        printableHeight
      ) {
        pdf.addImage(
          canvas.toDataURL(
            'image/jpeg',
            0.96,
          ),
          'JPEG',
          margin,
          margin,
          printableWidth,
          renderedHeight,
          undefined,
          'FAST',
        )

        return pdf
      }

      /*
       * --------------------------------------------------------
       * MULTIPLE PAGE FALLBACK
       * --------------------------------------------------------
       */

      const sourcePageHeight =
        printableHeight /
        pdfScale

      let sourceY = 0

      let pageNumber = 0

      while (
        sourceY <
        canvas.height
      ) {
        if (
          pageNumber > 0
        ) {
          pdf.addPage()
        }

        const remainingHeight =
          canvas.height -
          sourceY

        const currentSourceHeight =
          Math.min(
            sourcePageHeight,
            remainingHeight,
          )

        const pageCanvas =
          document.createElement(
            'canvas',
          )

        pageCanvas.width =
          canvas.width

        pageCanvas.height =
          Math.ceil(
            currentSourceHeight,
          )

        const context =
          pageCanvas.getContext(
            '2d',
          )

        if (!context) {
          return null
        }

        context.fillStyle =
          '#ffffff'

        context.fillRect(
          0,
          0,
          pageCanvas.width,
          pageCanvas.height,
        )

        context.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          currentSourceHeight,
          0,
          0,
          canvas.width,
          currentSourceHeight,
        )

        const pageRenderedHeight =
          currentSourceHeight *
          pdfScale

        pdf.addImage(
          pageCanvas.toDataURL(
            'image/jpeg',
            0.96,
          ),
          'JPEG',
          margin,
          margin,
          printableWidth,
          pageRenderedHeight,
          undefined,
          'FAST',
        )

        sourceY +=
          currentSourceHeight

        pageNumber += 1
      }

      return pdf
    } catch (error) {
      console.error(
        'createPdf() failed:',
        error,
      )

      if (pdfContainer) {
        pdfContainer.remove()
      }

      return null
    }
  }

  /*
   * ==========================================================
   * DOWNLOAD PDF
   * ==========================================================
   */

  async function downloadPdf() {
    setShareMessage('')

    try {
      const pdf =
        await createPdf()

      if (!pdf) {
        setShareMessage(
          'Could not create the invoice PDF. Please try again.',
        )

        return
      }

      pdf.save(
        `${invoiceData.invoice_number}.pdf`,
      )

      setShareMessage(
        'Invoice PDF downloaded successfully.',
      )
    } catch (error) {
      console.error(
        'Download PDF failed:',
        error,
      )

      setShareMessage(
        'Could not download the PDF. Please try again.',
      )
    }
  }

  /*
   * ==========================================================
   * SHARE PDF
   * ==========================================================
   */

  async function handleSend() {
    setSharing(true)

    setShareMessage('')

    try {
      const pdf =
        await createPdf()

      if (!pdf) {
        setShareMessage(
          'Could not create the invoice PDF. Please try again.',
        )

        return
      }

      const fileName =
        `${invoiceData.invoice_number}.pdf`

      const blob =
        pdf.output('blob')

      const file =
        new File(
          [blob],
          fileName,
          {
            type: 'application/pdf',
          },
        )

      /*
       * --------------------------------------------------------
       * NATIVE FILE SHARING
       * --------------------------------------------------------
       */

      if (
        typeof navigator.share ===
        'function'
      ) {
        let canShareFiles =
          false

        if (
          typeof navigator.canShare ===
          'function'
        ) {
          try {
            canShareFiles =
              navigator.canShare({
                files: [file],
              })
          } catch {
            canShareFiles =
              false
          }
        }

        if (
          canShareFiles
        ) {
          try {
            await navigator.share({
              title:
                `Invoice ${invoiceData.invoice_number}`,

              text:
                `Invoice ${invoiceData.invoice_number} from ${
                  meta.business_name ||
                  'your business'
                } — ${formatMoney(total)}.`,

              files: [file],
            })

            setShareMessage(
              'Invoice PDF is ready to share.',
            )

            return
          } catch (error) {
            if (
              error instanceof
                DOMException &&
              error.name ===
                'AbortError'
            ) {
              setShareMessage('')

              return
            }

            console.error(
              'Native sharing failed:',
              error,
            )
          }
        }
      }

      /*
       * --------------------------------------------------------
       * DESKTOP FALLBACK
       * --------------------------------------------------------
       */

      pdf.save(
        fileName,
      )

      setShareMessage(
        'Your browser does not support direct file sharing. The PDF has been downloaded instead.',
      )
    } catch (error) {
      console.error(
        'Share PDF failed:',
        error,
      )

      setShareMessage(
        'Could not create or share the PDF. Please try again.',
      )
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="min-h-screen pb-8 bg-[color:var(--color-paper)]">

      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">

        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <button
              onClick={() =>
                navigate(-1)
              }
              className="text-slate-500"
              type="button"
            >
              <ArrowLeft size={20} />
            </button>

            <h1 className="font-display text-lg font-semibold font-mono-tab">
              {
                invoiceData.invoice_number
              }
            </h1>

          </div>

          <div className="flex items-center gap-3 text-slate-500">

            <Link
              to={`/invoices/${invoiceData.id}/edit`}
            >
              <Pencil size={18} />
            </Link>

            <button
              onClick={
                handleDelete
              }
              type="button"
            >
              <Trash2 size={18} />
            </button>

          </div>

        </div>

      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">

        {/* =====================================================
            INVOICE DOCUMENT
            ===================================================== */}

        <div
          ref={invoiceRef}
          id="invoice-pdf"
          data-invoice-document
          className="ledger-card p-5 mb-5 bg-white"
        >

          {/* =================================================
              BUSINESS HEADER
              ================================================= */}

          <div className="flex justify-between items-start gap-4 mb-6">

            <div className="flex items-start gap-2.5 min-w-0 flex-1">

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
                    {
                      meta.business_name
                    }
                  </p>
                )}

                {meta.business_address && (
                  <p className="text-[11px] text-slate-500 whitespace-pre-line leading-snug">
                    {
                      meta.business_address
                    }
                  </p>
                )}

                {meta.business_phone && (
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {
                      meta.business_phone
                    }
                  </p>
                )}

                {meta.business_email && (
                  <p className="text-[11px] text-slate-500 leading-snug break-all">
                    {
                      meta.business_email
                    }
                  </p>
                )}

              </div>

            </div>

            <p className="font-display font-bold text-2xl text-[color:var(--color-ledger)] tracking-wide shrink-0">
              INVOICE
            </p>

          </div>

          {/* =================================================
              BILL TO + META
              ================================================= */}

          <div className="flex justify-between gap-4 mb-5">

            <div className="min-w-0 flex-1">

              <p className="text-[10px] font-bold tracking-widest text-slate-900 mb-1">
                BILL TO
              </p>

              <p className="font-semibold text-sm">
                {
                  invoiceData.client
                    ?.name
                }
              </p>

              {invoiceData.client?.address && (
                <p className="text-xs text-slate-500 whitespace-pre-line">
                  {
                    invoiceData.client
                      .address
                  }
                </p>
              )}

              {invoiceData.client?.phone && (
                <p className="text-xs text-slate-500">
                  {
                    invoiceData.client
                      .phone
                  }
                </p>
              )}

            </div>

            <div className="text-xs shrink-0">

              <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">

                <span className="font-bold tracking-wide text-slate-900">
                  INVOICE #
                </span>

                <span className="text-right text-slate-500 font-mono-tab">
                  {
                    invoiceData.invoice_number
                  }
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(
                      invoiceData.issue_date,
                    ),
                    'dd/MM/yyyy',
                  )}
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DUE DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(
                      invoiceData.due_date,
                    ),
                    'dd/MM/yyyy',
                  )}
                </span>

              </div>

            </div>

          </div>

          {/* =================================================
              LINE ITEMS
              ================================================= */}

          <div className="rounded-md overflow-hidden border border-[#E7E2D6]">

            <table
              className="w-full border-collapse table-fixed"
              style={{
                tableLayout:
                  'fixed',
                width: '100%',
              }}
            >

              <colgroup>

                <col
                  style={{
                    width: '38%',
                  }}
                />

                <col
                  style={{
                    width: '12%',
                  }}
                />

                <col
                  style={{
                    width: '23%',
                  }}
                />

                <col
                  style={{
                    width: '27%',
                  }}
                />

              </colgroup>

              <thead>

                <tr className="bg-[color:var(--color-ledger)] text-white text-[10px] sm:text-[11px] font-semibold">

                  <th
                    className="text-left px-2 sm:px-3 py-2 font-semibold"
                    style={{
                      width: '38%',
                    }}
                  >
                    Description
                  </th>

                  <th
                    className="text-center px-1 py-2 font-semibold"
                    style={{
                      width: '12%',
                    }}
                  >
                    QTY
                  </th>

                  <th
                    className="text-right px-1.5 py-2 font-semibold"
                    style={{
                      width: '23%',
                    }}
                  >
                    Price
                  </th>

                  <th
                    className="text-right px-2 sm:px-3 py-2 font-semibold"
                    style={{
                      width: '27%',
                    }}
                  >
                    Amount
                  </th>

                </tr>

              </thead>

              <tbody>

                {items.map(
                  (
                    item,
                    i,
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      className={
                        i % 2 ===
                        1
                          ? 'bg-[#F5F7FB]'
                          : 'bg-white'
                      }
                    >

                      <td
                        data-description
                        className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs align-top leading-snug"
                        style={{
                          width: '38%',
                          whiteSpace:
                            'normal',
                          wordBreak:
                            'normal',
                          overflowWrap:
                            'anywhere',
                          verticalAlign:
                            'top',
                        }}
                      >
                        {
                          item.description
                        }
                      </td>

                      <td
                        data-number
                        className="px-1 py-2 text-[10px] sm:text-xs font-mono-tab text-center text-slate-600 align-top"
                        style={{
                          width: '12%',
                          whiteSpace:
                            'nowrap',
                          verticalAlign:
                            'top',
                        }}
                      >
                        {
                          item.quantity
                        }
                      </td>

                      <td
                        data-number
                        className="px-1.5 py-2 text-[10px] sm:text-xs font-mono-tab text-right text-slate-600 align-top"
                        style={{
                          width: '23%',
                          whiteSpace:
                            'nowrap',
                          verticalAlign:
                            'top',
                        }}
                      >
                        {formatWholeMoney(
                          item.rate,
                        )}
                      </td>

                      <td
                        data-number
                        className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-mono-tab text-right align-top"
                        style={{
                          width: '27%',
                          whiteSpace:
                            'nowrap',
                          verticalAlign:
                            'top',
                        }}
                      >
                        {formatWholeMoney(
                          item.quantity *
                            item.rate,
                        )}
                      </td>

                    </tr>
                  ),
                )}

              </tbody>

              {/* =================================================
                  TOTALS
                  ================================================= */}

              <tfoot>

                <tr className="border-t border-[#E7E2D6] bg-white">

                  <td
                    colSpan={3}
                    className="px-3 py-1.5 text-xs font-semibold text-right"
                  >
                    Subtotal
                  </td>

                  <td
                    className="px-2 sm:px-3 py-1.5 text-xs font-mono-tab text-right"
                    style={{
                      whiteSpace:
                        'nowrap',
                    }}
                  >
                    {formatMoney(
                      subtotal,
                    )}
                  </td>

                </tr>

                {invoiceData.tax_rate >
                  0 && (
                  <tr className="bg-white">

                    <td
                      colSpan={3}
                      className="px-3 py-1.5 text-xs text-slate-500 text-right"
                    >
                      Tax (
                      {
                        invoiceData.tax_rate
                      }
                      %)
                    </td>

                    <td
                      className="px-2 sm:px-3 py-1.5 text-xs font-mono-tab text-right"
                      style={{
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {formatMoney(
                        subtotal *
                          (invoiceData.tax_rate /
                            100),
                      )}
                    </td>

                  </tr>
                )}

                {invoiceData.discount >
                  0 && (
                  <tr className="bg-white">

                    <td
                      colSpan={3}
                      className="px-3 py-1.5 text-xs text-slate-500 text-right"
                    >
                      Discount
                    </td>

                    <td
                      className="px-2 sm:px-3 py-1.5 text-xs font-mono-tab text-right"
                      style={{
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      -
                      {formatMoney(
                        invoiceData.discount,
                      )}
                    </td>

                  </tr>
                )}

                <tr className="bg-[color:var(--color-ledger)] text-white">

                  <td
                    colSpan={3}
                    className="px-3 py-2 text-xs font-semibold text-right"
                  >
                    Total
                  </td>

                  <td
                    className="px-2 sm:px-3 py-2 text-sm font-mono-tab font-bold text-right"
                    style={{
                      whiteSpace:
                        'nowrap',
                    }}
                  >
                    {formatMoney(
                      total,
                    )}
                  </td>

                </tr>

              </tfoot>

            </table>

          </div>

          {/* =================================================
              PAYMENT METHOD
              ================================================= */}

          {(
            meta.business_payment_details ||
            paid > 0
          ) && (
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
                  {
                    formatMoney(
                      paid,
                    )
                  }{' '}
                  received ·{' '}
                  {
                    formatMoney(
                      balance,
                    )
                  }{' '}
                  balance due
                </p>
              )}

            </div>
          )}

          {/* =================================================
              TERMS & CONDITIONS
              
              ONE HEADING ONLY.
              
              Business terms and invoice notes are displayed
              underneath the same heading.
              ================================================= */}

          {(meta.business_terms ||
            invoiceData.notes) && (
            <div className="mt-5">

              <p className="text-xs font-bold mb-1">
                Terms &amp; Conditions
              </p>

              <div className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">

                {meta.business_terms && (
                  <p>
                    {
                      meta.business_terms
                    }
                  </p>
                )}

                {meta.business_terms &&
                  invoiceData.notes && (
                    <p className="mt-1">
                      {
                        invoiceData.notes
                      }
                    </p>
                  )}

                {!meta.business_terms &&
                  invoiceData.notes && (
                    <p>
                      {
                        invoiceData.notes
                      }
                    </p>
                  )}

              </div>

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
                  invoiceData.due_date,
                ),
                'dd/MM/yyyy',
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
              {
                invoiceData.client
                  ?.name
              }
            </p>

            {invoiceData.status ===
              'draft' && (
              <span className="rounded-full bg-[#EFEFEF] text-slate-500 text-xs font-medium px-2.5 py-1">
                Not Sent
              </span>
            )}

          </div>

          {balance > 0 &&
            balance < total && (
              <p className="text-sm text-[color:var(--color-bad)] font-medium mt-0.5">
                {
                  formatMoney(
                    balance,
                  )
                }{' '}
                unpaid
              </p>
            )}

        </div>

        {/* =====================================================
            SHARE
            ===================================================== */}

        <button
          onClick={
            handleSend
          }
          disabled={sharing}
          type="button"
          className="w-full rounded-xl bg-[color:var(--color-ledger)] text-white font-semibold py-3.5 text-sm mb-2 flex items-center justify-center gap-2 disabled:opacity-60"
        >

          <Send size={16} />

          {sharing
            ? 'Preparing PDF…'
            : 'Share invoice PDF'}

        </button>

        {shareMessage && (
          <p className="text-center text-xs text-slate-500 mb-4">
            {
              shareMessage
            }
          </p>
        )}

        {/* =====================================================
            SECONDARY ACTIONS
            ===================================================== */}

        <div className="grid grid-cols-4 gap-2 mb-5">

          <button
            onClick={
              downloadPdf
            }
            type="button"
            className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium text-slate-700"
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
            type="button"
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
            to={`/invoices/${invoiceData.id}/edit`}
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
                  (v) => !v,
                )
              }
              type="button"
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
                  type="button"
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
                setShowPayment(
                  true,
                )
              }
              type="button"
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
                  value={payAmount}
                  onChange={(e) =>
                    setPayAmount(
                      e.target.value,
                    )
                  }
                  placeholder={balance.toFixed(
                    2,
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
                      e.target.value,
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
                    false,
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