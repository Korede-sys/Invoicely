import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'

export function Layout({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen pb-24 bg-[color:var(--color-paper)]">
      <header className="sticky top-0 z-20 bg-[color:var(--color-paper)]/95 backdrop-blur border-b border-[#E7E2D6]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          {action}
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-4">{children}</main>
      <BottomNav />
    </div>
  )
}
