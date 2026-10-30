# Handoff: Parma Live (PWA trasporti pubblici, iPhone)

## Overview
PWA per uso personale, in italiano, per i trasporti pubblici di Parma: mappa dei bus TEP in tempo reale, tabelloni di fermata, ricerca A→B, partenze e arrivi dei treni alla Stazione FS di Parma, preferiti con countdown live. Target: iPhone, viewport 390×844 pt, safe area iOS (top 59, bottom 34). Priorità: leggibilità a colpo d'occhio, uso con una mano, target touch ≥ 44 pt.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes that show the intended look and behavior. They are not production code to copy directly. The task is to **recreate these designs in the target codebase's environment** using its established patterns. If there is no codebase yet, pick a suitable stack. Suggested: Vite + React or Preact + TypeScript, MapLibre GL for the map, a service worker for offline, and CSS variables from `tokens.css`.

To open the references, serve the folder (`npx serve .`) and open the `.dc.html` files. They need `support.js` next to them.
- `Parma Live Prototype.dc.html` is the interactive prototype. Its Tweaks are `dark`, `speed` (1/6/20× simulated time) and `scenario`, which forces each special state. The scenario list is also at Info › "Simula stato".
- `Parma Live.dc.html` and `Phone.dc.html` are the static board: the mini design system plus 8 screens, in light and dark.

## Fidelity
**High-fidelity.** Colors, type, radii, spacing, motion and copy are final, except:
- Line colors are **placeholders** and must be replaced with official TEP colors.
- Every piece of data (stops, coordinates, routes, timetables, trains) is simulated. In the prototype, routes join stops with straight segments instead of following streets.

## Component inventory
Every element of the prototype carries `data-component="…"`. Use these names in code:

