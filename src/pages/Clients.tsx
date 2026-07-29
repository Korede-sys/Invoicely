import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { Layout } from '../components/Layout'
import { EmptyState } from '../components/EmptyState'
import { fetchClients } from '../lib/data'
import type { Client } from '../lib/types'

export function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClients().then((data) => {
      setClients(data)
      setLoading(false)
    })
  }, [])

  return (
    <Layout
      title="Clients"
      action={
        <Link to="/clients/new" className="w-9 h-9 rounded-full bg-[color:var(--color-ledger)] flex items-center justify-center">
          <Plus size={18} color="white" strokeWidth={2.5} />
        </Link>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading clients…</p>
      ) : clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" body="Add a client so you can start invoicing them." />
      ) : (
        <div className="space-y-2.5">
          {clients.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}/edit`} className="ledger-card flex items-center justify-between px-4 py-3.5 block">
              <div>
                <p className="font-medium text-sm">{c.name}</p>
                {c.phone && <p className="text-xs text-slate-500 mt-0.5">{c.phone}</p>}
              </div>
              {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
