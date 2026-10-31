# Audit UX di Parma Live

Analisi del codice al commit `0138073`. Riguarda flussi, gerarchia ed etichette: lo stile visivo è escluso.

## 1. Mappa attuale

Tab bar con 4 voci: **Mappa** (schermata d'avvio), **Cerca**, **Treni**, **Preferiti**. Info non è una tab: è una schermata sovrapposta.

| Schermata | Cosa contiene | Come ci si arriva | Come se ne esce |
|---|---|---|---|
| Mappa | Bus live, fermate (solo da zoom 13.6 in su), chip filtro linee, indicatore LIVE, pulsante posizione, pulsante Info, riga attribuzioni | Avvio, tab | Tab |
| Sheet fermata | Linee della fermata, codice, stella, legenda "tempo reale / programmato", elenco ARRIVI | Tocco su una fermata, su una scheda dei Preferiti, su una fermata nello sheet bus | ✕, trascinando giù |
| Sheet bus | Direzione, ritardo, vettura, capolinea di partenza, prossime fermate | Tocco su un bus, tocco su un arrivo live nello sheet fermata | ✕, trascinando giù |
| Cerca (modulo) | Campi Da/A, pulsante inverti, suggerimenti (posizione, fermate, indirizzi), "Cerca soluzioni" | Tab | Tab |
| Cerca (risultati) | Barra Da/A, sheet con le soluzioni, tabellone della fermata di salita, Salva, suggerimento "a piedi" | Scelta di Da e A, scheda tragitto nei Preferiti | ← (torna al modulo). **La tab bar è nascosta.** |
| Treni | Scheda "Bus per la Stazione FS", Partenze/Arrivi, elenco, fonte | Tab | Tab |
| Dettaglio treno | Percorso, stato, binario, ultimo rilevamento, fermate | Tocco su un treno | ← Partenze/Arrivi |
| Preferiti | Tragitti (prossima soluzione con countdown), fermate (3 passaggi) | Tab | Tab |
| Info | Tema, fonti dati | ⓘ sulla Mappa, ⓘ nei Preferiti, riga attribuzioni della Mappa | ← Indietro |

## 2. Utente e compiti

L'utente è una sola persona, il proprietario: si muove a Parma, usa l'iPhone con una mano, spesso in cammino, e guarda l'app pochi secondi per volta. Conosce già le linee e le fermate che usa.

1. **"Quando passa il mio bus?"** a una fermata nota. È il compito più frequente.
2. **"Come arrivo da qui a lì?"** verso un posto meno abituale.
3. **"Il mio treno parte in orario? Come arrivo in stazione?"**

## 3. Passaggi oggi e attriti

### Compito 1: prossimi passaggi a una fermata

| Caso | Passaggi |
|---|---|
| Fermata nei Preferiti | Apri l'app (si apre sulla Mappa) → Preferiti. **1 tocco.** |
| Fermata vicina, non salvata | Mappa → centra, zoom finché compaiono le fermate → tocca la fermata. **1 tocco + 1–3 gesti.** |
| Fermata nota per nome, lontana | **Non c'è un percorso diretto.** In Cerca, scegliere una fermata la usa come partenza o arrivo di un tragitto: non apre il suo tabellone. Bisogna trovarla sulla mappa. |

Attriti:
- **L'avvio sulla Mappa costa un tocco** proprio nel caso più frequente: chi ha dei preferiti vuole vedere subito i countdown.
- **Toccare una fermata nei Preferiti cambia tab**: lo sheet si apre sopra la Mappa e, chiudendolo, si resta sulla Mappa invece di tornare ai Preferiti.
- **Gli sheet non ricordano da dove si arriva.** Fermata → bus → ✕ chiude tutto, non torna alla fermata. Lo stesso succede con bus → fermata.
- **Le fermate compaiono solo da zoom 13.6.** A zoom città la mappa mostra solo i bus, e niente suggerisce di avvicinarsi.
- **"ARRIVI" nello sheet fermata** usa la stessa parola dei treni ("Arrivi" = treni in arrivo a Parma), ma qui indica i bus che passano, cioè le partenze da quella fermata.
- **Una stella tocca e rimuove subito un preferito**, senza conferma né annulla. Sulle schede dei Preferiti è vicina all'area che apre la scheda.

### Compito 2: da A a B

Cerca → il campo A ha già il fuoco → scrivi → scegli un suggerimento → risultati. **1 tocco + testo + 1 tocco.** Il flusso è buono, perché Da vale "Posizione attuale" se il GPS è attivo.

Attriti:
- **I risultati nascondono la tab bar**, e ← torna al modulo. Se ci si arriva da un tragitto preferito, non si torna ai Preferiti.
- **Offline, gli indirizzi spariscono senza avviso**: l'errore di Photon viene ignorato e compare "Nessun risultato.", che sembra una ricerca a vuoto.
- **"Ricerca non riuscita: {errore}"** mostra un messaggio tecnico e non offre di riprovare.
- **"Cerca soluzioni"** compare solo a campi già pieni e fuori fuoco. Di solito i risultati partono da soli, quindi il pulsante serve solo dopo "Annulla" o "inverti": è un secondo modo di fare la stessa cosa.
- **La partenza è sempre "ora".** Va bene per l'uso attuale, ma è un limite da sapere.

### Compito 3: treni e stazione

Treni → trova il treno nell'elenco (scorrendo) → toccalo. **2 tocchi + scorrimento.** Per il bus verso la stazione: Treni → leggi la scheda in alto, **1 tocco**. Toccandola si va in Cerca, con gli stessi problemi di ritorno del compito 2.

Attriti:
- **La scheda "Bus per la Stazione FS" sta sopra Partenze/Arrivi** e spinge in giù il tabellone, che è il contenuto principale della schermata.
- **Il titolo "Parma"** non dice che la schermata riguarda i treni. "Stazione FS" è nel sottotitolo.
- **Con entrambe le fonti giù e nessun dato salvato** (oggi, con RFI in 502) si vede solo "Riprovo tra 30 secondi". Non c'è un'alternativa, per esempio un link al sito di Trenitalia.
- **Non si può cercare un treno per numero**: bisogna scorrere l'elenco.

### Trasversali
- **Info ha tre ingressi**: ⓘ sulla Mappa, ⓘ nei Preferiti, riga attribuzioni. Contiene una sola impostazione.
- **Sulla Mappa ci sono 8 controlli allo stesso livello**: fino a ~30 chip linea, "Tutte", indicatore LIVE, ⓘ, posizione, attribuzioni. I chip esistono solo per le linee con bus in giro, quindi di notte spariscono.
- **"Orari non disponibili"** (dati statici non caricati) non spiega cosa fare e non permette di riprovare.
- **L'attribuzione BusOne obbligatoria è solo nella schermata Info**: sulla Mappa compaiono solo OpenFreeMap e OSM.

## 4. Nuova architettura dell'informazione

Le tab passano da 4 a 3. La ricerca diventa una barra in cima alla mappa.

```
Preferiti (avvio se ce n'è almeno uno)   Mappa (avvio altrimenti)        Treni
 ├ tragitti → risultati                   ├ barra "Fermata, linea o       ├ Partenze | Arrivi
 ├ fermate  → tabellone                   │  indirizzo"                   │   └ dettaglio treno
 └ ⚙ (Info + tema)                        │   ├ fermata → tabellone       └ Bus per la stazione (in fondo)
                                          │   └ indirizzo → risultati da qui
                                          ├ tocco fermata → tabellone ⇄ bus
                                          └ tocco bus → bus ⇄ fermata
```

Un'azione primaria per schermata:

| Schermata | Azione primaria | Tutto il resto è secondario |
|---|---|---|
| Preferiti | Leggere il prossimo passaggio (tocco = dettaglio) | Rimuovere in modalità "Modifica" |
| Mappa | Barra di ricerca | Posizione, filtro linee (un solo pulsante "Linee" invece di 30 chip) |
| Tabellone fermata | Leggere i passaggi | Stella |
| Bus | Leggere le prossime fermate | — |
| Risultati | Scegliere una soluzione | Salva, inverti, modifica Da |
| Treni | Toccare un treno | Bus per la stazione |

Regole di navigazione:
- **Ogni tabellone, sheet o risultato si apre sopra la tab in cui si trova l'utente** e torna lì con ← o ✕. Niente salti di tab.
- **Gli sheet formano una pila**: fermata → bus → ← torna alla fermata. ✕ chiude tutta la pila.
- **La tab bar resta visibile dappertutto**, tranne che con uno sheet a schermo pieno.

## 5. Cosa eliminare, unire, spostare

**Eliminare**
- La tab **Cerca**: il suo contenuto passa nella barra della Mappa.
- Il pulsante **"Cerca soluzioni"**: i risultati partono da soli.
- Il pulsante **ⓘ sulla Mappa**: restano la riga attribuzioni e l'ingresso dai Preferiti.
- La **legenda "tempo reale / programmato"** ripetuta in ogni tabellone: le icone sulle righe bastano.

**Unire**
- **Ricerca fermate e ricerca A→B in un'unica barra**. Una fermata apre il suo tabellone, che offre "Portami qui". Un indirizzo apre i risultati da "Posizione attuale".
- **I 30 chip linea in un solo controllo "Linee"** (lista a scelta multipla), con l'indicatore LIVE accanto.

**Spostare**
- **La schermata d'avvio sui Preferiti**, se ce n'è almeno uno.
- **"Bus per la Stazione FS"** in fondo alla schermata Treni, o in una riga compatta sotto Partenze/Arrivi.
- **La rimozione dei preferiti** dalla stella sempre visibile a una modalità "Modifica", oppure lasciarla con un toast "Rimosso · Annulla".
- **L'attribuzione BusOne nella riga attribuzioni della Mappa**, oltre che in Info.

**Rinominare**
- "ARRIVI" (sheet fermata) → "Prossimi passaggi".
- Titolo Treni "Parma" → "Treni da Parma", con il sottotitolo che resta per l'ora di aggiornamento.

**Stati da aggiungere**
- Offline nella ricerca: "Indirizzi non disponibili offline, cerca una fermata".
- Errori del planner e "Orari non disponibili": messaggio comprensibile con il pulsante "Riprova".
- Preferiti vuoti: un'azione "Cerca una fermata" che apre la barra della Mappa.
- Treni con entrambe le fonti giù: un link al sito Trenitalia.
- Mappa a zoom città: un suggerimento "Avvicina per vedere le fermate", oppure fermate visibili prima.
