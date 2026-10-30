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
