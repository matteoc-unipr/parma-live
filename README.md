# Parma Live

PWA personale per i trasporti pubblici di Parma: bus TEP in tempo reale, tabelloni di fermata, ricerca A→B, treni alla Stazione FS.

Dati: BusOne (https://busone.app) e TEP · Treni: ViaggiaTreno · Mappa © OpenStreetMap contributors, OpenFreeMap.

## Requisiti
Node 22+.

## Avvio
```sh
npm install
echo "BUSONE_CONTACT=tua@email" > worker/.dev.vars
BUSONE_CONTACT=tua@email node scripts/build-gtfs.ts   # dati statici in app/public/data/
npm run dev          # app su http://localhost:5173
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
- **Verifica ViaggiaTreno dal Worker**: `curl https://<worker>.workers.dev/vt/autocompletaStazione/PARMA`.
