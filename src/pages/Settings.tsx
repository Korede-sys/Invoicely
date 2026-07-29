import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function Settings() {
  const { user, signOut } = useAuth()
  const meta = (user?.user_metadata ?? {}) as Record<string, string>

  const [name, setName] = useState(meta.business_name ?? '')
  const [phone, setPhone] = useState(meta.business_phone ?? '')
  const [email, setEmail] = useState(meta.business_email ?? '')
  const [address, setAddress] = useState(meta.business_address ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await supabase.auth.updateUser({
      data: {
        business_name: name,
        business_phone: phone,
        business_email: email,
        business_address: address,
      },
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Layout title="Settings">
      <form onSubmit={handleSave} className="ledger-card p-4 space-y-3 mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Business info</p>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Business name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Address</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[color:var(--color-ledger)] text-white font-semibold py-2.5 text-sm disabled:opacity-60">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </form>

      <div className="ledger-card p-4">
        <p className="text-sm mb-1">Signed in as</p>
        <p className="text-sm text-slate-500 mb-3">{user?.email}</p>
        <button onClick={signOut} className="w-full rounded-lg border border-[#E7E2D6] py-2.5 text-sm font-semibold flex items-center justify-center gap-2 text-[color:var(--color-bad)]">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </Layout>
  )
}
