import { useEffect, useState } from 'react'
import { useUi } from '../store'

/** Ora corrente, aggiornata ogni `ms` (countdown e "N s fa"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(iv)
  }, [ms])
  return now
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/** Tema scuro effettivo: sistema scuro e nessuna preferenza "sempre chiaro" (data-theme="light", vedi store). */
export const isDark = () => darkQuery.matches && document.documentElement.dataset.theme !== 'light'

export function useDarkMode() {
  const lightAlways = useUi((s) => s.lightAlways)
  const [systemDark, setSystemDark] = useState(darkQuery.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    darkQuery.addEventListener('change', on)
    return () => darkQuery.removeEventListener('change', on)
  }, [])
  return systemDark && !lightAlways
}
