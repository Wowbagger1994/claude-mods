# arcade

Undici giochi nel pannello di Claude Code, da fare mentre Claude lavora. La partita va in pausa da sola quando Claude finisce, così non perdi il momento di tornare al prompt.

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
9. **Breakout**: rompi il muro di mattoni con la palla; i mattoni più in alto valgono di più, a volte ne cade un bonus (racchetta larga, palla lenta, vita in più); 3 vite, e ogni muro abbattuto ne porta uno più veloce.
10. **Wordle del codice** (tasto `a`): indovina in sei tentativi una parola di cinque lettere presa dal codice che Claude ha scritto, o dal vocabolario della programmazione; ogni parola risolta vale (7 − tentativi) × 10 punti, la prima mancata chiude la partita.
11. **Labirinto 3D** (tasto `b`): un labirinto in prima persona; trova la porta verde nell'angolo opposto prima che scada il tempo. Ogni uscita vale 100 punti per livello più 5 per ogni secondo rimasto, e il labirinto dopo è più grande.

Com'è fatto ogni gioco: tutti stanno in una cornice dai bordi arrotondati con lo stesso tono di colori, e ogni evento si vede (punti nel bordo, lampi, cornice che cambia colore).

- **Menu**: un riquadro «◆ ARCADE» con un'icona colorata per gioco, cosa si fa in due parole e il record (★) a destra; la riga scelta è evidenziata in arancione.
- **Snake**: il serpente sfuma dal verde acceso della testa, con gli occhi, al verde scuro della coda; il frutto pulsa e, quando lo mangia, la cornice si accende, compare +10 e il boccone scivola lungo il corpo. Nel bordo basso, la velocità.
- **2048**: tessere dai colori classici, più alte quando c'è spazio; le fusioni dell'ultima mossa sono segnate con ✦, la tessera nuova cresce e il bordo mostra i punti fatti e la strada verso il 2048.
- **Claude runner**: la mascotte corre su un terreno che scorre, con nuvole e dune più lente sullo sfondo, cactus con le braccia, scie di vento quando accelera, un'ombra quando salta e un'esplosione rossa se si schianta; ogni 100 punti il bordo lo festeggia.
- **Flappy Claude**: un cielo con tre piani di profondità (stelle, nuvole e una città lontana, più lente dei tubi) e tubi in rilievo; la mascotte batte le ali a ogni spazio, prende un +1 verde a ogni tubo e, se si schianta, diventa rossa con gli occhi a croce.
- **Acchiappa il bug**: ogni cella è un tasto col numero nel bordo; il bug muove le zampe e passa da viola ad ambra a rosso man mano che sta per scappare, con la barra della vita che gli resta sotto. Un colpo lo schiaccia e mostra i punti, un errore mostra «✗ mancato». In alto la barra del tempo; con meno di 16 righe le celle diventano basse e la barra sparisce.
- **Tetris**: un pozzo con blocchi in rilievo, l'ombra che mostra dove cadrà il pezzo, una scia quando lo lanci giù, le righe complete che lampeggiano di bianco con i punti nel bordo, e la cornice che passa all'ambra e al rosso quando la pila sale; di lato il pezzo successivo e il livello con la sua barra.
- **Campo minato**: caselle in rilievo, i numeri nei loro colori classici, il cursore arancione, le caselle appena scoperte velate di verde e contate nel bordo; in alto mine e bandierine, in basso la barra dei progressi; alla fine la mina esplosa in rosso o il campo ripulito in verde.
- **Breakout**: disegnato a mezzi blocchi, così la palla scorre fluida con una scia; mattoni arcobaleno in rilievo che lampeggiano e si sbriciolano con il loro +N, bonus che cadono come pillole, vite e timer dei bonus nel bordo, cornice rossa per la palla persa e verde per il muro abbattuto.
- **Wordle del codice**: tessere colorate che si girano una a una in verde, ambra o grigio; la riga corrente col cursore, la tastiera che ricorda le lettere provate, la riga che trema se mancano lettere, il +N alla parola risolta e la parola rivelata (con la sua provenienza) alla fine.
- **Labirinto 3D**: muri disegnati in 3D con le ombre della distanza e due toni per lato, soffitto blu sfumato e pavimento a puntini che scorrono, la porta verde che pulsa; in alto a destra una minimappa con le celle percorse, in basso il tempo (ambra, poi rosso) e la bussola.
- **Pioggia di parole**: le parole cadono in una corsia sotto una pioggia leggera; la parte già scritta diventa verde, le parole vicine al fondo ambra e poi rosse, una linea rossa segna il pericolo, i bordi mostrano combo, precisione e velocità, e ogni parola completata esplode con i suoi punti.

