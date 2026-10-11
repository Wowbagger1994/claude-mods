# drawio-viewer

Un pannello che mostra i diagrammi draw.io (`.drawio`) e li ridisegna quando Claude o tu li modificate. Così vedi il diagramma senza uscire da Claude Code.

## Come si usa

`/drawio percorso/file.drawio` apre il diagramma nel pannello. Se il file non esiste lo crea vuoto e risponde «Creato …, un diagramma vuoto: chiedi a Claude di disegnarci qualcosa.». Senza argomento apre il pannello; se è vuoto ricorda l'uso.

| Tasto | Cosa fa |
|---|---|
| `1`–`9` | passa al diagramma di quella scheda (solo i primi nove) |
| `p` / `n` | pagina precedente / successiva (solo con più pagine) |
| `g` | «Anteprima grande»: apre il PNG in Anteprima di macOS (quando il PNG c'è) |
| `v` | «Modifica in VS Code» |
| `i` | passa da «Vista a caratteri» a «Vista immagine» e ritorno (solo dove le immagini si vedono) |
| `d` | «Apri in draw.io» |
| `r` | «Aggiorna»: esporta di nuovo |
| `x` | «Chiudi»: toglie il diagramma dal pannello, non cancella il file |

Il pannello mostra le schede, il percorso, la pagina e poi il diagramma. Nel terminale è un'immagine PNG esportata da draw.io. Altrove, per esempio nell'app desktop, è un disegno a caratteri ricavato dall'XML. Mentre esporta scrive «Disegno l’anteprima…». Se l'esportazione fallisce mostra l'errore di draw.io e un pulsante «Riprova».

## Cosa fa da sola

- **Dopo ogni `Edit` o `Write` riuscito su un file `.drawio`** lo mette nel pannello e lo riesporta. L'esportazione parte dopo la risposta all'agente, che non aspetta il disegno.
- **Alla prima modifica** apre il pannello una volta sola. Se il terminale è stretto mostra «draw.io: allarga il terminale (144 colonne) o usa /drawio».
- **Ogni 2 secondi, solo con il pannello in vista**, controlla la data di modifica dei diagrammi aperti. Se un file è stato salvato da fuori (VS Code, draw.io) lo riesporta.
- **Un diagramma salvato compresso** viene segnalato: Claude non riesce a modificarlo bene. Il pannello suggerisce di togliere «Compresso» da File › Proprietà in draw.io.

## Cosa legge e cosa manda

- **File letti**: i `.drawio` aperti nel pannello (contenuto e data di modifica).
- **File scritti**: un diagramma vuoto, solo se `/drawio` riceve un file che non esiste; i PNG in `~/Library/Caches/drawio-viewer/`, uno per file e pagina, che la mod non cancella.
- **Processi**:
  - `mkdir -p ~/Library/Caches/drawio-viewer`
  - `/Applications/draw.io.app/Contents/MacOS/draw.io --export --format png --scale 2 --border 16 --page-index <pagina> --output <png> <file>` (timeout 60 secondi)
  - `sips -g pixelWidth -g pixelHeight <png>` per la misura dell'immagine
  - dai pulsanti: `code <file>`, `open -a draw.io <file>`, `open -a Preview <png>`
- **Modello**: nessuna chiamata.
- **Variabili d'ambiente**: `HOME`, `CLAUDE_CODE_SESSION_KIND`, `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`.
- **Stato della sessione**: per ogni diagramma percorso, pagina, numero di pagine, se è compresso, data di modifica, esito, errore, percorso e misura del PNG, forme e collegamenti letti dall'XML; il diagramma scelto; se il pannello si è già aperto da solo; se è attiva la vista a caratteri.

## Requisiti

- **macOS**, per il PNG (draw.io in `/Applications`, `sips`, `open -a`, `~/Library/Caches`); altrove il pannello dice che draw.io non c'è e mostra solo il disegno a caratteri.
- **draw.io Desktop** in `/Applications/draw.io.app` (`brew install --cask drawio`) per il PNG. Senza, il pannello lo dice e mostra il disegno a caratteri.
- **VS Code** con il comando `code` nel `PATH`, per «Modifica in VS Code».
- **Immagini nelle sessioni in background**: Claude Code non disegna immagini in una sessione in background (`CLAUDE_CODE_SESSION_KIND` uguale a `bg`). Lì il pannello mostra il disegno a caratteri e questo avviso: «Qui Claude Code spegne le immagini: per vedere il PNG aggiungi "CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1" in "env" di ~/.claude/settings.json e riavvia Claude.». Va bene qualunque valore diverso da vuoto, `0` e `false`.

## Limiti

- Un diagramma compresso non ha la vista a caratteri: solo il PNG.
- Il disegno a caratteri arriva al massimo a 150 righe e disegna ogni forma come rettangolo, ellisse, rombo o testo.
- L'immagine non supera 255 celle per lato; anche in un pannello basso ha almeno 8 righe di spazio.
- Il pannello si apre da solo da 144 colonne in su (da 110 se l'hai già aperto tu e non l'hai chiuso a mano); con `/drawio` si apre a ogni larghezza.
- Il primo export può essere lento: draw.io avvia Electron a ogni esportazione.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install drawio-viewer@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install drawio-viewer --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

I test sono 38, in 3 file.
