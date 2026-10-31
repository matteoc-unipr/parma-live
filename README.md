# Parma Live

PWA personale per i trasporti pubblici di Parma: bus TEP in tempo reale, tabelloni di fermata, ricerca A→B, treni alla Stazione FS.

Dati: BusOne (https://busone.app) e TEP · Treni: ViaggiaTreno e RFI · Mappa © OpenStreetMap contributors, OpenFreeMap.

## Requisiti
Node 22+.

## Avvio
```sh
npm install
echo "BUSONE_CONTACT=tua@email" > worker/.dev.vars
BUSONE_CONTACT=tua@email node scripts/build-gtfs.ts   # dati statici in app/public/data/
npm run dev          # app su http://localhost:5173 (usa il Worker in app/.env)
VITE_WORKER_URL=http://localhost:8787 npm run dev   # app contro il Worker locale
npm run dev:worker   # worker su http://localhost:8787
npm run check        # lint + typecheck + test
```

## Struttura
| Cartella | Contenuto |
|---|---|
| `app/` | PWA (Vite, React, TypeScript, MapLibre, Zustand) |
| `worker/` | Cloudflare Worker: proxy e cache |
| `design/` | handoff di Claude Design (apri i `.dc.html` con `npx serve design`) |
| `fixtures/` | campioni reali delle API |
| `docs/data.md` | campi effettivamente presenti nelle fonti |

## Fixture
```sh
BUSONE_CONTACT=tua@email ./scripts/fetch-fixtures.sh
```

## Deploy
- **App**: la GitHub Action [deploy.yml](.github/workflows/deploy.yml) rigenera i dati e pubblica ogni notte, a ogni push su `main` e a mano, con `wrangler deploy -c app/wrangler.toml`. Su Cloudflare l'app è un Worker con soli asset statici, il "Pages" attuale. Secrets del repo: `BUSONE_CONTACT`, `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers"), `CLOUDFLARE_ACCOUNT_ID`.
- **Worker**: `npx wrangler login`, poi `cd worker && npx wrangler secret put BUSONE_CONTACT && npm run deploy`.
- **Verifica treni dal Worker**: `curl https://<worker>.workers.dev/api/trains/departures`. Il campo `source` dice se risponde ViaggiaTreno o se è attivo il ripiego RFI.

## Installare sull'iPhone
1. Apri **Safari** su https://parma-live.pippograndepippo99.workers.dev (non Chrome: su iPhone l'installazione affidabile passa da Safari).
2. Tocca **Condividi** (quadrato con la freccia in su), nella barra in basso.
3. Scorri e tocca **Aggiungi alla schermata Home**.
4. Lascia il nome "Parma Live" e tocca **Aggiungi**.
5. Apri l'app dall'icona sulla Home. Alla prima apertura consenti la **posizione** e aspetta qualche secondo: l'app si salva per funzionare anche offline.

Aggiornamenti: l'app si aggiorna da sola (service worker). Se dopo un deploy vedi ancora la versione vecchia, chiudila dal multitasking e riaprila.
