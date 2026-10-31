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

## App
- `app/src/data/`: dati statici (`static.ts`), realtime BusOne (`realtime.ts`), treni RFI (`trains.ts`). `lib/board.ts` unisce orari e stime (testato).
- La mappa resta montata sotto le altre schermate (`.screen` ha z-index 4). Fermate, percorso e bus sono layer GL creati su `style.load`; i dati arrivano con `setData`.
- Bus (`map/busLayer.ts`, `map/motion.ts`): sorgente GeoJSON + layer cono/badge/numero, niente DOM per bus. Le posizioni sono interpolate tra due fix lungo la shape della corsa (`BusMotion`) e ripubblicate solo quando un bus si sposta di ½ px: non aumentare la frequenza di `setData`, è il costo principale. Le immagini dei coni nascono da `setMissingStyleImageResolver` (in MapLibre 6 l'evento `styleimagemissing` arriva tardi).
- Realtime: tick del WebSocket → fetch posizioni; WebSocket giù → polling 10 s; pagina in background → tutto fermo.
- Misure: `?fps` mostra fps e costo dei bus, `?bench=100` simula 100 bus. Metodo e risultati in `docs/perf.md`.
- Il worker di MapLibre si passa con `setWorkerUrl` (import `?url`): senza, Vite non lo emette nel build.
- Lo stesso `trip_id` vale in più giorni di servizio: una trip update si applica solo al giorno del suo `start_date`.
- Stati realtime di una corsa a una fermata in `stopStatus` (`lib/board.ts`): live, programmato, soppressa (CANCELED), saltata (SKIPPED), già passata (NO_DATA prima della prima stima, o fermata assente). Testati: non duplicare questa logica nei componenti.
- Cerca (`planner/plan.ts`, nel Web Worker `planner.worker.ts`): fermate entro 600 m da A e da B (80 m/min, in linea d'aria), soluzioni dirette e con 1 cambio (stessa fermata o entro 200 m, ≥ 3 min), orari live dove ci sono, ordinate per arrivo. Un cambio resta solo se arriva prima della migliore diretta. Orari da `trips.json` + `offsets.json` (scarti per fermata, deduplicati). Testato in `plan.test.ts`; tempi in `docs/perf.md`.
- Autocompletamento: fermate locali con `fuzzySearch` (senza accenti, un errore di battitura), poi indirizzi Photon filtrati su `county === 'Parma'` (`lang=it` non esiste), debounce 250 ms.
- Preferiti in `localStorage` `parmaLive.favs.v1` = `{ stops: stopId[], trips: { from, to }[] }` (from/to = `Place`; le stringhe del formato precedente sono nomi di località, ancora letti). Countdown a passi di 15 s.

## Design
- Rispettare fedelmente `design/README.md`: token, componenti (`data-component`), layout chiaro/scuro, stati speciali, motion.
- Colori e misure vengono solo da `app/src/tokens.css` (copia di `design/tokens.css`). Niente valori hardcoded. `tokens.test.ts` verifica che i token restino allineati.
- I colori linea del design sono segnaposto: usare `route_color` del GTFS dove c'è (vedi `docs/data.md`).

## Fonti dati: regole
- **Bus**: BusOne Proxy `https://proxy.busone.app/tep` (`gtfs.zip`, `gtfs-rt/*.pb|.json`, `ws`, `status`). Gli ID di corse, linee e fermate sono coerenti tra statico e realtime.
- Ogni richiesta automatica a BusOne invia `X-BusOne-Client: parma-live (uso personale); <email>` e `X-BusOne-Use: personal`.
- Il realtime e il WebSocket passano **sempre dal Worker** (`/busone/*`), che aggiunge gli header. L'email vive solo nel secret `BUSONE_CONTACT`: mai nel codice dell'app né nel repo.
- Il Worker non fa cache: su `workers.dev` non esiste una cache condivisa gratuita. **L'app non chiede lo stesso feed realtime più di una volta ogni 5 s** e tiene al massimo una richiesta in volo. Ricarica il feed sui tick del WebSocket: posizioni ogni 30 s, trip updates ogni ~1 s, da limitare.
- Il GTFS statico non si carica a runtime: `scripts/build-gtfs.ts` lo trasforma in `app/public/data/` (formato in `docs/data.md`). I file generati non vanno in git.
- Uso **solo personale**. Attribuzione obbligatoria e visibile: "BusOne (https://busone.app) e TEP".
- **Fallback** solo se BusOne non risponde: feed ufficiale TEP `https://temporeale.cl.tep.pr.it/temporeale/{vehicle_positions,trip_updates}.pb`. Non ha `trip_id`: match su `route_id + direction_id + start_date + start_time`. Non ha CORS, quindi passa dal Worker.
- **Treni**: monitor RFI arrivi/partenze (Parma `placeId=2035`), convertito in JSON dal Worker su `/rfi/partenze` e `/rfi/arrivi`. ViaggiaTreno risponde 403 (Akamai) anche dai Worker: non usarlo.
- Altre attribuzioni nella schermata Info: "Treni: RFI", "© OpenStreetMap contributors", OpenFreeMap.
- Non aggirare i blocchi anti-bot (User-Agent finti e simili).
