import { useSyncExternalStore } from "react"

// Subscribe a component to a CSS media query, re-rendering when it flips. SSR-safe: the server
// snapshot assumes desktop (`true`) — the only consumers gate closed/overlay UI, so the value is
// never painted before hydration resolves the real one.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}
