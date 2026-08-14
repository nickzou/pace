import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

// A single-slot toast with an optional action button (used for Undo). Lives at
// the root so a toast survives navigation — e.g. deleting on /tasks/$taskId and
// landing back on the list still shows the Undo. SSR-safe: renders nothing until
// something calls show().
type ToastAction = { label: string; onClick: () => void }
type Toast = { message: string; action?: ToastAction }
type ToastContextValue = { show: (message: string, action?: ToastAction) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = useCallback((message: string, action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ message, action })
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200 shadow-lg">
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss()
                }}
                className="font-medium text-sky-400 transition hover:text-sky-300"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
}