| Componente | Descrizione | Props suggerite |
|---|---|---|
| `LineBadge` | Cerchio pieno, colore linea, numero bianco bold. Taglie 26/30/32/40/54 (font 12/13/13–14/16/24, 800 a 54) | `line`, `size` |
| `BusMarker` | Badge 28 (selezionato 36–40) + bordo 2 px `--pl-marker-ring` + ombra; cono triangolare dietro, ruotato verso la direzione di marcia; hit area 44×44 | `line`, `heading`, `size`, `dimmed`, `onPress` |
| `StopMarker` | Cerchio bianco 12 (bordo 3 grigio `#8E8E96`); selezionato 24 bordo 5 accent; hit area 36 | `stopId`, `variant` |
| `MapLabel` | Pill vetro 30 h, tag colorato 20 h + nome fermata 13/600 | `tag`, `tagColor`, `label` |
| `UserLocationDot` | Punto 18 accent con bordo bianco 3 + alone 48 accent-soft | – |
| `LiveMap` | Mappa a tutto schermo, pan con trascinamento | `camera`, `buses`, `stops`, `routes` |
| `MapAttribution` | Pill 10/500 in basso a sinistra, apre Info | – |
| `LineFilterChip` | 44×44 vetro con `LineBadge` 32; "Tutte" pill 44 h (attiva: fondo `--pl-text`, testo `--pl-bg`) | `line?`, `selected` |
| `LiveIndicator` | Pill vetro 32 h: pallino 8 + TAG 13/700 tracking 0.04 + testo | `state: live\|stale\|offline\|night\|loading`, `ageSeconds`, `lastSync` |
| `LocateButton` | Cerchio vetro 52, freccia accent; barrata e grigia se permesso negato | `denied` |
| `IconButton` | 44×44 vetro o superficie (Info) | – |
| `BottomSheet` | Inset 8 px, raggio 40, vetro `--pl-sheet`, 3 detent | `detent`, `onDetentChange`, `onClose` |
| `SheetHandle` | 36×5, raggio 3, `--pl-text-3` al 60% | – |
| `DepartureRow` | Griglia 40 / 1fr / auto, h 62, separatore hairline. Destinazione 17/600, sotto 13 ("via …", o "+N min" in `--pl-late`). Destra: `Countdown` + icona sorgente | `line`, `destination`, `via`, `etaSeconds`, `source: live\|scheduled\|cancelled`, `delayMin` |
| `Countdown` | Numero 24/700 tnum + "min" 14/600; < 60 s → "in arrivo" in `--pl-ok`. Animazione al cambio valore | `seconds`, `size` |
| `NextStopRow` | Linea verticale 4 px del colore linea + nodo 16 (capolinea pieno); nome 17; orario stimato 17/700 (late se in ritardo) + programmato barrato 13 | – |
| `RouteResultCard` | Card raggio 24, padding 14/16. Riga 1: passi (a piedi N › badge › …) + durata 26/700 "min". Riga 2: "tra" + `Countdown` 15 + "da Fermata". Riga 3: meta 13. Selezionata: ring 2 px accent | `legs`, `selected` |
| `WalkSuggestionCard` | Card con ring accent, icona a piedi 44, "A piedi · N min", CTA "Vai" 44 h | – |
| `SearchFieldGroup` | Card raggio 24, righe Da/A da 62 h, swap 44 a destra | – |
| `PlaceRow` / `PlaceTile` | Riga 60 h con icona 36 / tile griglia 3 colonne | – |
| `RouteSummaryBar` | Pill vetro 60 h in alto nei risultati: indietro, Da/A, swap | – |
| `SegmentedControl` | 44 h, fondo `--pl-fill`, thumb `--pl-seg-on` raggio 19 che scorre con spring | – |
| `TrainRow` | Griglia 54 / 1fr / 44, h 64. Ora 18/700; destinazione 17/600; "R 2117 · stato" 13 (stato colorato 700); box binario 44×44 raggio 12, invertito | – |
| `TrainStatusCard` | Stato 30/700 colorato, binario 30/700, riga ultimo rilevamento | – |
| `TrainTimelineRow` | Ora prog. / binario timeline 4 px / nome / ora stimata; marker treno 30 accent interpolato tra due stazioni | – |
| `FavoriteTripCard` / `FavoriteStopCard` | Card con `StarButton`, countdown 40/700 o 3 `DepartureRow` compatte (h 46) | – |
| `StarButton` | 44×44; piena `--pl-star`, vuota contorno `--pl-text`; pop scale 1.25 | `active` |
| `StatusBanner` | Inline (raggio 18–24, fondo `*-soft`) o pill flottante 36 h sopra la tab bar | `tone`, `text` |
| `EmptyState` | Icona 40–48 in cerchio fill + titolo 17/600–700 + testo 13–15 | – |
| `Skeleton` | Righe con avatar e due barre `--pl-fill`, pulsazione opacità 1↔0.45 in 1.3 s | `rows` |
| `Toast` | Card vetro raggio 26, icona, titolo/testo, chiudi 44; auto-dismiss 5 s | – |
| `TabBar` / `TabBarItem` | Capsula vetro flottante, left/right 20, bottom 26, h 64, raggio 32, padding 4, 4 colonne; item attivo fondo `--pl-accent-soft`, icona+label `--pl-accent`; label 10/600 | – |
| `StatusBar` | Solo nel mockup (in PWA la gestisce iOS: `apple-mobile-web-app-status-bar-style: black-translucent`) | – |
| `InfoScreen` / `AttributionRow` | Schermata Info con versione e fonti | – |

