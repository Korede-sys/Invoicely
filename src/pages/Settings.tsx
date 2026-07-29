import { useRef, useState } from 'react'
import { LogOut, Upload } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2MB

export function Settings() {
  const { user, signOut } = useAuth()
  const meta = (user?.user_metadata ?? {}) as Record<string, string>

  const [name, setName] = useState(meta.business_name ?? '')
  const [phone, setPhone] = useState(meta.business_phone ?? '')
  const [email, setEmail] = useState(meta.business_email ?? '')
  const [address, setAddress] = useState(meta.business_address ?? '')
  const [logoUrl, setLogoUrl] = useState(meta.business_logo_url ?? '')
  const [logoError, setLogoError] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setLogoError(null)

    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file (PNG, JPG, SVG).')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo must be under 2MB.')
      return
    }

    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/logo.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('business-assets')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('business-assets').getPublicUrl(path)
      // Bust cache so a re-uploaded logo shows immediately
      const bustedUrl = `${data.publicUrl}?v=${Date.now()}`

      await supabase.auth.updateUser({ data: { business_logo_url: bustedUrl } })
      setLogoUrl(bustedUrl)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
          <label className="text-xs font-medium text-slate-600 mb-1 block">Logo</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg border border-[#E7E2D6] bg-white flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Business logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-slate-400 text-center px-1">No logo</span>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="rounded-lg border border-[#E7E2D6] bg-white px-3 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                <Upload size={14} />
                {uploadingLogo ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
              </button>
              <p className="text-[11px] text-slate-400 mt-1">PNG or JPG, up to 2MB</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
          </div>
          {logoError && <p className="text-xs text-[color:var(--color-bad)] mt-1.5">{logoError}</p>}
        </div>

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
