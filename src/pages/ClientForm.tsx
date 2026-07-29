import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { deleteClient, fetchClients, saveClient } from '../lib/data'
import { useAuth } from '../contexts/AuthContext'

export function ClientForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (isEdit && id) {
      fetchClients().then((clients) => {
        const client = clients.find((c) => c.id === id)
        if (client) {
          setName(client.name)
          setEmail(client.email ?? '')
          setPhone(client.phone ?? '')
          setAddress(client.address ?? '')
        }
        setLoading(false)
      })
    }
  }, [id, isEdit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await saveClient({ id, name, email, phone, address }, user.id)
      navigate('/clients')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id || !confirm('Delete this client? Their invoices will remain but lose the client reference.')) return
    await deleteClient(id)
    navigate('/clients')
  }

  if (loading) return <p className="text-center text-sm text-slate-400 py-16">Loading…</p>

  return (
    <div className="min-h-screen pb-8 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-slate-500">
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-display text-lg font-semibold">{isEdit ? 'Edit client' : 'New client'}</h1>
          </div>
          {isEdit && (
            <button onClick={handleDelete} className="text-slate-400">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        <div className="ledger-card p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Address</label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
          </div>
        </div>

        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[color:var(--color-ledger)] text-white font-semibold py-3 text-sm disabled:opacity-60">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add client'}
        </button>
      </form>
    </div>
  )
}