## Screens / Views
1. **Mappa live** (tab Mappa). Mappa a tutto schermo. In alto, sotto la safe area (y 58): una riga orizzontale scrollabile di `LineFilterChip` con gap 8 e padding 16, poi il `LiveIndicator` e un `IconButton` Info a destra. In basso a destra c'è il `LocateButton` (bottom 112), a sinistra la `MapAttribution` (bottom 98). Sotto, la `TabBar`. Le fermate sono visibili da zoom ≥ 13.6.
2. **Dettaglio bus** (`BottomSheet`, si apre a metà). `LineBadge` 54 + "Direzione" 13 + destinazione 26/700, poi `CloseButton`. Seguono i chip: stato (ritardo in `--pl-late` su `--pl-late-soft`, oppure "In orario" in ok), "Vettura N" e "da Capolinea". Sotto, la sezione "PROSSIME FERMATE" con le `NextStopRow`. Sulla mappa: la parte già percorsa è tratteggiata in `--pl-route-past` (dash 1/9, 5 px), il percorso restante è nel colore della linea, 6 px con bordo bianco di 10 px. Il bus selezionato è a 40, gli altri bus al 22% di opacità. La camera centra il bus a y=220.
3. **Tabellone fermata** (sheet). Nome 26/700, `LineBadge` 26 delle linee e "Fermata NNNN". A destra `StarButton` e chiudi. Intestazione "ARRIVI" con legenda (onde verdi = tempo reale, orologio = programmato). Le `DepartureRow` live sono ordinate per ETA. Seguono le righe programmate (ora in `--pl-text-2` con icona orologio) e la corsa soppressa (ora barrata in `--pl-cancel`, destinazione in text-2). Tocco su una riga live: apre il dettaglio di quel bus.
4. **Cerca A→B** (tab Cerca). Large title "Cerca". `SearchFieldGroup` con Da = "Posizione attuale" (in accent) e A = placeholder. Poi i chip delle opzioni, i preferiti (3 `PlaceTile`: Casa, Università, Lavoro) e i recenti (`PlaceRow`). Al focus di un campo compare un input reale con suggerimenti filtrati; quando Da e A sono entrambi impostati si passa ai risultati.
5. **Risultati A→B**. `RouteSummaryBar` in alto. La mappa mostra solo i bus delle linee coinvolte: quelli della soluzione selezionata al 100%, gli altri al 30%, e il bus da prendere più grande (36). I tratti della soluzione selezionata sono spessi 6 con bordo, quelli delle altre sottili 3 al 35%. Il tratto a piedi è a puntini (dash 0.1/7, 4 px, round). Etichette `MapLabel` "Salita · N", "Cambio · N", "Discesa". La camera fa il fit nel box x 40–350, y 150–370. Sheet: "N soluzioni", `StarButton` "Salva/Salvato", `RouteResultCard` (al massimo 3, al massimo 1 cambio). Il tocco su una card la seleziona e aggiorna l'evidenziazione sulla mappa.
6. **Treni** (tab Treni). "Parma" 34/700 + "Stazione FS · aggiornato alle HH:MM". `SegmentedControl` Partenze/Arrivi, poi una card con 8 `TrainRow`. Destinazione per le partenze, origine per gli arrivi.
7. **Dettaglio treno**. Back "Partenze"/"Arrivi", pill categoria (RV/R/IC, raggio 8) + numero 30/700, "Origine → Destinazione". Poi `TrainStatusCard` e la timeline (`TrainTimelineRow`, 52 h): stazioni passate con linea accent piena, Parma evidenziata (nodo 22, 700, nota "Parma · binario N"), marker del treno tra l'ultima stazione rilevata e la successiva.
8. **Preferiti**. Large title + Info. Sezione "TRAGITTI": `FavoriteTripCard` con countdown 40 del primo bus, "Linea N da Fermata", "arrivo HH:MM · poi tra N min". Sezione "FERMATE": `FavoriteStopCard` con i prossimi 3 arrivi. Tocco sulla card: apre risultati o tabellone; tocco sulla stella: rimuove.
9. **Info**. Back "Indietro", app card, poi "FONTI DATI" con, testo invariato: "Dati: BusOne (busone.app) e TEP", "Treni: ViaggiaTreno", "© OpenStreetMap contributors". Aggiungere l'attribuzione del provider di tile effettivamente usato. Nel prototipo c'è anche "Mappa base: Esri, HERE, Garmin", da sostituire con quella del provider scelto.

