import { useEffect, useState } from 'react'

/** Ora corrente, aggiornata ogni `ms` (countdown e "N s fa"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(iv)
  }, [ms])
  return now
}

export function useDarkMode() {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(query.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  return dark
}
