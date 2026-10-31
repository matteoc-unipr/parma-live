# Fonti dati: cosa c'è davvero

Spike del 30/10/2026, ~18:55 (venerdì, servizio serale). Campioni in `fixtures/`, rigenerabili con `BUSONE_CONTACT=… ./scripts/fetch-fixtures.sh`.

## BusOne Proxy (`https://proxy.busone.app/tep`)

### CORS e header di identificazione
- Il preflight `OPTIONS` con `Access-Control-Request-Headers: x-busone-client,x-busone-use` risponde **204** con `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *` e `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`.
- **Il browser può quindi chiamare BusOne direttamente con gli header `X-BusOne-*`.** Il Worker non serve per il CORS.
- Manca `Access-Control-Max-Age`, quindi i browser tengono il preflight in cache solo per pochi secondi. Risultato: ogni poll costa due richieste (OPTIONS + GET).
- Senza header la risposta è comunque 200, con `Warning: 299 … will not be supported in the future` e `X-BusOne-Warning`.
- **Il WebSocket dal browser non può inviare header custom**: l'API `WebSocket` non lo permette. Oggi il server accetta lo stesso la connessione (101 anche senza header).
- Rate limit anonimo: 120 richieste a raffica, poi 5/s per IP (dalla pagina dei termini).
- Termini (`X-BusOne-Terms`): `noncommercial-free; permitted-users=individuals-nonprofits; attribution-required; derivatives=yes; redistribution=yes`.

### `/status`
```json
{ "feeds": { "trip_updates": {"count", "timestamp"}, "vehicle_positions": {"count", "timestamp"} },
  "gtfs": { "built_at", "size_bytes" }, "namespace": "tep",
  "realtime_provenance": {
    "vehicle_positions": { "published": "measured-gps" },
    "trip_updates": { "published": "oracle-predicted", "archive_source": "synthesized-from-real-gps" } },
  "ws_clients": 2 }
```
Le posizioni sono GPS misurato. Le **trip updates sono previsioni calcolate da BusOne** a partire dal GPS, non dati TEP.

### WebSocket `wss://proxy.busone.app/tep/ws`
Messaggi JSON, uno per emissione (`fixtures/busone/ws-messages.jsonl`):
```json
{"type":"vehicle_positions","timestamp":1793382914,"count":58,"url":"/tep/gtfs-rt/vehicle-positions.pb"}
```
- `vehicle_positions`: **ogni 30 s** esatti (6 minuti osservati).
- `trip_updates`: **ogni ~1 s** (previsione ricalcolata).
- Il messaggio contiene solo `url`, non i dati: a ogni tick si fa un GET.

### `gtfs-rt/vehicle-positions.{json,pb}`
Cache `no-cache` + `Last-Modified`. Header `incrementality: FULL_DATASET`. 61 veicoli (JSON ≈ 20 KB, pb ≈ 6 KB).

| Campo | Presente | Note |
|---|---|---|
| `trip.trip_id` | 61/61 | 61/61 presenti in `trips.txt` |
| `trip.route_id`, `direction_id`, `start_time`, `start_date` | 61/61 | |
| `trip.schedule_relationship` | 61/61 | sempre `SCHEDULED` |
| `position.latitude/longitude` | 61/61 | |
| `position.bearing` | **61/61** | gradi, float |
| `position.speed` | 60/61 | m/s |
| `stop_id` | 61/61 | presenti in `stops.txt` |
| `timestamp` | 61/61 | età del fix da 1 a 98 s rispetto all'header |
| `vehicle.label` | 61/61 | numero vettura, unico. **Nessun `vehicle.id`** |
| `occupancy_status`, `current_status`, `congestion_level` | **assenti** | |

### `gtfs-rt/trip-updates.{json,pb}`
89 corse (JSON ≈ 600 KB, pb ≈ 125 KB, da preferire). Tutti i `trip_id` sono presenti nello statico.

| Campo | Presente | Note |
|---|---|---|
| `trip.*` | 89/89 | come sopra; `schedule_relationship` sempre `SCHEDULED` |
| `vehicle.label` | 89/89 | |
| `trip_update.delay` | 2/89 | quasi mai: usare quello per fermata |
| `stop_time_update[].stop_sequence`, `stop_id` | tutti | |
| `stop_time_update[].schedule_relationship` | tutti | `SCHEDULED` (3067) o `NO_DATA` (390, fermate già passate senza tempi) |
| `arrival.{time,delay,uncertainty}` | 3067 | **`delay` c'è** (secondi). `uncertainty` da 15 a ~3000 s e cresce con la distanza |
| `departure.{time,delay,uncertainty}` | 2285 | |
| `CANCELED` / `SKIPPED` | **mai visti** | le soppressioni del design non si possono verificare su questo campione |

