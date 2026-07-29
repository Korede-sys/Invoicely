import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-[color:var(--color-paper-dim)] flex items-center justify-center mb-3">
        <Icon size={22} className="text-slate-400" strokeWidth={1.8} />
      </div>
      <p className="font-medium text-sm mb-1">{title}</p>
      <p className="text-sm text-slate-500">{body}</p>
    </div>
  )
}
