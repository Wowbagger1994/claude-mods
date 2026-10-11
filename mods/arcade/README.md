# arcade

Otto giochi nel pannello di Claude Code, da fare mentre Claude lavora. La partita va in pausa da sola quando Claude finisce, così non perdi il momento di tornare al prompt.

## Come si usa

`/play` apre il pannello con il menu e gli dà i tasti. Risponde «Arcade aperto: Esc torna al prompt, ctrl+x tab al gioco.». Se il gioco non riceve i tasti compare «Arcade: clicca sul gioco per dargli i tasti».

I giochi, nell'ordine del menu:

1. **Snake**: mangia la frutta (10 punti), si allunga e accelera; il muro o la coda chiudono la partita.
2. **2048**: griglia 4×4, unisci le tessere uguali; si va avanti anche oltre 2048, finché resta una mossa.
3. **Claude runner**: la mascotte di Claude corre e salta i cactus; la corsa accelera, un punto ogni due colonne.
4. **Flappy Claude**: vola tra i tubi, un punto per tubo superato; toccare un tubo o il suolo chiude la partita.
5. **Acchiappa il bug**: griglia 3×3 numerata come il tastierino; 30 secondi e 3 vite, 10 punti a bug e 5 in più se sei veloce; un tasto su una cella vuota o un bug che scappa costano una vita.
6. **Tetris**: dieci colonne; 1–4 righe tolte insieme valgono 100, 300, 500 o 800 punti, moltiplicati per il livello, che sale ogni 10 righe.
7. **Campo minato**: fino a 16×10 celle, il 15% sono mine, la prima cella è sicura; un punto per cella e un premio per la vittoria che cala con i secondi.
8. **Pioggia di parole**: scrivi le parole che cadono prima che tocchino il fondo; 3 vite, le parole vengono dal codice che Claude ha scritto.

| Dove | Tasti |
|---|---|
| Menu | `↑` `↓` (o `w` `s`) scegli · `Invio` o spazio gioca · `1`–`8` parte subito |
| Snake | frecce o WASD per girare |
| 2048 | frecce o WASD per spostare le tessere |
| Claude runner | spazio o `↑` per saltare, `↓` per scendere |
| Flappy Claude | spazio o `↑` per volare (il primo colpo fa partire) |
| Acchiappa il bug | `1`–`9`: la cella col bug, come sul tastierino |
| Tetris | `←` `→` muovi · `↑` ruota · `↓` scendi · spazio fa cadere |
| Campo minato | frecce muovi · spazio (o `Invio`) scopre · `f` bandierina |
| Pioggia di parole | scrivi le parole · `⌫` corregge · `Invio` o spazio ricomincia la parola |
| In partita | `p` pausa (`Tab` in Pioggia di parole) · `Esc` torna al prompt |
| In pausa | `Invio`, spazio o il tasto di pausa riprende · `m` menu |
| Partita finita | `Invio` o spazio rigioca · `m` menu |

Sopra il gioco una riga dice «● Claude sta lavorando…» oppure «✓ Claude ha finito: Esc torna al prompt». Sotto, il nome del gioco con punti e record; sotto il gioco, i tasti.

## Cosa fa da sola

- **Dopo 10 secondi di lavoro di Claude** mostra «Claude ci mette un po’: /play per una partita (otto giochi, con i record)». Al massimo una volta ogni 10 minuti, e mai con il pannello già in vista.
- **Quando Claude finisce il turno** mette in pausa la partita in corso («Claude ha finito: partita in pausa.») e, con il pannello in vista, mostra «Claude ha finito». Contano solo i turni della conversazione principale.
- **Dopo ogni `Edit` o `Write` riuscito** prende i nomi dal testo scritto, per Pioggia di parole.
- **A fine partita** salva il punteggio se è un nuovo record e scrive «Nuovo record!».

## Cosa legge e cosa manda

- **File**: nessuno letto. Le parole vengono dal testo nuovo di `Edit` e dal contenuto di `Write`, già passati allo strumento; mai dai file che possono contenere segreti (`.env`, chiavi `.pem`/`.key`, file con secret, credential, password o token nel nome).
- **Processi**: nessuno.
- **Modello**: nessuna chiamata.
- **Variabili d'ambiente**: nessuna.
- **Stato della sessione**: i record, se Claude sta lavorando, quanti turni sono finiti e fino a 200 parole per Pioggia di parole.
- **Record**: restano tra una sessione e l'altra, nello store della mod (`$.store`, chiave `best`): un file JSON nella cartella di configurazione di Claude Code, scritto a ogni fine partita. Con due sessioni aperte vale il record più alto delle due.

## Requisiti

- Un terminale: nell'app desktop il pannello dice «I giochi si giocano nel terminale.».

## Limiti

- Le parole valide hanno da 4 a 14 caratteri; i nomi tutti in maiuscolo sono esclusi. Sotto le 20 parole si aggiunge un elenco di parole di JavaScript e TypeScript.
- Il gioco ha sempre almeno 12 righe, anche se il pannello è più basso.
- Dopo la fine di una partita, `Invio` o spazio rigiocano solo dopo 600 millisecondi, per non ripartire per sbaglio.
- In Pioggia di parole le lettere sono mosse: per questo la pausa è `Tab` e non `p`.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install arcade@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install arcade --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

I test sono 120, in 10 file.
