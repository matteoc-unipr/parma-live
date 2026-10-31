// Indirizzi via Photon (photon.komoot.io), solo provincia di Parma. CORS aperto: chiamata diretta dal browser.
import type { Place } from '../store'

// Rettangolo della provincia: include pezzi delle province vicine, che si scartano con `county`.
const BBOX = '9.45,44.37,10.50,45.10'

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: { name?: string; street?: string; housenumber?: string; city?: string; county?: string; district?: string }
}

export async function searchAddresses(q: string, signal: AbortSignal): Promise<Place[]> {
  // lang=it non è supportato da Photon: il default restituisce i nomi locali (in italiano).
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=${BBOX}&lat=44.80&lon=10.33&limit=10`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Photon: HTTP ${res.status}`)
  const { features } = (await res.json()) as { features: PhotonFeature[] }
  const seen = new Set<string>()
  const out: Place[] = []
  for (const f of features) {
    const p = f.properties
    if (p.county !== 'Parma') continue
    const street = [p.street, p.housenumber].filter(Boolean).join(' ')
    const name = p.name ?? street
    if (!name) continue
    const detail = [p.name && street ? street : null, p.city].filter(Boolean).join(', ')
    const key = `${name}|${detail}`
    if (seen.has(key)) continue
    seen.add(key)
    const [lon, lat] = f.geometry.coordinates
    out.push({ kind: 'address', name, detail, lat, lon })
  }
  return out.slice(0, 5)
}
