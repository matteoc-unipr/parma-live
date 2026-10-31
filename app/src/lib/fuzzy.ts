// Ricerca fuzzy delle fermate: senza accenti, senza punteggiatura, per parole, con un errore di battitura ammesso.

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Distanza di edit ≤ 1 (sostituzione, inserimento o cancellazione), senza calcolare la matrice intera. */
function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] !== b[j]) {
      if (++edits > 1) return false
      // Lunghezze diverse: si salta un carattere della più lunga (inserimento/cancellazione).
      if (a.length > b.length) {
        i++
        continue
      }
      if (b.length > a.length) {
        j++
        continue
      }
    }
    i++
    j++
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** Punteggio di una parola cercata contro le parole del nome: 0 = nessuna corrispondenza. */
function wordScore(q: string, words: string[]) {
  let best = 0
  for (const w of words) {
    if (w === q) return 4
    if (w.startsWith(q)) best = Math.max(best, 3)
    else if (w.includes(q)) best = Math.max(best, 2)
    // Un errore di battitura, solo su parole abbastanza lunghe da non generare rumore (o su un prefisso).
    else if (q.length >= 4 && (withinOneEdit(q, w) || withinOneEdit(q, w.slice(0, q.length)))) best = Math.max(best, 1)
  }
  return best
}

/** Tutte le parole cercate devono corrispondere; ordina per punteggio, poi nomi più corti. */
export function fuzzySearch<T>(items: T[], name: (t: T) => string, query: string, limit = 8) {
  const q = normalize(query).split(' ').filter(Boolean)
  if (!q.length) return []
  const scored: { item: T; score: number; len: number }[] = []
  for (const item of items) {
    const n = normalize(name(item))
    const words = n.split(' ')
    let score = 0
    for (const part of q) {
      const s = wordScore(part, words)
      if (!s) {
        score = 0
        break
      }
      score += s
    }
    if (score) scored.push({ item, score, len: n.length })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.len - b.len)
    .slice(0, limit)
    .map((s) => s.item)
}
