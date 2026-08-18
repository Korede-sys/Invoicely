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

  const items =
    invoice.items ?? []

  const subtotal =
    invoiceSubtotal(items)

  const total =
    invoiceTotal(
      items,
      invoice.tax_rate,
      invoice.discount,
    )

  const paid =
    amountPaid(
      invoice.payments ?? [],
    )

  const balance =
    Math.max(
      0,
      total - paid,
    )

  const status =
    deriveStatus(invoice)

  const daysOverdue =
    differenceInCalendarDays(
      new Date(),
      parseISO(invoice.due_date),
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
   *
   * The PDF is generated from the invoice displayed on screen,
   * but uses an A4-sized temporary layout.
   *
   * Important:
   *
   * - Description receives 55% of the line-item width.
   * - QTY receives 10%.
   * - Price receives 17%.
   * - Amount receives 18%.
   * - The complete invoice is scaled to fit ONE A4 page.
   * - No second page is created.
   * - Long descriptions wrap instead of being clipped.
   * - Financial values stay on one line.
   */

  async function createPdf(): Promise<jsPDF | null> {
    let pdfContainer:
      | HTMLDivElement
      | null = null

    try {
      if (!invoice) {
        return null
      }

      /*
       * --------------------------------------------------------
       * FIND ORIGINAL INVOICE
       * --------------------------------------------------------
       */

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

      /*
       * --------------------------------------------------------
       * WAIT FOR FONTS
       * --------------------------------------------------------
       */

      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      /*
       * --------------------------------------------------------
       * A4 DIMENSIONS
       *
       * 794px ≈ A4 width at 96 DPI.
       * 1123px ≈ A4 height at 96 DPI.
       * --------------------------------------------------------
       */

      const PDF_WIDTH = 794
      const PDF_HEIGHT = 1123

      /*
       * --------------------------------------------------------
       * CREATE TEMPORARY CONTAINER
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
        `${PDF_WIDTH}px`

      pdfContainer.style.height =
        `${PDF_HEIGHT}px`

      pdfContainer.style.margin =
        '0'

      pdfContainer.style.padding =
        '0'

      pdfContainer.style.background =
        '#ffffff'

      pdfContainer.style.overflow =
        'hidden'

      pdfContainer.style.zIndex =
        '-9999'

      pdfContainer.style.pointerEvents =
        'none'

      /*
       * --------------------------------------------------------
       * CLONE REAL INVOICE
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
        `${PDF_WIDTH}px`

      pdfClone.style.minWidth =
        `${PDF_WIDTH}px`

      pdfClone.style.maxWidth =
        `${PDF_WIDTH}px`

      pdfClone.style.height =
        'auto'

      pdfClone.style.minHeight =
        '0'

      pdfClone.style.maxHeight =
        `${PDF_HEIGHT}px`

      pdfClone.style.margin =
        '0'

      pdfClone.style.padding =
        '28px'

      pdfClone.style.boxSizing =
        'border-box'

      pdfClone.style.background =
        '#ffffff'

      pdfClone.style.overflow =
        'hidden'

      /*
       * --------------------------------------------------------
       * ADD CLONE TO DOCUMENT
       * --------------------------------------------------------
       */

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

          /*
           * Typography
           */

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
           * ----------------------------------------------------
           * SAFE COLOR CONVERSION
           * ----------------------------------------------------
           */

          const safeColor = (
            value: string,
            fallback: string,
          ) => {
            if (
              !value ||
              value.includes(
                'oklch',
              ) ||
              value.includes(
                'oklab',
              )
            ) {
              return fallback
            }

            return value
          }

          target.style.color =
            safeColor(
              computed.color,
              '#0f172a',
            )

          target.style.backgroundColor =
            safeColor(
              computed.backgroundColor,
              '#ffffff',
            )

          target.style.borderTopColor =
            safeColor(
              computed.borderTopColor,
              '#e7e2d6',
            )

          target.style.borderRightColor =
            safeColor(
              computed.borderRightColor,
              '#e7e2d6',
            )

          target.style.borderBottomColor =
            safeColor(
              computed.borderBottomColor,
              '#e7e2d6',
            )

          target.style.borderLeftColor =
            safeColor(
              computed.borderLeftColor,
              '#e7e2d6',
            )
        },
      )

      /*
       * --------------------------------------------------------
       * LINE ITEM GRIDS
       * --------------------------------------------------------
       *
       * Original screen:
       *
       * Description | QTY | Price | Amount
       *
       * PDF:
       *
       * Description = 55%
       * QTY         = 10%
       * Price       = 17%
       * Amount      = 18%
       *
       * This prevents Description, Price and Amount from
       * being clipped.
       * --------------------------------------------------------
       */

      const grids =
        Array.from(
          pdfClone.querySelectorAll(
            '[class*="grid-cols-"]',
          ),
        )

      grids.forEach(
        (element) => {
          const row =
            element as HTMLElement

          const children =
            Array.from(
              row.children,
            ) as HTMLElement[]

          if (
            children.length === 4
          ) {
            row.style.display =
              'grid'

            row.style.gridTemplateColumns =
              '55% 10% 17% 18%'

            row.style.width =
              '100%'

            row.style.minWidth =
              '0'

            row.style.maxWidth =
              '100%'

            row.style.gap =
              '0'

            row.style.boxSizing =
              'border-box'

            children.forEach(
              (child) => {
                child.style.minWidth =
                  '0'

                child.style.maxWidth =
                  '100%'

                child.style.boxSizing =
                  'border-box'

                child.style.overflow =
                  'hidden'
              },
            )

            /*
             * Description
             */

            children[0].style.whiteSpace =
              'normal'

            children[0].style.wordBreak =
              'break-word'

            children[0].style.overflowWrap =
              'anywhere'

            /*
             * Quantity
             */

            children[1].style.whiteSpace =
              'nowrap'

            children[1].style.textAlign =
              'center'

            /*
             * Price
             */

            children[2].style.whiteSpace =
              'nowrap'

            children[2].style.textAlign =
              'right'

            /*
             * Amount
             */

            children[3].style.whiteSpace =
              'nowrap'

            children[3].style.textAlign =
              'right'
          }
        },
      )

      /*
       * --------------------------------------------------------
       * TABLES
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
            table as HTMLElement

          element.style.width =
            '100%'

          element.style.maxWidth =
            '100%'

          element.style.tableLayout =
            'fixed'

          element.style.borderCollapse =
            'collapse'

          element.style.boxSizing =
            'border-box'
        },
      )

      /*
       * --------------------------------------------------------
       * FINANCIAL VALUES
       * --------------------------------------------------------
       */

      const financialElements =
        Array.from(
          pdfClone.querySelectorAll(
            '.font-mono-tab',
          ),
        )

      financialElements.forEach(
        (element) => {
          const htmlElement =
            element as HTMLElement

          htmlElement.style.whiteSpace =
            'nowrap'

          htmlElement.style.wordBreak =
            'normal'

          htmlElement.style.overflowWrap =
            'normal'

          htmlElement.style.fontVariantNumeric =
            'tabular-nums'

          htmlElement.style.maxWidth =
            '100%'
        },
      )

      /*
       * --------------------------------------------------------
       * PREVENT HORIZONTAL OVERFLOW
       * --------------------------------------------------------
       */

      const allElements =
        Array.from(
          pdfClone.querySelectorAll('*'),
        )

      allElements.forEach(
        (element) => {
          const htmlElement =
            element as HTMLElement

          htmlElement.style.maxWidth =
            '100%'

          htmlElement.style.boxSizing =
            'border-box'
        },
      )

      /*
       * --------------------------------------------------------
       * PDF LINE ITEM FONT SIZES
       * --------------------------------------------------------
       */

      const invoiceRows =
        Array.from(
          pdfClone.querySelectorAll(
            '[class*="grid-cols-"]',
          ),
        )

      invoiceRows.forEach(
        (row) => {
          const rowElement =
            row as HTMLElement

          const children =
            Array.from(
              rowElement.children,
            ) as HTMLElement[]

          if (
            children.length === 4
          ) {
            children[0].style.fontSize =
              '11px'

            children[1].style.fontSize =
              '10px'

            children[2].style.fontSize =
              '10px'

            children[3].style.fontSize =
              '10px'
          }
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
                () =>
                  undefined,
              )
          }
        } catch {
          /*
           * Image/logo errors should
           * never stop PDF generation.
           */
        }
      }

      /*
       * --------------------------------------------------------
       * FORCE LAYOUT RECALCULATION
       * --------------------------------------------------------
       */

      void pdfClone.offsetHeight

      await new Promise<void>(
        (resolve) => {
          window.requestAnimationFrame(
            () => {
              window.requestAnimationFrame(
                () => resolve(),
              )
            },
          )
        },
      )

      /*
       * --------------------------------------------------------
       * CAPTURE WITH HTML2CANVAS
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

            width:
              PDF_WIDTH,

            windowWidth:
              PDF_WIDTH,

            height:
              Math.min(
                pdfClone.scrollHeight,
                PDF_HEIGHT,
              ),

            windowHeight:
              PDF_HEIGHT,

            ignoreElements:
              () => false,
          },
        )

      /*
       * --------------------------------------------------------
       * REMOVE TEMPORARY ELEMENT
       * --------------------------------------------------------
       */

      pdfContainer.remove()

      pdfContainer = null

      /*
       * --------------------------------------------------------
       * VALIDATE CANVAS
       * --------------------------------------------------------
       */

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

          unit:
            'mm',

          format:
            'a4',

          compress:
            true,
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

      /*
       * --------------------------------------------------------
       * SCALE TO FIT ONE A4 PAGE
       * --------------------------------------------------------
       *
       * The smaller scale between width and height is used.
       *
       * This guarantees that the invoice stays completely
       * inside the A4 printable area.
       * --------------------------------------------------------
       */

      const widthScale =
        printableWidth /
        canvas.width

      const heightScale =
        printableHeight /
        canvas.height

      const scale =
        Math.min(
          widthScale,
          heightScale,
        )

      const renderedWidth =
        canvas.width *
        scale

      const renderedHeight =
        canvas.height *
        scale

      /*
       * Center invoice on A4.
       */

      const x =
        (pageWidth -
          renderedWidth) /
        2

      const y =
        (pageHeight -
          renderedHeight) /
        2

      /*
       * --------------------------------------------------------
       * ADD COMPLETE INVOICE TO ONE A4 PAGE
       * --------------------------------------------------------
       */

      pdf.addImage(
        canvas.toDataURL(
          'image/jpeg',
          0.96,
        ),
        'JPEG',
        x,
        y,
        renderedWidth,
        renderedHeight,
        undefined,
        'FAST',
      )

      return pdf
    } catch (error) {
      console.error(
        'createPdf() failed:',
        error,
      )

      /*
       * Always remove temporary
       * elements if generation fails.
       */

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
    if (!invoice) {
      return
    }

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
        `${invoice.invoice_number}.pdf`

      pdf.save(fileName)

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
    if (!invoice) {
      return
    }

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
        `${invoice.invoice_number}.pdf`

      const blob =
        pdf.output('blob')

      const file =
        new File(
          [blob],
          fileName,
          {
            type:
              'application/pdf',
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
                `Invoice ${invoice.invoice_number}`,

              text:
                `Invoice ${invoice.invoice_number} from ${
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
              setShareMessage(
                '',
              )

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

      /*
       * --------------------------------------------------------
       * FINAL FALLBACK
       * --------------------------------------------------------
       */

      try {
        const fallbackPdf =
          await createPdf()

        if (fallbackPdf) {
          fallbackPdf.save(
            `${invoice.invoice_number}.pdf`,
          )

          setShareMessage(
            'Sharing was unavailable, so the PDF was downloaded instead.',
          )

          return
        }
      } catch (
        fallbackError
      ) {
        console.error(
          'Fallback PDF generation failed:',
          fallbackError,
        )
      }

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
            >
              <ArrowLeft
                size={20}
              />
            </button>

            <h1 className="font-display text-lg font-semibold font-mono-tab">
              {
                invoice.invoice_number
              }
            </h1>

          </div>

          <div className="flex items-center gap-3 text-slate-500">

            <Link
              to={`/invoices/${invoice.id}/edit`}
            >
              <Pencil
                size={18}
              />
            </Link>

            <button
              onClick={
                handleDelete
              }
            >
              <Trash2
                size={18}
              />
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
          className="ledger-card p-5 mb-5 bg-white"
        >

          {/* =================================================
              BRANDED HEADER
              ================================================= */}

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
              BILL TO + INVOICE META
              ================================================= */}

          <div className="flex justify-between gap-4 mb-5">

            <div className="min-w-0">

              <p className="text-[10px] font-bold tracking-widest text-slate-900 mb-1">
                BILL TO
              </p>

              <p className="font-semibold text-sm">
                {
                  invoice.client
                    ?.name
                }
              </p>

              {invoice.client?.address && (
                <p className="text-xs text-slate-500 whitespace-pre-line">
                  {
                    invoice.client
                      .address
                  }
                </p>
              )}

              {invoice.client?.phone && (
                <p className="text-xs text-slate-500">
                  {
                    invoice.client
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
                    invoice.invoice_number
                  }
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(
                      invoice.issue_date,
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
                      invoice.due_date,
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
                    {
                      item.description
                    }
                  </span>

                  <span className="font-mono-tab text-center text-slate-600">
                    {
                      item.quantity
                    }
                  </span>

                  <span className="font-mono-tab text-right text-slate-600 whitespace-nowrap">
                    {formatMoney(
                      item.rate,
                    )}
                  </span>

                  <span className="font-mono-tab text-right whitespace-nowrap">
                    {formatMoney(
                      item.quantity *
                        item.rate,
                    )}
                  </span>

                </div>
              ),
            )}

            {/* =================================================
                TOTALS
                ================================================= */}

            <div className="border-t border-[#E7E2D6] bg-white">

              <div className="flex justify-between px-3 py-1.5 text-xs">

                <span className="font-semibold">
                  Subtotal
                </span>

                <span className="font-mono-tab whitespace-nowrap">
                  {formatMoney(
                    subtotal,
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

                  <span className="font-mono-tab whitespace-nowrap">
                    {formatMoney(
                      subtotal *
                        (invoice.tax_rate /
                          100),
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

                  <span className="font-mono-tab whitespace-nowrap">
                    -
                    {formatMoney(
                      invoice.discount,
                    )}
                  </span>

                </div>
              )}

              <div className="flex justify-between items-center px-3 py-2 bg-[color:var(--color-ledger)] text-white">

                <span className="text-xs font-semibold">
                  Total
                </span>

                <span className="font-mono-tab font-bold text-sm whitespace-nowrap">
                  {formatMoney(
                    total,
                  )}
                </span>

              </div>

            </div>

          </div>

          {/* =================================================
              PAYMENT METHOD
              ================================================= */}

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
              TERMS
              ================================================= */}

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
                  {
                    invoice.notes
                  }
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
                  invoice.due_date,
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
                invoice.client
                  ?.name
              }
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
                  (v) => !v,
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
                setShowPayment(
                  true,
                )
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