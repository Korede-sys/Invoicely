import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Receipt } from 'lucide-react'

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fn = mode === 'signin' ? signIn : signUp
    const { error } = await fn(email, password)
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[color:var(--color-paper)]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--color-ledger)] flex items-center justify-center">
            <Receipt size={20} color="white" strokeWidth={2.2} />
          </div>
          <span className="font-display text-xl font-semibold">Ledger</span>
        </div>

        <div className="ledger-card p-6">
          <h1 className="font-display text-lg font-semibold mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-slate-500 mb-5">
            {mode === 'signin' ? 'Sign in to manage your invoices.' : 'Start invoicing clients in minutes.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--color-ledger)]"
                placeholder="you@business.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#E7E2D6] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--color-ledger)]"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-[color:var(--color-bad)]">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[color:var(--color-ledger)] text-white font-semibold py-2.5 text-sm mt-2 disabled:opacity-60"
            >
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-center text-sm text-slate-500 mt-4"
        >
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span className="text-[color:var(--color-ledger)] font-semibold">
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </span>
        </button>
      </div>
    </div>
  )
}
