# Prestazioni della mappa

Obiettivo: 60 fps con 100 bus in movimento.

## Come misurare
- **Sul telefono**: apri `https://<app>/?bench=100&fps`. Il feed vero viene sostituito da 100 bus sintetici che percorrono le shape reali, con un aggiornamento ogni 5 s, quindi tutti i bus sono sempre in movimento. In alto compaiono:
  - fps, p95 e frame massimo, % di frame sotto i 50 fps (finestra di 5 s);
  - `loop`: frame al secondo del loop dei bus;
  - `GPU`: aggiornamenti al secondo della sorgente GeoJSON davvero caricati;
  - `JS`: costo del frame dei bus nel thread principale.
- **Con il feed reale**: `?fps` da solo.
- **Automatico**: con Chrome headless e Playwright, viewport 390×844 a DPR 3. Si misurano 12 s a mappa ferma e 12 s di pan continuo, con il rallentamento CPU via CDP (`Emulation.setCPUThrottlingRate`).

## Risultati (30/10/2026, MacBook con Apple M4, WebGL ANGLE Metal, build di produzione)

| Scenario | fps | p95 frame | frame lenti | aggiornamenti bus/s |
|---|---|---|---|---|
| CPU 1×, ferma / pan | 60 / 60 | 16,7 ms | 0% | 5 |
| CPU 4×, ferma / pan | 60 / 60 | 16,8 ms | 0% | 5 |
| CPU 6×, ferma / pan | 60 / 60 | 16,7 ms | 0% | 5 |
| CPU 4×, zoom 17, ferma / pan | 60 / 60 | 16,8 ms | 0% | 8–9 |
| **Prima** (setData a ogni frame), CPU 4×, ferma | 50 | 33,4 ms | 20% | 51 |

Il JS dei bus costa 0,1–0,2 ms per frame (p95 ≤ 1,1 ms a 6×). Il costo vero era MapLibre che rielaborava la sorgente a ogni `setData`. Ora si pubblica solo quando un bus si sposta di almeno ½ pixel: a zoom 14 un bus a 6 m/s fa circa 1 px/s.

## Limiti
- **Non è un iPhone.** Il rallentamento CPU 4–6× riguarda solo la CPU, non la GPU né la memoria. Va confermato sul dispositivo con `?bench=100&fps`.
- **Il fix iniziale non si anima**: serve un secondo aggiornamento (circa 30 s) prima che il movimento parta.

# Prestazioni della ricerca A→B

Obiettivo: risposta in meno di 300 ms.

## Come misurare
- **Planner (Web Worker)**: apri `?fps` e lancia `await __planBench(200)` in console. Esegue 200 ricerche tra punti casuali in città (fermate del comune spostate fino a circa 300 m), attraverso il worker vero. Restituisce:
  - il tempo di calcolo nel worker;
  - l'andata/ritorno dal thread della UI;
  - l'avvio a freddo, cioè il caricamento di orari e indice.
- **End-to-end**: con Playwright sul build di produzione, si misura dal tocco sul suggerimento alla comparsa della prima card risultato (rendering React e mappa compresi).

## Risultati (31/10/2026, mattina, MacBook M4, build di produzione)

| Misura | p50 | p95 | max |
|---|---|---|---|
| Calcolo nel worker (200 ricerche, tutte con risultati) | 0,8 ms | 7,9 ms | 19 ms |
| Andata/ritorno worker | 0,9 ms | 8 ms | 19 ms |
| Avvio a freddo del worker (orari + indice) | — | — | 40–60 ms |
| Dal tocco alle card, CPU 1× (8 ricerche) | 66 ms | — | 110 ms |
| Dal tocco alle card, CPU 4× sul thread UI | 70 ms | — | 148 ms |

- **Il rallentamento CPU via CDP non sembra valere per il Web Worker**: il p50 del calcolo è identico a 1× e a 4×. Anche con un telefono 10 volte più lento il p95 del calcolo resterebbe sotto i 100 ms.
- **La tabella orari sta tutta in memoria** (`trips.json` + `offsets.json`, ~72 KB gzip): nessuna rete durante la ricerca. Il worker si scalda appena si apre la tab Cerca.

# Lighthouse (31/10/2026, build di produzione, profilo mobile)

La categoria "PWA" è stata tolta da Lighthouse 12: l'installabilità si controlla con `Page.getInstallabilityErrors` di Chrome (nessun errore dell'app) e con il manifest (nessun errore).

| | Performance | Accessibilità | Best practice | SEO |
|---|---|---|---|---|
| Prima | 76–100 (instabile) | 100 | 96 | 91 |
| Dopo, throttling simulato (5 corse) | 95–99 | 100 | 96 | 100 |
| Dopo, throttling reale `--throttling-method=devtools` (3 corse) | 94–95 | — | — | — |

Con il throttling reale: FCP/LCP 1,8 s (prima 3,4 s), TBT 30 ms.

Interventi:
- **MapLibre in un pezzo separato**: JS iniziale da 381 a 94 KB gzip.
- **Shape in polyline**: da 860 a 320 KB gzip, caricate dopo il primo disegno.
- **`robots.txt`** e **source map**.

Best practice resta a 96 per la richiesta della posizione all'avvio: è voluta, la mappa mostra subito dove sei.
