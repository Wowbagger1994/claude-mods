# diff-checker

Un pannello con una scheda per ogni file che Claude ha modificato in questa sessione: il diff evidenziato di ogni modifica e, a fine turno, il perché scritto da Claude. Serve a seguire cosa cambia senza aprire i file uno per uno.

## Come si usa

`/diff-checker` apre il pannello e risponde «Pannello aperto: N file.» (oppure «Pannello aperto: nessuna modifica ancora.»).

| Tasto | Cosa fa |
|---|---|
| `1`–`9` | apre il file di quella scheda (solo le prime nove) |
| `e` | apre tutte le modifiche del file |
| `c` | chiude tutte le modifiche del file |
| `m` | mostra o nasconde la «Panoramica» |

I tasti valgono quando il pannello ha il cursore; le frecce scorrono, Esc torna al prompt. Senza tasto: «⌫ Svuota» (chiede «Svuotare tutto?» e poi «Sì, svuota» o «Annulla»), «▸ apri» / «▾ chiudi» su ogni modifica, «Riprova» su una spiegazione fallita. Anche i nomi nella mappa e nella linea del tempo si possono premere.

Cosa si vede:
- l'intestazione con il totale dei file e delle righe `+` e `−`;
- la Panoramica: la «MAPPA DEI FILE», con blocchi grandi quanto le righe cambiate, e la «LINEA DEL TEMPO» delle modifiche di ogni file;
- le schede dei file, raggruppate per worktree git e ramo quando sono più di uno;
- per il file scelto: percorso, ramo, numero di modifiche e una minimappa del file che segna le righe toccate;
- le modifiche, dalla più recente. È aperta solo l'ultima: le altre si aprono a mano.

La riga di stato mostra `◆ N file · +X −Y`.

## Cosa fa da sola

- **Dopo ogni `Edit` e `Write` riuscito** registra il diff. Un'azione negata o fallita non lascia traccia.
- **Alla prima modifica della sessione** apre il pannello una volta sola. Se il terminale è stretto mostra «Diff checker: allarga il terminale (144 colonne) o usa /diff-checker».
- **A fine turno della conversazione principale** chiede a Claude perché ha fatto le modifiche ancora senza spiegazione. Il turno di un subagente non fa partire la domanda. Mentre aspetta, la modifica dice «Il perché arriva a fine turno.» e poi «Claude sta scrivendo il perché…».

## Cosa legge e cosa manda

- **File**: non legge né scrive file. Usa il risultato che `Edit` e `Write` restituiscono già.
- **Processi**: per ogni cartella, una volta per caricamento, `git -C <cartella> rev-parse --show-toplevel --abbrev-ref HEAD` (timeout 5 secondi), per sapere worktree e ramo.
- **Modello**: `$.model.fork` sulla trascrizione della sessione stessa, senza strumenti. Manda al massimo 12 modifiche per domanda e 60 righe di diff per modifica, con id e percorso. Chiede la risposta in JSON. Al massimo due giri per fine turno. Ogni domanda consuma token del tuo account.
- **Variabili d'ambiente**: nessuna.
- **Stato della sessione**: i file toccati con i loro diff, le spiegazioni, le righe segnate, worktree e ramo; il file scelto; le modifiche aperte o chiuse; se la Panoramica è aperta; se il pannello si è già aperto da solo.

## Requisiti

- `git` nel `PATH`, solo per raggruppare per worktree e ramo. Senza git le schede non sono raggruppate e sopra il diff resta il percorso completo.

## Limiti

- Guarda solo gli strumenti `Edit` e `Write`.
- Tiene al massimo 40 file e 20 modifiche per file: le più vecchie escono.
- Un diff più lungo di 30.000 caratteri viene tagliato all'ultimo blocco `@@` che ci sta.
- Una spiegazione si ferma a 600 caratteri.
- Il pannello si apre da solo da 144 colonne in su (da 110 se l'hai già aperto tu e non l'hai chiuso a mano); con `/diff-checker` si apre a ogni larghezza.
- Se Claude non risponde a un id, quella modifica passa a «Spiegazione non disponibile.».

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install diff-checker@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install diff-checker --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

I test sono 59, in 5 file.
