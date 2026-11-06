import { createContext, useCallback, useContext, useState } from 'react'

type ToastKind = 'success' | 'error'
interface Toast {
  id: number
  text: string
  kind: ToastKind
}

const SHOWN_MS = 4000
const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {})

/** A short message in a corner, gone after a few seconds: what an action did, instead of a line that stays on its page. */
export function useToast(): (text: string, kind?: ToastKind) => void {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = nextId++
    // the same message again replaces the one shown, so repeated saves do not pile up
    setToasts((current) => [...current.filter((toast) => toast.text !== text).slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), SHOWN_MS)
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} data-testid="toast" data-toast-id={toast.id}>
            <span aria-hidden="true">{toast.kind === 'success' ? '✓' : '!'}</span>
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