### `gtfs.zip`
5,3 MB zip, 24 MB estratti. `Cache-Control: public, max-age=14400`, `ETag` e `Last-Modified` stabili. Build del 20/10/2026.

| File | Righe | Note |
|---|---|---|
| `agency.txt` | 1 | GT TEPP, Europe/Rome |
| `routes.txt` | 157 | **tutta la provincia**: urbane, 8 notturne (102…121), 8 "rinforzi" (2000, 12000…), extraurbane (2083…2815), Campus Express (`1421`) |
| `stops.txt` | 4592 | provincia intera, solo `location_type=0`, nessuna `parent_station` |
| `trips.txt` | 5400 | ha `trip_headsign`, `shape_id` |
| `stop_times.txt` | 168k (10 MB) | |
| `shapes.txt` | 381k (13 MB) | |
| `calendar_dates.txt` | 5714 | **niente `calendar.txt`**: solo date esplicite, dal 20/10/2026 al 05/06/2027, solo `exception_type=1` |
| `transfers.txt` | 4592 | solo self-transfer (stessa fermata) |

`route_color` c'è solo per alcune urbane: 6 `38B4E6`, 7 `009444`, 11 `C2007E`, 12 `5EB19E`, 13 `E3001B`, 21 `A4B425`, 23 `E6B012`. Mancano 1, 2, 3, 4, 5, 8, 9, 15, 20.

## Feed ufficiale TEP (fallback)
`https://temporeale.cl.tep.pr.it/temporeale/{vehicle_positions,trip_updates}.pb`
- **Nessun header CORS**: dal browser non si legge, si passa dal Worker.
- Solo protobuf. Stesso timestamp di BusOne: BusOne lo rilegge, quindi se cade TEP probabilmente cade anche BusOne.
- `vehicle_positions`: stessi campi di BusOne, **senza `trip_id`** e senza `schedule_relationship`.
- `trip_updates`: 70 corse (BusOne 89). Per fermata **solo `stop_id` + `arrival.time`**: niente `delay`, `departure`, `stop_sequence` o `uncertainty`. Il ritardo si ricava confrontando con `stop_times`.
- Match `route_id + direction_id + start_date + start_time` su `trips` + primo `stop_times`, servizio del giorno: 60/61 veicoli e 69/70 corse sono univoci, 1 è ambiguo. Su 3095 chiavi del giorno, 97 sono ambigue (stessa linea, direzione e partenza). In quei casi va scelto il candidato più vicino alla posizione o alla fermata corrente.

## ViaggiaTreno (fonte treni primaria)
`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/…`
- **31/10/2026**: risponde 200 a un `fetch` normale da `wrangler dev` e da Node in locale; dà 403 (Akamai) a curl e **al Worker deployato su Cloudflare** (verificato dopo il deploy: `source: "rfi"`). In produzione oggi i treni arrivano quindi dal ripiego RFI: binario attuale, ritardo e fermate successive, ma niente ultima rilevazione né fermate passate.
- Non si cambia User-Agent per aggirare il blocco. Se ViaggiaTreno è lento (oltre 6 s) o rifiuta, il Worker usa il monitor RFI (sotto).
- Parma = `S05014`. Data per `partenze`/`arrivi` = `Date.toString()` a Roma, URL-encoded: `Sat Oct 31 2026 10:39:22 GMT+0100`.
- Campioni reali: `fixtures/viaggiatreno/` (partenze, arrivi, `cercaNumeroTrenoTrenoAutocomplete`, `andamentoTreno`).
- Tabellone: `compNumeroTreno` ("REG 3915"), `compOrarioPartenza`/`compOrarioArrivo`, `destinazione`/`origine`, `binarioProgrammato*`/`binarioEffettivo*`, `ritardo` (min), `inStazione`, `provvedimento` (0 = regolare). **Niente ultima rilevazione** nelle righe del tabellone.
- `cercaNumeroTrenoTrenoAutocomplete/{n}` → `"3915 - PIACENZA - 31/10/26|3915-S05000-1793401200000"` (origine e mezzanotte per `andamentoTreno`).
- `andamentoTreno/{origine}/{n}/{mezzanotte}`: `stazioneUltimoRilevamento`, `oraUltimoRilevamento`, `tipoTreno` (`PG` regolare, `ST` soppresso), `fermate[]` con `partenza_teorica`/`arrivo_teorico`, `partenzaReale`/`arrivoReale`, binari, `actualFermataType` (0 = futura, 1 = regolare, 3 = soppressa). Nelle fermate future `ritardo` vale 0: la stima usa il ritardo del treno.
- **Soppressioni non osservate dal vivo**: `provvedimento: 1` e `tipoTreno: "ST"` sono interpretati come cancellato, da verificare.

