// Monitor arrivi/partenze RFI (iechub.rfi.it): HTML della tabella → JSON.
export type RfiTrain = {
  number: string
  operator: string // TRENITALIA TPER, TRENORD, FRECCIAROSSA, INTERCITY…
  category: string // REG, RV, INTERCITY, ALTA VELOCITA'…
  station: string // destinazione (partenze) o provenienza (arrivi)
  time: string // HH:MM programmato
  delayMin: number | null
  note: string | null // testo non numerico nella colonna ritardo (es. soppresso)
  platform: string | null
  atPlatform: boolean // "lampeggio": treno in arrivo/in stazione
  stops: { name: string; time: string }[] // solo nelle partenze
  info: string | null
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/'{2,}/g, "'") // RFI raddoppia gli apostrofi: "S.ILARIO D''''E"
    .replace(/\s+/g, ' ')
    .trim()

const cell = (row: string, id: string) => row.match(new RegExp(`<td id="${id}"[^>]*>([\\s\\S]*?)</td>`))?.[1] ?? ''
const alt = (html: string) => decode(html.match(/alt="([^"]*)"/)?.[1] ?? '')
const section = (html: string, title: string) =>
  html.match(new RegExp(`${title}</div>\\s*<div class="testoinfoaggiuntive">([\\s\\S]*?)</div>`))?.[1]

export function parseMonitor(html: string): RfiTrain[] {
  return [...html.matchAll(/<tr id="[^"]*" name="treno"[\s\S]*?<\/tr>/g)].map(([row]) => {
    const delay = decode(cell(row, 'RRitardo'))
    const details = cell(row, 'RDettagli')
    const stops = decode(section(details, 'Fermate successive') ?? '').replace(/^FERMA A:\s*/, '')
    const info = section(details, 'Informazioni')
    return {
      number: decode(cell(row, 'RTreno')),
      operator: alt(cell(row, 'RVettore')),
      category: alt(cell(row, 'RCategoria')).replace(/^Categoria\s+/, ''),
      station: decode(cell(row, 'RStazione')),
      time: decode(cell(row, 'ROrario')),
      delayMin: /^\d+$/.test(delay) ? Number(delay) : null,
      note: delay && !/^\d+$/.test(delay) ? delay : null,
      platform: decode(cell(row, 'RBinario')) || null,
      atPlatform: alt(cell(row, 'RExLampeggio')) === 'Si',
      stops: [...stops.matchAll(/(.+?) \((\d\d:\d\d)\)(?: - |$)/g)].map((m) => ({ name: m[1]!, time: m[2]! })),
      info: info ? decode(info) : null,
    }
  })
}
