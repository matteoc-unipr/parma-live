# Design system di Parma Live

Segue l'architettura approvata in `UX-AUDIT.md`. Una volta approvato, questo file sostituisce `design/README.md` come riferimento per lo stile. I valori vivono in `app/src/tokens.css`, dove i nomi `--pl-*` restano quelli attuali, quindi i componenti non vanno rinominati.

## 1. Stile: flat nativo iOS, con il vetro solo sulla mappa

Per il tipo di prodotto "trasporto pubblico", ui-ux-pro-max propone **Flat Design + Accessible**, con Minimalism / Swiss come stile secondario e una palette fatta di colori delle linee, verde/rosso per il tempo reale e una mappa neutra. Il design system generato in automatico invece puntava a una landing page (pattern "Product Demo", blu, font Lexend Mega): l'ho scartato perché non riguarda questo prodotto.

Il motivo della scelta: l'app si guarda pochi secondi, spesso camminando. Le informazioni importanti sono numeri (minuti, orari, binari) e colori delle linee. Lo stile deve togliersi di mezzo:
- **Superfici piene e opache** per liste, tabelloni e schede: si leggono meglio sotto il sole e costano meno alla GPU, già impegnata dalla mappa.
- **Vetro (blur) solo per i controlli che galleggiano sulla mappa**: barra di ricerca, indicatore LIVE, pulsante posizione, tab bar. Lì serve, perché lo sfondo cambia di continuo.
- **Gerarchia data da dimensione e peso del testo**, non da decorazioni.

## 2. Palette

### Colore principale: fucsia

Il verde è il colore che l'app usa già per **"in tempo reale / in orario"**. Ogni app di trasporti lo usa così, ed è anche il colore suggerito per questo tipo di prodotto. Se diventasse anche il colore dei pulsanti, "LIVE" e "tocca qui" avrebbero lo stesso aspetto e lo stato perderebbe significato. Il fucsia invece non ha un significato di stato: identifica l'app senza confondersi con nient'altro.

Se preferisci comunque il verde stile WhatsApp: primario `#008069` chiaro e `#21C063` scuro, con lo stato "in orario" spostato su un blu `#1F5BE0`. È fattibile, ma la scelta che consiglio resta il fucsia.

### Ruoli

| Ruolo | Token | Chiaro | Scuro | Uso |
|---|---|---|---|---|
| Primario | `--pl-accent` | `#B0006E` | `#FF5CB8` | Azione primaria, elemento selezionato, link, "Posizione attuale" |
| Su primario | (nuovo) `--pl-on-accent` | `#FFFFFF` | `#000000` | Testo e icone sopra il primario |
| Primario tenue | `--pl-accent-soft` | `rgba(176,0,110,0.12)` | `rgba(255,92,184,0.20)` | Sfondo di chip e icone attive |
| Sfondo | `--pl-bg` | `#F2F2F7` | `#000000` | Fondo delle schermate |
| Superficie | `--pl-surface` / `--pl-card` | `#FFFFFF` | `#1C1C1F` | Schede, sheet, righe. **Opache** (oggi `--pl-card` è trasparente) |
| Vetro | `--pl-glass*` | invariati | invariati | Solo controlli sulla mappa |
| Testo | `--pl-text` | `#0B0B0F` | `#F5F5F7` | Titoli, valori |
| Testo secondario | `--pl-text-2` | `#5C5C66` | `#A9A9B3` | Descrizioni, metadati |
| Testo terziario | `--pl-text-3` | `#6E6E77` (era `#9A9AA2`) | `#8E8E96` (era `#6E6E77`) | Orari barrati, fonte dati |
| Separatore | `--pl-hair` | invariato | invariato | Solo tra righe della stessa scheda |
| In orario / live | `--pl-ok` | `#0B6E3C` (era `#12814A`) | `#3DD68C` | Pallino LIVE, "in orario", countdown live |
| Ritardo | `--pl-late` | `#A65300` (era `#B25B00`) | `#FFB340` | "+4 min", dato vecchio |
| Soppressa / errore | `--pl-cancel` | `#CF2A1C` | `#FF6B5E` | Corsa soppressa, treno cancellato, errori |
| Preferito | `--pl-star` | `#E3A200` | `#FFC933` | Solo la stella (icona, mai testo) |
| Linee | `route_color` del GTFS | — | — | Badge linea, percorso sulla mappa |

### Contrasti misurati (WCAG 2.1, testo normale ≥ 4.5:1)

