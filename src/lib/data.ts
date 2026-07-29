import { supabase } from './supabase'
import type { Client, Invoice, InvoiceItem, Payment, RecurringRule } from './types'

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, client:clients(*), items:invoice_items(*), payments:payments(*)')
    .order('issue_date', { ascending: false })
  if (error) throw error
  return data as unknown as Invoice[]
}

export async function fetchInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, client:clients(*), items:invoice_items(*), payments:payments(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as Invoice
}

export async function nextInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const last = data?.[0]?.invoice_number
  const lastNum = last ? parseInt(last.replace(/\D/g, ''), 10) || 0 : 0
  return `INV-${String(lastNum + 1).padStart(4, '0')}`
}

interface SaveInvoiceInput {
  id?: string
  client_id: string
  invoice_number: string
  status: Invoice['status']
  issue_date: string
  due_date: string
  tax_rate: number
  discount: number
  notes: string | null
  recurring_rule_id: string | null
  items: Pick<InvoiceItem, 'description' | 'quantity' | 'rate'>[]
}

export async function saveInvoice(input: SaveInvoiceInput, userId: string): Promise<string> {
  const payload = {
    user_id: userId,
    client_id: input.client_id,
    invoice_number: input.invoice_number,
    status: input.status,
    issue_date: input.issue_date,
    due_date: input.due_date,
    tax_rate: input.tax_rate,
    discount: input.discount,
    notes: input.notes,
    recurring_rule_id: input.recurring_rule_id,
  }

  let invoiceId = input.id
  if (invoiceId) {
    const { error } = await supabase.from('invoices').update(payload).eq('id', invoiceId)
    if (error) throw error
    const { error: delError } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    if (delError) throw delError
  } else {
    const { data, error } = await supabase.from('invoices').insert(payload).select('id').single()
    if (error) throw error
    invoiceId = data.id as string
  }

  if (input.items.length > 0) {
    const rows = input.items.map((item, i) => ({
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      sort_order: i,
    }))
    const { error: itemsError } = await supabase.from('invoice_items').insert(rows)
    if (itemsError) throw itemsError
  }

  return invoiceId!
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw error
}

export async function recordPayment(invoiceId: string, userId: string, amount: number, paidDate: string, method: string) {
  const { error } = await supabase.from('payments').insert({
    invoice_id: invoiceId,
    user_id: userId,
    amount,
    paid_date: paidDate,
    method,
  })
  if (error) throw error
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return data as Client[]
}

export async function saveClient(input: Partial<Client> & { name: string }, userId: string): Promise<Client> {
  const payload = {
    user_id: userId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
  }
  if (input.id) {
    const { data, error } = await supabase.from('clients').update(payload).eq('id', input.id).select().single()
    if (error) throw error
    return data as Client
  }
  const { data, error } = await supabase.from('clients').insert(payload).select().single()
  if (error) throw error
  return data as Client
}

export async function deleteClient(id: string) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

export async function fetchRecurringRules(): Promise<RecurringRule[]> {
  const { data, error } = await supabase.from('recurring_rules').select('*').order('next_run_date')
  if (error) throw error
  return data as RecurringRule[]
}

export async function createRecurringRule(userId: string, frequency: RecurringRule['frequency'], nextRunDate: string): Promise<RecurringRule> {
  const { data, error } = await supabase
    .from('recurring_rules')
    .insert({ user_id: userId, frequency, next_run_date: nextRunDate, active: true })
    .select()
    .single()
  if (error) throw error
  return data as RecurringRule
}

export async function toggleRecurringRule(id: string, active: boolean) {
  const { error } = await supabase.from('recurring_rules').update({ active }).eq('id', id)
  if (error) throw error
}

export type { Payment }
