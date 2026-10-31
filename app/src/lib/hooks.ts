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

/** Tema scuro effettivo: scelto nelle impostazioni (data-theme, vedi store), altrimenti quello del sistema. */
export const isDark = () => {
  const theme = document.documentElement.dataset.theme
  return theme ? theme === 'dark' : darkQuery.matches
}

export function useDarkMode() {
  const theme = useUi((s) => s.theme)
  const [systemDark, setSystemDark] = useState(darkQuery.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    darkQuery.addEventListener('change', on)
    return () => darkQuery.removeEventListener('change', on)
  }, [])
  return theme === 'auto' ? systemDark : theme === 'dark'
}