| Dove | Tasti |
|---|---|
| Menu | `↑` `↓` (o `w` `s`) scegli · `Invio` o spazio gioca · `1`–`9`, poi `a` e `b`, parte subito |
| Snake | frecce o WASD per girare |
| 2048 | frecce o WASD per spostare le tessere |
| Claude runner | spazio o `↑` per saltare, `↓` per scendere |
| Flappy Claude | spazio o `↑` per volare (il primo colpo fa partire) |
| Acchiappa il bug | `1`–`9`: la cella col bug, come sul tastierino |
| Tetris | `←` `→` muovi · `↑` ruota · `↓` scendi · spazio fa cadere |
| Campo minato | frecce muovi · spazio (o `Invio`) scopre · `f` bandierina |
| Pioggia di parole | scrivi le parole · `⌫` corregge · `Invio` o spazio ricomincia la parola |
| Breakout | `←` `→` (o `a` `d`) muovi · spazio o `↑` lancia la palla |
| Wordle del codice | scrivi 5 lettere · `Invio` prova · `⌫` cancella |
| Labirinto 3D | `↑` `↓` (o `w` `s`) avanti e indietro · `←` `→` (o `a` `d`) gira · `m` mostra o nasconde la mappa |
| In partita | `p` pausa (`Tab` in Pioggia di parole e Wordle del codice) · `Esc` torna al prompt |
| In pausa | `Invio`, spazio o il tasto di pausa riprende · `m` menu |
| Partita finita | `Invio` o spazio rigioca · `m` menu |

Sopra il gioco una riga dice «● Claude sta lavorando…» oppure «✓ Claude ha finito: Esc torna al prompt». Sotto, l'icona e il nome del gioco con punti e record; sotto il gioco, i tasti. La pausa e la fine della partita compaiono in un riquadro: ambra «❚❚ PAUSA», rosso «FINE», verde «★ NUOVO RECORD».

## Cosa fa da sola

- **Dopo 10 secondi di lavoro di Claude** mostra «Claude ci mette un po’: /play per una partita (undici giochi, con i record)». Al massimo una volta ogni 10 minuti, e mai con il pannello già in vista.
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
- Il gioco ha sempre almeno 12 righe, anche se il pannello è più basso. Tetris ne vuole 16 (un pozzo di almeno 14 più il bordo): con meno il fondo resta tagliato.
- Flappy Claude con 12 righe ha un cielo di 10 e varchi di 8: diventa molto facile. Con più spazio non cambia.
- In 2048 i segni delle fusioni restano fino alla mossa dopo, perché il gioco non ha un orologio; lo stesso per le caselle appena scoperte di Campo minato.
- Dopo la fine di una partita, `Invio` o spazio rigiocano solo dopo 600 millisecondi, per non ripartire per sbaglio.
- In Pioggia di parole e in Wordle del codice le lettere sono mosse: per questo la pausa è `Tab` e non `p`.
- In Wordle del codice ogni combinazione di cinque lettere vale come tentativo (niente dizionario); le parole prese dal codice possono essere sigle o pezzi di nomi.
- In Labirinto 3D `m` in partita mostra o nasconde la mappa; in pausa e a fine partita torna al menu.
- Breakout e Labirinto 3D si muovono a ogni tasto premuto: la fluidità dipende dalla ripetizione dei tasti del terminale.

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

I test sono 293, in 16 file.
