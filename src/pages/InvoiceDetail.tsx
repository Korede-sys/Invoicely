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
    invoice.discount,
  )

  const paid = amountPaid(invoice.payments ?? [])

  const balance = Math.max(0, total - paid)

  const status = deriveStatus(invoice)

  const daysOverdue = differenceInCalendarDays(
    new Date(),
    parseISO(invoice.due_date),
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

  async function handleRecordPayment(e: FormEvent) {
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
   * We intentionally create a separate fixed-width PDF layout.
   *
   * The normal invoice is responsive and designed for phones.
   * Capturing that responsive version can squeeze the Price,
   * Amount and Total columns.
   *
   * The PDF version below uses a fixed 760px document width,
   * which keeps all financial columns properly aligned.
   */
  async function createPdf(): Promise<jsPDF | null> {
    try {
      if (!invoice) {
        return null
      }

      /*
       * Wait for fonts.
       */
      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      /*
       * --------------------------------------------------------
       * PDF DOCUMENT
       * --------------------------------------------------------
       */

      const pdfDocument = document.createElement('div')

      pdfDocument.style.position = 'fixed'
      pdfDocument.style.left = '-100000px'
      pdfDocument.style.top = '0'
      pdfDocument.style.width = '760px'
      pdfDocument.style.background = '#ffffff'
      pdfDocument.style.color = '#0f172a'
      pdfDocument.style.padding = '0'
      pdfDocument.style.margin = '0'
      pdfDocument.style.boxSizing = 'border-box'
      pdfDocument.style.fontFamily =
        'Arial, Helvetica, sans-serif'
      pdfDocument.style.zIndex = '-9999'

      /*
       * --------------------------------------------------------
       * LOGO
       * --------------------------------------------------------
       */

      const logoHtml = logoUrl
        ? `
          <img
            src="${escapeHtmlAttribute(logoUrl)}"
            crossorigin="anonymous"
            style="
              width:56px;
              height:56px;
              object-fit:contain;
              display:block;
              flex:none;
            "
          />
        `
        : ''

      /*
       * --------------------------------------------------------
       * ITEMS
       * --------------------------------------------------------
       */

      const itemRows = items
        .map((item) => {
          const amount =
            Number(item.quantity) * Number(item.rate)

          return `
            <tr>
              <td
                style="
                  padding:11px 12px;
                  border-bottom:1px solid #e7e2d6;
                  font-size:12px;
                  color:#0f172a;
                  width:50%;
                  word-break:break-word;
                  vertical-align:top;
                "
              >
                ${escapeHtml(item.description)}
              </td>

              <td
                style="
                  padding:11px 8px;
                  border-bottom:1px solid #e7e2d6;
                  font-size:12px;
                  text-align:center;
                  color:#475569;
                  width:10%;
                  vertical-align:top;
                  white-space:nowrap;
                "
              >
                ${item.quantity}
              </td>

              <td
                style="
                  padding:11px 8px;
                  border-bottom:1px solid #e7e2d6;
                  font-size:12px;
                  text-align:right;
                  color:#475569;
                  width:18%;
                  vertical-align:top;
                  white-space:nowrap;
                "
              >
                ${escapeHtml(formatMoney(item.rate))}
              </td>

              <td
                style="
                  padding:11px 12px;
                  border-bottom:1px solid #e7e2d6;
                  font-size:12px;
                  text-align:right;
                  color:#0f172a;
                  font-weight:600;
                  width:22%;
                  vertical-align:top;
                  white-space:nowrap;
                "
              >
                ${escapeHtml(formatMoney(amount))}
              </td>
            </tr>
          `
        })
        .join('')

      /*
       * --------------------------------------------------------
       * TAX
       * --------------------------------------------------------
       */

      const taxAmount =
        subtotal * (invoice.tax_rate / 100)

      const taxRow =
        invoice.tax_rate > 0
          ? `
            <div
              style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:8px 14px;
                font-size:12px;
                color:#64748b;
              "
            >
              <span>
                Tax (${invoice.tax_rate}%)
              </span>

              <span
                style="
                  font-family:monospace;
                  white-space:nowrap;
                "
              >
                ${escapeHtml(formatMoney(taxAmount))}
              </span>
            </div>
          `
          : ''

      /*
       * --------------------------------------------------------
       * DISCOUNT
       * --------------------------------------------------------
       */

      const discountRow =
        invoice.discount > 0
          ? `
            <div
              style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:8px 14px;
                font-size:12px;
                color:#64748b;
              "
            >
              <span>
                Discount
              </span>

              <span
                style="
                  font-family:monospace;
                  white-space:nowrap;
                "
              >
                -${escapeHtml(formatMoney(invoice.discount))}
              </span>
            </div>
          `
          : ''

      /*
       * --------------------------------------------------------
       * PAYMENT INFORMATION
       * --------------------------------------------------------
       */

      const paymentSection =
        meta.business_payment_details || paid > 0
          ? `
            <div
              style="
                margin-top:24px;
                padding-top:16px;
                border-top:1px solid #e7e2d6;
              "
            >
              <div
                style="
                  font-size:12px;
                  font-weight:700;
                  margin-bottom:6px;
                  color:#0f172a;
                "
              >
                Payment Method
              </div>

              ${
                meta.business_payment_details
                  ? `
                    <div
                      style="
                        font-size:11px;
                        line-height:1.6;
                        color:#475569;
                        white-space:pre-line;
                      "
                    >
                      ${escapeHtml(
                        meta.business_payment_details,
                      )}
                    </div>
                  `
                  : ''
              }

              ${
                paid > 0
                  ? `
                    <div
                      style="
                        font-size:11px;
                        line-height:1.6;
                        color:#15803d;
                        font-weight:600;
                        margin-top:5px;
                      "
                    >
                      ${escapeHtml(formatMoney(paid))}
                      received ·
                      ${escapeHtml(formatMoney(balance))}
                      balance due
                    </div>
                  `
                  : ''
              }
            </div>
          `
          : ''

      /*
       * --------------------------------------------------------
       * TERMS
       * --------------------------------------------------------
       */

      const termsSection =
        meta.business_terms || invoice.notes
          ? `
            <div
              style="
                margin-top:24px;
                padding-top:16px;
                border-top:1px solid #e7e2d6;
              "
            >
              <div
                style="
                  font-size:12px;
                  font-weight:700;
                  margin-bottom:6px;
                  color:#0f172a;
                "
              >
                Terms &amp; Conditions
              </div>

              ${
                meta.business_terms
                  ? `
                    <div
                      style="
                        font-size:10px;
                        line-height:1.6;
                        color:#475569;
                        white-space:pre-line;
                      "
                    >
                      ${escapeHtml(meta.business_terms)}
                    </div>
                  `
                  : ''
              }

              ${
                invoice.notes
                  ? `
                    <div
                      style="
                        font-size:10px;
                        line-height:1.6;
                        color:#475569;
                        white-space:pre-wrap;
                        margin-top:5px;
                      "
                    >
                      ${escapeHtml(invoice.notes)}
                    </div>
                  `
                  : ''
              }
            </div>
          `
          : ''

      /*
       * --------------------------------------------------------
       * COMPLETE PDF HTML
       * --------------------------------------------------------
       */

      pdfDocument.innerHTML = `
        <div
          style="
            width:760px;
            box-sizing:border-box;
            background:#ffffff;
            padding:36px 40px 40px 40px;
            color:#0f172a;
          "
        >

          <!-- HEADER -->

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:30px;
              margin-bottom:34px;
            "
          >

            <div
              style="
                display:flex;
                align-items:flex-start;
                gap:14px;
                min-width:0;
                max-width:480px;
              "
            >
              ${logoHtml}

              <div
                style="
                  min-width:0;
                "
              >

                ${
                  meta.business_name
                    ? `
                      <div
                        style="
                          font-size:16px;
                          line-height:1.25;
                          font-weight:700;
                          margin-bottom:4px;
                          color:#0f172a;
                        "
                      >
                        ${escapeHtml(meta.business_name)}
                      </div>
                    `
                    : ''
                }

                ${
                  meta.business_address
                    ? `
                      <div
                        style="
                          font-size:11px;
                          line-height:1.45;
                          color:#64748b;
                          white-space:pre-line;
                        "
                      >
                        ${escapeHtml(meta.business_address)}
                      </div>
                    `
                    : ''
                }

                ${
                  meta.business_phone
                    ? `
                      <div
                        style="
                          font-size:11px;
                          line-height:1.45;
                          color:#64748b;
                        "
                      >
                        ${escapeHtml(meta.business_phone)}
                      </div>
                    `
                    : ''
                }

                ${
                  meta.business_email
                    ? `
                      <div
                        style="
                          font-size:11px;
                          line-height:1.45;
                          color:#64748b;
                          word-break:break-all;
                        "
                      >
                        ${escapeHtml(meta.business_email)}
                      </div>
                    `
                    : ''
                }

              </div>
            </div>

            <div
              style="
                font-size:34px;
                line-height:1;
                font-weight:800;
                letter-spacing:1px;
                color:#16324f;
                white-space:nowrap;
              "
            >
              INVOICE
            </div>

          </div>

          <!-- BILL TO / META -->

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:30px;
              margin-bottom:28px;
            "
          >

            <div
              style="
                min-width:0;
                max-width:430px;
              "
            >

              <div
                style="
                  font-size:10px;
                  line-height:1;
                  font-weight:800;
                  letter-spacing:1.5px;
                  color:#0f172a;
                  margin-bottom:8px;
                "
              >
                BILL TO
              </div>

              <div
                style="
                  font-size:14px;
                  line-height:1.4;
                  font-weight:700;
                  margin-bottom:3px;
                "
              >
                ${escapeHtml(invoice.client?.name ?? '')}
              </div>

              ${
                invoice.client?.address
                  ? `
                    <div
                      style="
                        font-size:11px;
                        line-height:1.5;
                        color:#64748b;
                        white-space:pre-line;
                      "
                    >
                      ${escapeHtml(invoice.client.address)}
                    </div>
                  `
                  : ''
              }

              ${
                invoice.client?.phone
                  ? `
                    <div
                      style="
                        font-size:11px;
                        line-height:1.5;
                        color:#64748b;
                      "
                    >
                      ${escapeHtml(invoice.client.phone)}
                    </div>
                  `
                  : ''
              }

            </div>

            <table
              style="
                border-collapse:collapse;
                min-width:260px;
                font-size:11px;
              "
            >
              <tbody>

                <tr>
                  <td
                    style="
                      padding:3px 16px 3px 0;
                      font-weight:800;
                      white-space:nowrap;
                    "
                  >
                    INVOICE #
                  </td>

                  <td
                    style="
                      padding:3px 0;
                      text-align:right;
                      color:#64748b;
                      white-space:nowrap;
                      font-family:monospace;
                    "
                  >
                    ${escapeHtml(invoice.invoice_number)}
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:3px 16px 3px 0;
                      font-weight:800;
                      white-space:nowrap;
                    "
                  >
                    DATE
                  </td>

                  <td
                    style="
                      padding:3px 0;
                      text-align:right;
                      color:#64748b;
                      white-space:nowrap;
                    "
                  >
                    ${format(
                      parseISO(invoice.issue_date),
                      'dd/MM/yyyy',
                    )}
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:3px 16px 3px 0;
                      font-weight:800;
                      white-space:nowrap;
                    "
                  >
                    DUE DATE
                  </td>

                  <td
                    style="
                      padding:3px 0;
                      text-align:right;
                      color:#64748b;
                      white-space:nowrap;
                    "
                  >
                    ${format(
                      parseISO(invoice.due_date),
                      'dd/MM/yyyy',
                    )}
                  </td>
                </tr>

              </tbody>
            </table>

          </div>

          <!-- ITEMS -->

          <table
            style="
              width:100%;
              border-collapse:collapse;
              table-layout:fixed;
              border:1px solid #e7e2d6;
              border-radius:6px;
              overflow:hidden;
            "
          >

            <thead>
              <tr
                style="
                  background:#16324f;
                  color:#ffffff;
                "
              >

                <th
                  style="
                    width:50%;
                    padding:11px 12px;
                    text-align:left;
                    font-size:11px;
                    font-weight:700;
                  "
                >
                  Description
                </th>

                <th
                  style="
                    width:10%;
                    padding:11px 8px;
                    text-align:center;
                    font-size:11px;
                    font-weight:700;
                  "
                >
                  QTY
                </th>

                <th
                  style="
                    width:18%;
                    padding:11px 8px;
                    text-align:right;
                    font-size:11px;
                    font-weight:700;
                  "
                >
                  Price
                </th>

                <th
                  style="
                    width:22%;
                    padding:11px 12px;
                    text-align:right;
                    font-size:11px;
                    font-weight:700;
                  "
                >
                  Amount
                </th>

              </tr>
            </thead>

            <tbody>
              ${itemRows}
            </tbody>

          </table>

          <!-- TOTALS -->

          <div
            style="
              width:100%;
              box-sizing:border-box;
              border-left:1px solid #e7e2d6;
              border-right:1px solid #e7e2d6;
              border-bottom:1px solid #e7e2d6;
            "
          >

            <div
              style="
                display:flex;
                justify-content:flex-end;
              "
            >

              <div
                style="
                  width:340px;
                "
              >

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    padding:9px 14px;
                    font-size:12px;
                  "
                >
                  <span
                    style="
                      font-weight:700;
                    "
                  >
                    Subtotal
                  </span>

                  <span
                    style="
                      font-family:monospace;
                      white-space:nowrap;
                    "
                  >
                    ${escapeHtml(formatMoney(subtotal))}
                  </span>
                </div>

                ${taxRow}

                ${discountRow}

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    padding:12px 14px;
                    background:#16324f;
                    color:#ffffff;
                  "
                >
                  <span
                    style="
                      font-size:13px;
                      font-weight:700;
                    "
                  >
                    Total
                  </span>

                  <span
                    style="
                      font-size:16px;
                      font-weight:800;
                      font-family:monospace;
                      white-space:nowrap;
                    "
                  >
                    ${escapeHtml(formatMoney(total))}
                  </span>
                </div>

              </div>

            </div>

          </div>

          ${paymentSection}

          ${termsSection}

        </div>
      `

      document.body.appendChild(pdfDocument)

      /*
       * --------------------------------------------------------
       * HANDLE LOGO
       * --------------------------------------------------------
       */

      const images = Array.from(
        pdfDocument.querySelectorAll('img'),
      )

      for (const image of images) {
        try {
          if (!image.complete) {
            await new Promise<void>((resolve) => {
              let finished = false

              const done = () => {
                if (finished) return

                finished = true

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
            })
          }

          if (
            typeof image.decode ===
            'function'
          ) {
            await image.decode().catch(
              () => undefined,
            )
          }
        } catch {
          /*
           * Logo failure should never prevent
           * the PDF from being created.
           */
        }
      }

      /*
       * --------------------------------------------------------
       * CAPTURE PDF DOCUMENT
       * --------------------------------------------------------
       *
       * IMPORTANT:
       *
       * We explicitly replace modern CSS color functions
       * such as OKLCH with regular RGB/HEX-compatible
       * colors inside this temporary PDF document.
       *
       * html2canvas does not reliably understand OKLCH.
       */

      const allElements =
        pdfDocument.querySelectorAll('*')

      allElements.forEach((element) => {
        const htmlElement =
          element as HTMLElement

        htmlElement.style.setProperty(
          'color',
          htmlElement.style.color ||
            '#0f172a',
        )
      })

      const canvas =
        await html2canvas(
          pdfDocument,
          {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            imageTimeout: 10000,
            removeContainer: true,

            /*
             * Ignore external images if they cause
             * cross-origin problems.
             */
            ignoreElements: (
              element,
            ) => {
              if (
                element.tagName.toLowerCase() ===
                'img'
              ) {
                const image =
                  element as HTMLImageElement

                /*
                 * Keep same-origin/data/blob images.
                 */
                if (
                  image.src.startsWith(
                    'data:',
                  ) ||
                  image.src.startsWith(
                    'blob:',
                  )
                ) {
                  return false
                }

                /*
                 * Let html2canvas try remote
                 * images using CORS.
                 */
                return false
              }

              return false
            },
          },
        )

      /*
       * Remove temporary PDF document.
       */
      pdfDocument.remove()

      /*
       * --------------------------------------------------------
       * SAFETY CHECK
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

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      })

      const pageWidth = 210
      const pageHeight = 297

      const margin = 10

      const printableWidth =
        pageWidth - margin * 2

      const printableHeight =
        pageHeight - margin * 2

      /*
       * Fit canvas to A4 width.
       */
      const pdfScale =
        printableWidth / canvas.width

      const renderedHeight =
        canvas.height * pdfScale

      /*
       * --------------------------------------------------------
       * ONE PAGE
       * --------------------------------------------------------
       */

      if (
        renderedHeight <=
        printableHeight
      ) {
        pdf.addImage(
          canvas.toDataURL(
            'image/jpeg',
            0.95,
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
       * MULTI-PAGE
       * --------------------------------------------------------
       */

      const sourcePageHeight =
        printableHeight / pdfScale

      let sourceY = 0
      let pageNumber = 0

      while (
        sourceY < canvas.height
      ) {
        if (pageNumber > 0) {
          pdf.addPage()
        }

        const remainingHeight =
          canvas.height - sourceY

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
            0.95,
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

      return null
    }
  }

  /*
   * ==========================================================
   * DOWNLOAD PDF
   * ==========================================================
   */

  async function downloadPdf() {
    if (!invoice) return

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
    if (!invoice) return

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
            type: 'application/pdf',
          },
        )

      /*
       * Native sharing.
       */

      if (
        typeof navigator.share ===
        'function'
      ) {
        let canShareFiles = false

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
            canShareFiles = false
          }
        }

        if (canShareFiles) {
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
              error instanceof DOMException &&
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
       * Desktop/browser fallback.
       */
      pdf.save(fileName)

      setShareMessage(
        'Your browser does not support direct file sharing. The PDF has been downloaded instead.',
      )
    } catch (error) {
      console.error(
        'Share PDF failed:',
        error,
      )

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
      } catch (fallbackError) {
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
            INVOICE DOCUMENT
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
                    'dd/MM/yyyy',
                  )}
                </span>

                <span className="font-bold tracking-wide text-slate-900">
                  DUE DATE
                </span>

                <span className="text-right text-slate-500">
                  {format(
                    parseISO(invoice.due_date),
                    'dd/MM/yyyy',
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

                <span className="font-mono-tab text-right text-slate-600 whitespace-nowrap">
                  {formatMoney(item.rate)}
                </span>

                <span className="font-mono-tab text-right whitespace-nowrap">
                  {formatMoney(
                    item.quantity *
                      item.rate,
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

                <span className="font-mono-tab whitespace-nowrap">
                  {formatMoney(subtotal)}
                </span>
              </div>

              {invoice.tax_rate > 0 && (
                <div className="flex justify-between px-3 py-1.5 text-xs text-slate-500">

                  <span>
                    Tax ({invoice.tax_rate}%)
                  </span>

                  <span className="font-mono-tab whitespace-nowrap">
                    {formatMoney(
                      subtotal *
                        (invoice.tax_rate / 100),
                    )}
                  </span>

                </div>
              )}

              {invoice.discount > 0 && (
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
                  {meta.business_payment_details}
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

          {/* Terms */}

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

        {/* =====================================================
            STATUS SUMMARY
            ===================================================== */}

        <div className="mb-5">

          <div className="flex items-center justify-between mb-1">

            <p className="text-sm text-slate-500">
              Due on{' '}
              {format(
                parseISO(invoice.due_date),
                'dd/MM/yyyy',
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
                      e.target.value,
                    )
                  }
                  placeholder={balance.toFixed(2)}
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

/*
 * ==========================================================
 * ESCAPE HTML
 * ==========================================================
 *
 * Prevent invoice/user-entered text from breaking the
 * temporary PDF HTML document.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value)
}