## BusOne `/trenitalia/` (alternativa valutata)
Stessi header e stessi termini di `/tep/`. Statico da 24,5 MB zip (shapes 81 MB estratti). Realtime: posizioni `synthesized` (stimate lungo la shape, non GPS), trip updates `operator-reported`.
- Parma è `05014` (fermata), `05014:station` (padre) e `05014:platform:3x` (binari 1–8, con `platform_code`). Nei TripUpdates però lo `stopId` è sempre `05014`: **il binario in tempo reale non c'è**.
- **Copertura parziale**: venerdì 30/10 risultano **57 corse** a Parma (IC 16, FR 12, REG 11, ICN 8, RV 8, EC 2), soprattutto lunga percorrenza e regionali verso La Spezia. **Mancano i regionali Trenitalia Tper** (Milano–Bologna, Brescia, Suzzara, Fidenza…), che sono la maggior parte del traffico. Il feed ha una sola agency, `TRENITALIA`.
- TripUpdates: 823 corse in tutta Italia, 12 delle quali passano da Parma. `arrival/departure.delay` presenti. `CANCELED` mai visto. Il JSON usa camelCase (`tripUpdate`, `stopTimeUpdate`), diverso da `/tep/`, che usa snake_case.

## Monitor RFI arrivi/partenze (ripiego treni)
`https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2035&arrivals=False|True`
- È il tabellone ufficiale delle stazioni RFI, in HTML. Risponde 200 a una richiesta normale, senza header particolari. **Nessun header CORS**: il Worker lo usa come ripiego in `/api/trains/*`, negli stessi campi di ViaggiaTreno.
- `placeId` di Parma = **2035**. La lista completa sta nella `<select>` di `/ArriviPartenze/ArrivalsDepartures/Home`.
- Copre **tutti gli operatori**: Trenitalia Tper, Trenitalia, Trenord, Frecciarossa, Intercity, Intercity Notte. Finestra di ~4 ore, circa 30 righe.
- Campi per riga: vettore, categoria (REG, RV, INTERCITY, ALTA VELOCITA'…), numero, destinazione o provenienza, orario programmato, ritardo in minuti (vuoto se in orario), **binario**, "lampeggio" (treno in arrivo o in stazione), e solo nelle partenze le fermate successive con orario e una riga "Informazioni".
- Non ci sono: posizione del treno, ultimo rilevamento, fermate già percorse. Il "dettaglio treno" del design va ridotto alle fermate successive.
- Le soppressioni non erano presenti nel campione: dovrebbero comparire come testo nella colonna ritardo (`note`), da verificare.
- Fixture: `fixtures/rfi/parma-{partenze,arrivi}.html`, con le immagini base64 tolte.

## Dati statici generati (`app/public/data/`)
Prodotti da `scripts/build-gtfs.ts` a partire dal `gtfs.zip` di BusOne. Le misure sotto sono del build del 30/10/2026.

| File | Contenuto | gzip |
|---|---|---|
| `meta.json` | `{ builtAt, days, attribution }` | — |
| `routes.json` | `[{ id, short, long, color, text }]`, con `color`/`text` `null` se il GTFS non li ha | 3 KB |
| `stops.json` | `[{ id, name, lat, lon }]`, solo le fermate servite, 5 decimali | 65 KB |
| `patterns.json` | `[{ id, route, dir, headsign, shape, stops[] }]`: sequenza ordinata di fermate per linea e direzione | 43 KB |
| `shapes.json` | `{ shape_id: [[lon, lat], …] }`, Douglas-Peucker 4 m, 5 decimali | 860 KB |
| `trips.json` | `{ YYYYMMDD: [[trip_id, pattern_id, start_sec], …] }`: per il match del fallback TEP e per corsa → pattern | 46 KB |
| **Caricamento iniziale** | | **≈ 1,0 MB** |
| `stop-times/{stop_id}.json` | on-demand: `{ YYYYMMDD: [[sec, trip_id, pattern_id, (1)], …] }` ordinato per orario; il 4° elemento `1` = si può solo scendere (capolinea d'arrivo o `pickup_type=1`, `sec` = arrivo) | ≤ 7 KB |

- **Giorni nell'indice**: `days = [ieri, oggi, domani]` (data di Roma al momento del build). Di ieri ci sono solo i passaggi con `sec ≥ 86400`: le notturne arrivano fino a 28:50.
- **`sec`** è misurato dall'inizio del giorno di servizio. Per GTFS questo inizio è "mezzogiorno − 12 h", non la mezzanotte: nei giorni del cambio d'ora la differenza è di un'ora.
- Le righe **solo arrivo** (flag `1`) non vanno nel tabellone: servono a calcolare l'arrivo dei tragitti.
- **`pattern_id`** è `route-dir-hash(fermate)`: resta stabile tra un build e l'altro, quindi i file on-demand restano coerenti con un `patterns.json` già in cache.