| Coppia | Rapporto |
|---|---|
| Bianco su primario `#B0006E` | 6.84 ✓ |
| Primario su sfondo `#F2F2F7` / su superficie bianca | 6.13 / 6.84 ✓ |
| Primario scuro `#FF5CB8` su `#1C1C1F` / nero su `#FF5CB8` | 6.05 / 7.47 ✓ |
| In orario `#0B6E3C` su sfondo / su superficie / sul suo tenue | 5.69 / 6.3 / 5.20 ✓ (il vecchio `#12814A` faceva 4.41 ✗; `#0E7A43`, prima proposta, falliva sul tenue: 4.43) |
| Ritardo `#A65300` su sfondo / su superficie | 4.88 / 5.44 ✓ (il vecchio `#B25B00` faceva 4.29 ✗) |
| Soppressa `#CF2A1C` su sfondo / su superficie | 4.70 / 5.25 ✓ |
| Testo terziario `#6E6E77` su sfondo / su superficie | 4.52 / 5.05 ✓ (il vecchio `#9A9AA2` faceva 2.79 ✗) |
| Testo terziario scuro `#8E8E96` su `#1C1C1F` | 5.23 ✓ (il vecchio `#6E6E77` faceva 3.37 ✗) |
| Stati scuri `#3DD68C` / `#FFB340` / `#FF6B5E` su `#1C1C1F` | 9.06 / 9.53 / 6.09 ✓ |

Altre regole emerse dalla verifica con axe:
- La soluzione scelta nei risultati si evidenzia con un anello fucsia, non con la tinta: sulla tinta il verde e l'arancio degli stati scendono sotto 4.5:1.
- L'etichetta della tab attiva è nel colore del testo; l'icona resta fucsia (alle icone basta 3:1). In scuro, fucsia su fucsia tenue fa 4.1:1.
- Il numero sul badge linea è bianco o nero, il più leggibile (`lineTextColor`): con il bianco fisso alcune linee ufficiali scendevano a 2.3:1.

Due avvertenze:
- **Fucsia e rosso "soppressa" hanno quasi la stessa luminosità** (1.30:1 tra loro), quindi chi non distingue bene rosso e magenta può confonderli. Per questo uno stato non si comunica mai solo con il colore: soppressa = icona + testo barrato + parola "Soppressa".
- **Il badge linea** usa il colore ufficiale della linea, anche quando è fucsia (la linea con `#C2007E`). Resta riconoscibile perché porta sempre il numero e ha una forma diversa da quella dei pulsanti. Il colore di ripiego generato dal codice salta la fascia del fucsia (tonalità 300–345°).

## 3. Tipografia

**Font di sistema** (SF Pro su iPhone), senza scaricare font web: 0 KB, funziona offline e ha già le cifre tabellari. È anche la scelta "system-first" indicata dalla ricerca tipografica.

| Token | Peso / misura / interlinea | Uso |
|---|---|---|
| `--pl-type-large-title` | 700 · 34/41 | Titolo di schermata (Preferiti, Treni) |
| `--pl-type-countdown-xl` | 700 · 40/40, cifre tabellari | Countdown in evidenza nei Preferiti |
| `--pl-type-title` | 700 · 26/30 | Nome fermata, titolo dello sheet |
| `--pl-type-countdown` | 700 · 24/26, cifre tabellari | Countdown nelle righe |
| `--pl-type-title-3` | 700 · 20/25 | Intestazione dei risultati |
| `--pl-type-headline` | 600 · 17/22 | Destinazione, nome nella riga |
| `--pl-type-body` | 400 · 17/22 | Testo normale, campi |
| `--pl-type-subhead` | 500 · 15/20 | Metadati (via…, da…) |
| `--pl-type-footnote` | 600 · 13/18 | Intestazioni di sezione, in maiuscolo, spaziatura 0.04em |
| `--pl-type-caption` | 600 · **11**/13 (era 10/12) | Etichette della tab bar |

Regole:
- Si usano tre pesi: 400, 600, 700. Il 500 solo per i metadati.
- Nessun testo sotto gli 11 px.
- Orari, minuti e binari sempre con le cifre tabellari, così non "ballano" quando cambiano.
- Le misure seguono le impostazioni del testo dinamico di iOS, cioè niente altezze fisse sulle righe di testo.

## 4. Spaziatura, raggi, ombre

**Spaziatura**: base 4. Si usano solo i token `--pl-space-1…8` (4, 8, 12, 16, 20, 24, 32).
- Margine laterale delle schermate: 16.
- Tra schede: 8.
- Dentro una scheda: 16 orizzontale, 12 verticale.
- Tra sezioni: 24.
- Area tattile minima: 44 × 44 (`--pl-touch-min`), con almeno 8 tra due bersagli vicini.

**Raggi**: restano gli attuali.

