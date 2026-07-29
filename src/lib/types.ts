export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue'
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

export interface Client {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

export interface RecurringRule {
  id: string
  user_id: string
  frequency: RecurringFrequency
  next_run_date: string
  active: boolean
  created_at: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  rate: number
  sort_order: number
}

export interface Payment {
  id: string
  invoice_id: string
  user_id: string
  amount: number
  paid_date: string
  method: string | null
  created_at: string
}

export interface Invoice {
  id: string
  user_id: string
  client_id: string
  invoice_number: string
  status: InvoiceStatus
  issue_date: string
  due_date: string
  tax_rate: number
  discount: number
  notes: string | null
  recurring_rule_id: string | null
  created_at: string
  // joined
  client?: Client
  items?: InvoiceItem[]
  payments?: Payment[]
}

export interface BusinessProfile {
  name: string
  email: string
  phone: string
  address: string
}

export function invoiceSubtotal(items: Pick<InvoiceItem, 'quantity' | 'rate'>[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.rate, 0)
}

export function invoiceTotal(items: Pick<InvoiceItem, 'quantity' | 'rate'>[], taxRate: number, discount: number): number {
  const subtotal = invoiceSubtotal(items)
  const tax = subtotal * (taxRate / 100)
  return Math.max(0, subtotal + tax - discount)
}

export function amountPaid(payments: Pick<Payment, 'amount'>[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

export function formatMoney(amount: number, currency = '₦'): string {
  return `${currency}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function deriveStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === 'draft') return 'draft'
  const total = invoiceTotal(invoice.items ?? [], invoice.tax_rate, invoice.discount)
  const paid = amountPaid(invoice.payments ?? [])
  const isOverdue = new Date(invoice.due_date) < new Date(new Date().toDateString())

  if (paid >= total && total > 0) return 'paid'
  if (paid > 0 && paid < total) return 'partially_paid'
  if (isOverdue) return 'overdue'
  return 'sent'
}
