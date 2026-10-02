import type { ReactNode } from 'react'

const styles = { info: 'alert-info', success: 'alert-success', error: 'alert-error' }
const symbols = { info: 'i', success: '✓', error: '!' }

export function Feedback({ children, tone = 'info' }: { children: ReactNode; tone?: keyof typeof styles }) {
  return <div className={`alert alert-soft ${styles[tone]} text-sm`} role={tone === 'error' ? 'alert' : 'status'}>
    <span className="grid size-5 shrink-0 place-items-center rounded-full border font-bold" aria-hidden="true">{symbols[tone]}</span>
    <div className="min-w-0 break-words">{children}</div>
  </div>
}
