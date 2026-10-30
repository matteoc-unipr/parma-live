# Parma Live

PWA personale per i trasporti di Parma (bus TEP in tempo reale, treni alla Stazione FS). Solo uso personale, tutto nel free tier.

## Struttura
- `app/`: Vite + React + TypeScript, MapLibre GL JS con tile vettoriali OpenFreeMap (nessuna API key), Zustand per lo stato, vite-plugin-pwa. Hosting su Cloudflare Pages.
- `worker/`: Cloudflare Worker (wrangler) per proxy e cache.
- `design/`: handoff di Claude Design. È la fonte di verità per la UI.
- `fixtures/`: campioni reali delle API (`scripts/fetch-fixtures.sh`).
- `docs/data.md`: campi effettivamente presenti in ogni fonte. Leggerlo prima di toccare il parsing.

## Comandi
- `npm run check`: lint + typecheck + test (Vitest). Va eseguito prima di ogni commit.
- `npm run dev` (app), `npm run dev:worker`.

## Design
- Rispettare fedelmente `design/README.md`: token, componenti (`data-component`), layout chiaro/scuro, stati speciali, motion.
- Colori e misure vengono solo da `app/src/tokens.css` (copia di `design/tokens.css`). Niente valori hardcoded. `tokens.test.ts` verifica che i token restino allineati.
- I colori linea del design sono segnaposto: usare `route_color` del GTFS dove c'è (vedi `docs/data.md`).

## Fonti dati: regole
- **Bus**: BusOne Proxy `https://proxy.busone.app/tep` (`gtfs.zip`, `gtfs-rt/*.pb|.json`, `ws`, `status`). Gli ID di corse, linee e fermate sono coerenti tra statico e realtime.
- Ogni richiesta automatica a BusOne invia `X-BusOne-Client: parma-live (uso personale); <email>` e `X-BusOne-Use: personal`.
- Il realtime e il WebSocket passano **sempre dal Worker** (`/busone/*`), che aggiunge gli header e mette in cache il realtime per 5 s. L'email vive solo nel secret `BUSONE_CONTACT`: mai nel codice dell'app né nel repo.
- Il GTFS statico non si carica a runtime: `scripts/build-gtfs.ts` lo trasforma in `app/public/data/` (formato in `docs/data.md`). I file generati non vanno in git.
- Uso **solo personale**. Attribuzione obbligatoria e visibile: "BusOne (https://busone.app) e TEP".
- **Fallback** solo se BusOne non risponde: feed ufficiale TEP `https://temporeale.cl.tep.pr.it/temporeale/{vehicle_positions,trip_updates}.pb`. Non ha `trip_id`: match su `route_id + direction_id + start_date + start_time`. Non ha CORS, quindi passa dal Worker.
- **Treni**: API non ufficiali ViaggiaTreno `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/` (`autocompletaStazione`, `partenze/{id}/{data}`, `arrivi/{id}/{data}`, `andamentoTreno/{origine}/{numero}/{mezzanotte_ms}`). Sono HTTP e senza CORS: si passa **sempre** dal Worker.
- Altre attribuzioni nella schermata Info: "Treni: ViaggiaTreno", "© OpenStreetMap contributors", OpenFreeMap.
- Non aggirare i blocchi anti-bot (User-Agent finti e simili).
