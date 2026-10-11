# work-diary

Un diario del lavoro fatto con Claude: calendario del mese con le ore di ogni giorno e un resoconto breve della giornata e della settimana, ricavati dai transcript di Claude Code e dai tuoi commit.

## Come si usa

`/diary` apre il pannello «Diario». In alto il calendario del mese: ogni giorno con le ore di lavoro, colorato da chiaro a arancione secondo il tempo, `●` su oggi. Sotto, la settimana del giorno scelto (totale, resoconto, ore per progetto) e il giorno stesso (resoconto, poi per ogni progetto le sessioni per titolo e gli ultimi commit).

| Tasto | Cosa fa |
|---|---|
| `a` / `d` | Giorno prima / giorno dopo |
| `w` / `s` | Settimana prima / settimana dopo |
| `p` / `n` | Mese prima / mese dopo |
| `t` | Oggi, rileggendo i transcript |
| `r` | Riscrive i resoconti del giorno e della settimana |

Un giorno del calendario si sceglie anche con un clic.
Il resoconto è di 3-5 righe per il giorno e 3-6 per la settimana, in seconda persona («hai…»). Finché non c'è: «Resoconto non ancora scritto: premi r.»

## Cosa fa da sola

Nulla in sottofondo: lavora solo a pannello aperto.

- **Quando apri `/diary` o premi `t`**: rilegge i transcript degli ultimi giorni.
- **Quando apri `/diary`, premi `t` o scegli un giorno**: scrive i resoconti che mancano o non sono più aggiornati, prima quello del giorno, poi quello della settimana, poi gli altri giorni della settimana. Un resoconto si riscrive quando cambiano i fatti: nuove sessioni, titoli o commit, oppure il tempo di lavoro passa una soglia di mezz'ora. Basta aprire il pannello perché partano le richieste a `haiku`, fino a otto.

## Cosa legge e cosa manda

- Lancia `python3 -I hooks/scan.py ~/.claude/projects <giorno>`. Lo script legge i transcript (`~/.claude/projects/*/*.jsonl`) e ne tira fuori solo fatti: orari, numero dei tuoi messaggi e dei comandi Bash, titolo della sessione, cartella, ramo, percorsi dei file modificati. Mai il testo dei messaggi o l'output degli strumenti.
- Lo script lancia `git -C <cartella> rev-parse --path-format=absolute --git-common-dir`, `git config user.email` e `git log --branches --remotes --tags --no-merges --author=<tua email>` sui repository delle sessioni.
- I resoconti li scrive `haiku`, con `$.model.complete`. Gli arrivano: data e ore, nomi dei progetti e dei rami, titoli delle sessioni, numero di messaggi e comandi, nomi (non percorsi) di al massimo 8 file per sessione, oggetto di al massimo 25 commit. Per la settimana, i resoconti dei giorni già scritti al posto dei loro fatti.
- Prima dell'invio ogni sequenza di 32 caratteri o più che sembra un token diventa «…».
- Tiene i resoconti (`summaries`), per giorno e per settimana, nello stato della sessione e nello store della mod (`$.store`, un file JSON nella cartella di configurazione di Claude Code), così restano tra una sessione e l'altra. Un resoconto viene riscritto solo se i fatti del giorno sono cambiati. Quelli più vecchi di 31 giorni si cancellano.

## Requisiti

- `python3`.
- `git` 2.31 o successivo, per i commit e per riconoscere i repository; senza, il diario mostra solo le sessioni.

## Limiti

- Copre gli ultimi 30 giorni: oltre, Claude Code non tiene più i transcript.
- Una pausa di più di 15 minuti tra due messaggi non conta come lavoro. Le sessioni in parallelo si contano una volta sola.
- I subagent non contano.
- Conta solo i commit con l'email di `git config user.email` del repository; un commit visto su due rami conta una volta.
- La lettura dei transcript ha 2 minuti; ogni `git` 10 secondi; ogni resoconto 60 secondi e al massimo 600 token.
- Nel pannello: i primi 5 progetti della settimana, 4 sessioni e 3 commit per progetto.
- Le ore sono quelle del fuso orario del computer.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install work-diary@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install work-diary --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
python3 -I hooks/scan_test.py
```

Oggi i test sono 35 in TypeScript e 4 in Python.