| Token | Valore | Uso |
|---|---|---|
| `--pl-radius-xs` | 8 | Pill della categoria treno |
| `--pl-radius-sm` | 12 | Box del binario |
| `--pl-radius-md` | 18 | Banner |
| `--pl-radius-lg` | 24 | Schede |
| `--pl-radius-xl` | 32 | Tab bar |
| `--pl-radius-sheet` | 40 | Sheet |
| `--pl-radius-pill` | 999 | Pulsanti e chip |

**Ombre**: solo per ciò che galleggia sopra la mappa.
- `--pl-shadow-float`: controlli sulla mappa e tab bar.
- `--pl-shadow-sheet`: bordo superiore degli sheet.
- `--pl-shadow-card` diventa `none`: sullo sfondo grigio le schede bianche si distinguono già. In modalità scura nessuna ombra, la profondità la danno le superfici più chiare.

## 5. Movimento

| Cosa | Durata | Curva | Note |
|---|---|---|---|
| Tocco (pressione) | 100 ms | ease-out | Opacità 0.6 o scala 0.97: ogni elemento toccabile reagisce |
| Cambio di stato (chip, switch, segmented) | 200 ms | `--pl-ease-spring` | |
| Sheet che si apre o cambia altezza | 350 ms (era 550) | `--pl-ease-spring` | Segue il dito durante il trascinamento |
| Sheet che si chiude, schermata che esce | 250 ms | ease-in | L'uscita è più veloce dell'entrata |
| Push / pop nella pila (fermata → bus → ←) | 300 ms | ease-out | Entra da destra ed esce verso destra, così si capisce dove torna ← |
| Countdown che cambia | 300 ms | `--pl-ease-pop` | Solo la cifra che cambia |
| Bus sulla mappa | intervallo tra due fix | lineare | Il movimento è dato, non decorazione |

Regole:
- **Si animano solo `transform` e `opacity`**, mai altezze o larghezze.
- **Il movimento mostra da dove arriva una cosa e dove torna.** Nessuna animazione d'ingresso per liste o schede, nessun "reveal" allo scorrimento.
- **Con `prefers-reduced-motion`**:
  - sheet e pila usano solo una dissolvenza di 150 ms;
  - il countdown cambia senza rimbalzo;
  - i bus saltano alla nuova posizione invece di scorrere.
- **Gli skeleton pulsano** (opacità, 1.3 s) solo finché non arrivano i dati. Dopo 10 s senza dati lasciano il posto a uno stato d'errore.

## 6. Anti-pattern da evitare

- **Gradienti viola, rosa o di qualsiasi tinta.** I colori sono pieni, e il fucsia non si sfuma mai.
- **Card annidate.** Una scheda contiene righe divise da `--pl-hair`, mai altre schede. Oggi le viola il tabellone "DA …" dentro la scheda dei risultati, che diventa una sezione dello sheet.
- **Emoji come icone.** Solo le icone SVG di `ui/icons.tsx`, stesso tratto (2 px) e stessa griglia (24).
- **Testi generici.** Mai "Errore", "Qualcosa è andato storto", "Caricamento…" da soli, "Clicca qui", "OK". Ogni testo dice cosa è successo, a cosa si riferisce e cosa fare. Per esempio:
  - "Treni non disponibili: ViaggiaTreno e RFI non rispondono. Riprovo alle 10:42."
  - "Indirizzi non disponibili offline: cerca una fermata."
  - "Linea 7 da Barriera Repubblica, tra 4 min."
- **Stato comunicato solo dal colore.** Ogni stato ha anche un'icona e una parola: live, ritardo, soppressa, dato vecchio.
- **Più di un'azione primaria per schermata.** Il fucsia pieno si usa una volta sola per schermata. Le azioni secondarie sono solo testo o icona.
- **Vetro e blur su liste e schede.** Il vetro resta solo sopra la mappa.
- **Colori, misure e durate scritti a mano nei componenti.** Si usano solo i token: lo verifica `tokens.test.ts`.
- **Icone senza etichetta accessibile** e bersagli tattili sotto i 44 px.

## 7. Cosa cambia nel codice dopo l'ok

- **`app/src/tokens.css` e `design/tokens.css`**: aggiornare i valori della tabella in §2 (primario, `--pl-on-accent` nuovo, stati, testo terziario, `--pl-card` opaca, `--pl-shadow-card: none`), `--pl-type-caption` e `--pl-dur-sheet`.
- **`CLAUDE.md`**: la sezione Design deve indicare `DESIGN.md` come riferimento.
- **Icone dell'app** (`icon.svg`, `theme_color`): passano al fucsia.
- **`lineColor` in `data/static.ts`**: il colore di ripiego deve saltare le tonalità 300–345° (oggi non lo fa).