## Stati speciali
| Stato | Trigger | Resa |
|---|---|---|
| Caricamento | primo fetch, cambio fermata/ricerca | `Skeleton` in tabellone (6 righe), treni (7), preferiti (4), risultati (3); chip in mappa come pill vuote; `LiveIndicator` "CARICAMENTO · posizioni dei bus…" (pallino grigio) |
| Nessun bus (notte) | feed vuoto e fuori dall'orario di servizio | Nessun marker; `EmptyState` flottante "Nessun bus in servizio · Il servizio urbano riprende alle 5:30. Prima corsa: …"; indicatore "NOTTE"; tabellone con le sole prime corse programmate; preferiti "Nessun passaggio fino alle 5:42" |
| Offline | `navigator.onLine === false` o fetch fallito | Ultimo snapshot in cache; marker al 50% e fermi; indicatore "OFFLINE · ultimo dato alle HH:MM"; countdown convertiti in "stimato" con icona orologio; fuori dalla mappa, `StatusBanner` pill "Offline · dati delle HH:MM" |
| Dato vecchio | ultimo aggiornamento > 60 s | Indicatore giallo "DATO VECCHIO · aggiornato N s fa" (pallino e tag `--pl-late`); marker al 75%; banner pill "Dati non aggiornati · N s fa" |
| Nessun risultato A→B | nessuna soluzione entro 45 min con ≤ 1 cambio | `EmptyState` + `WalkSuggestionCard` "A piedi · N min", "X,Y km · arrivo alle HH:MM" (distanza in linea d'aria ×1,25 a 75 m/min); tratto a piedi sulla mappa |
| Treno cancellato | `cancellato` dal feed | Riga: ora barrata, stato "Cancellato" rosso, binario "–" su fill; dettaglio: `StatusBanner` rosso "Treno cancellato" + testo + alternativa toccabile (prossimo treno che serve la stessa destinazione); icona del rilevamento in rosso |
| Posizione negata | Geolocation `PERMISSION_DENIED` | Niente `UserLocationDot`; `LocateButton` barrato e grigio, al tocco un `Toast` "Posizione non disponibile…"; in Cerca il campo Da è vuoto ("Scegli partenza") con banner che spiega come riattivare; "Posizione attuale" tolto dai suggerimenti |

## Interactions & Behavior
- **BottomSheet**: tre detent misurati dal top dello schermo di 844 pt. Full y=56, half y=400, peek y=688 (mostra solo l'intestazione). Il trascinamento funziona su tutto lo sheet, con soglia di 6 px. Al rilascio lo snap va al detent più vicino alla posizione proiettata (y + velocità × 180 ms). Sopra full c'è un rubber-band al 25%. Proiettando oltre peek+70 lo sheet si chiude (dettaglio bus e fermata; i risultati no). La transizione è `transform 550ms cubic-bezier(.3,1.32,.5,1)`, con un leggero overshoot. All'apertura lo sheet parte da y=844 e sale a half. Il contenuto scrolla solo a full; a full, se la lista è già scrollata, il drag passa allo scroll. Un tocco sulla mappa con lo sheet a half/full lo porta a peek. Con uno sheet aperto la tab bar è nascosta.
- **Bus in movimento**: i marker sono posizionati in coordinate mondo e animati con `left/top 1000ms linear` a ogni aggiornamento, che deve avere lo stesso intervallo. Il cono ruota con `transform .6s ease`. Dopo un cambio di camera disattivare la transizione per circa 400 ms per evitare scie.
- **Countdown**: quando il valore cambia, il nuovo numero entra con `translateY(-55%) scale(.8) → none` e opacità 0→1 in 550 ms `cubic-bezier(.25,1.6,.45,1)`. In React basta usare `key` = valore.
- **Pallino LIVE**: pulsazione dell'alone `box-shadow 0 → 9px` in 1.6 s infinite, solo nello stato live.
- **StarButton**: pop a scale 1.25 per 250 ms con `cubic-bezier(.3,1.8,.5,1)`. I preferiti persistono in `localStorage` (`parmaLive.favs.v1` = `{stops: string[], trips: {from,to}[]}`).
- **Navigazione**: tocco su un bus → dettaglio bus; tocco su una fermata (mappa, riga di `NextStopRow`, fermata preferita) → tabellone; tocco su un arrivo live → dettaglio di quel bus; Cerca → risultati; tocco su un treno → dettaglio. La camera della Mappa e quella dei Risultati sono indipendenti: tornando alla Mappa si ripristina la vista di default (44.7975, 10.3240, z14).
- **Chip filtro**: selezione multipla; "Tutte" azzera. Le chip non selezionate hanno il badge al 45%.

## State Management
- `feed`: `{ buses: Bus[], fetchedAt, status: 'live'|'stale'|'offline'|'loading' }`, con polling a 10–15 s (in produzione) e interpolazione tra due fix. `Bus = { id, line, lat, lon, heading, delayMin, vehicle, tripId, direction }`.
- `stopBoard(stopId)`: arrivi live (ETA dal feed) uniti alle corse programmate (GTFS) e alle soppressioni.
- `planner(from, to)`: diretto + 1 cambio, raggio a piedi 850 m a 75 m/min, finestra 45 min. Ordinamento per arrivo + 5 min di penalità per cambio + 20 s per minuto a piedi.
- `trains(mode)`: partenze o arrivi di Parma. Per ogni treno: stazioni con orari programmati, ritardo, binario, cancellazione, ultimo rilevamento.
- UI: `tab`, `sheet {kind, id}`, `sheetDetent` per contesto, `camera` per contesto, `filterLines[]`, `search {from, to, focus, query, view, selected}`, `favorites`, `geoPermission`.

## Design Tokens
Tutti i token sono in **`tokens.css`** (variabili CSS `--pl-*`; il tema scuro si attiva con `[data-theme="dark"]` oppure `prefers-color-scheme`) e in **`tokens.json`** (per Style Dictionary o per l'uso in TS). Riassunto:
- Accento #1F5BE0 / #6E9BFF. In orario #12814A / #3DD68C. Ritardo #B25B00 / #FFB340. Cancellato #CF2A1C / #FF6B5E.
- Sfondo #F2F2F7 / #000. Superficie #FFF / #1C1C1F. Vetro: `rgba(255,255,255,.68)` / `rgba(40,40,44,.60)` con `backdrop-filter: blur(24px) saturate(180%)`.
- Font: SF Pro su iOS, Inter come fallback, **sempre** `font-feature-settings: "tnum"` per gli orari.
- Raggi 8/12/18/24/32/40/pill. Spaziature 4/8/12/16/20/24/32. Target minimo 44.

## Assets
- Icone: SVG inline disegnate a mano, stroke 2–2.4, viewBox 24, stile simile a SF Symbols (mappa, lente, treno, stella, freccia posizione, onde live, orologio, a piedi, swap, chevron, X, luna, info). Su iOS si possono sostituire con SF Symbols, altrimenti con Lucide.
- Mappa: il prototipo usa le tile raster Esri World Light/Dark Gray Canvas. In produzione usare un provider vettoriale (MapLibre + OpenMapTiles/Protomaps/MapTiler) con stile grigio neutro, mantenendo l'attribuzione © OpenStreetMap contributors.
- Dati: BusOne (busone.app) e TEP per i bus, ViaggiaTreno per i treni. Verificare i termini d'uso delle API prima dello sviluppo.

## Files
- `Parma Live Prototype.dc.html`: prototipo interattivo con tutti i flussi e gli stati. La logica di simulazione (movimento dei bus, ETA, planner, timeline treni) è nella classe JS in fondo al file ed è utile come riferimento per il comportamento.
- `Parma Live.dc.html` + `Phone.dc.html`: board statica con design system e 8 schermate in chiaro e scuro.
- `support.js`: runtime per aprire i `.dc.html` (solo per la visualizzazione).
- `tokens.css`, `tokens.json`: token esportabili.
