# git-tree

Un pannello «Albero di git» che racconta la storia del repository come una mappa della metropolitana. Ogni ramo è una linea con il suo nome e il suo colore. Si vede da dove nasce, dove rientra con un merge e che fine ha fatto. Comprende i rami locali e quelli su GitHub.

Si sceglie un commit con i tasti e se ne leggono il messaggio e i file cambiati. Da lì si può passare a un ramo o crearne uno, sempre dopo una conferma.

## Come si usa

`/git-tree` apre il pannello sul repository della cartella della sessione. Qui sotto c'è il pannello vero, disegnato a caratteri su un repository con quattro pull request unite (nel terminale ogni ramo ha il suo colore):

```
◆ ALBERO DI GIT  ·  demo-repository                                  ↓ scarica  ↻ aggiorna

╭────────────────────────────────────────────────────────────────────────────────────────╮
│ SEI SU   ⎇ main    ☁ allineato con GitHub                          ✎ 1 file modificato │
│ ultimo commit 27 lug · 43 commit · 5 rami                                              │
╰────────────────────────────────────────────────────────────────────────────────────────╯

▍Rami                                                                    1–9 salta al ramo
                           26 lug         27 lug
 1 ▶ main             ●━━━━━━━━━━━━━━━━━━━━━━━━◉  sei qui · 7 commit
 2   docs/manuale-in…                         ┗┛  unito #4 · 1 commit
 3   docs/convenzioni                      ┗━━┛   unito #3 · 4 commit · ☁ resta su GitHub
 4   docs/guida-codi…                   ┗━━┛      unito #2 · 3 commit
 5   chore/p3-cleanup  ┗━━━━━━━━━━━━━━━━┛         unito #1 · 28 commit

▍Commit                                             j giù  k su  o apri/chiudi  h dove sei
        ── lunedì 27 luglio ────────────────────────────────────────────────────────────
▶ ◉━┓   main ☁              qui  ⇠ unisce docs/manuale-introduttivo (#4)    lbianchi 17:35
  ┃ ┃  ╭───────────────────────────────────────────────────────────────────────────────╮
  ┃ ┃  │ 3f1c9e7a52b80d46e1a7c09b28f5d6e4a1b7c3d9 · lbianchi · lun 27 lug 2026, 17:35  │
  ┃ ┃  │                                                                               │
  ┃ ┃  │ Merge pull request #4 from lbianchi/docs/manuale-introduttivo                 │
  ┃ ┃  │ docs: integra il manuale introduttivo nella knowledge                         │
  ┃ ┃  │                                                                               │
  ┃ ┃  │ 9 file · +635 −23                                                             │
  ┃ ┃  │   +333 −0     docs/archivio/manuale-introduttivo.md                           │
  ┃ ┃  │   +bin −bin   docs/archivio/manuale-introduttivo.pdf                          │
  ┃ ┃  │    +86 −3     docs/knowledge/00-panorama.md                                   │
  ┃ ┃  │    +39 −4     docs/knowledge/02-convenzioni-codice.md                         │
  ┃ ┃  │    +48 −2     docs/knowledge/05-ai.md                                         │
  ┃ ┃  │    +46 −0     docs/knowledge/08-decisioni.md                                  │
  ┃ ┃  │    +11 −1     docs/knowledge/09-trappole.md                                   │
  ┃ ┃  │    +53 −5     docs/knowledge/10-guida-codice.md                               │
  ┃ ┃  │ … e un altro file                                                             │
  ┃ ┃  │                                                                               │
  ┃ ┃  │ ⑂ nuovo ramo qui  ⧉ copia hash  ✦ chiedi a Claude                             │
  ┃ ┃  ╰───────────────────────────────────────────────────────────────────────────────╯
  ┃ ●   docs/manuale-intr… docs: integra il manuale introduttivo nella kn…   Giorgio 17:32
  ◆━┻━┓ main               ⇠ unisce docs/convenzioni (#3)                   lbianchi 17:06
  ┃   ● docs/convenzioni ☁ docs: regole per i nomi dei file, e due esempi…   Giorgio 17:02
  ┃   ┇ docs/convenzioni   3 commit  lunedì 27 luglio                              Giorgio
  ◆━┳━┛ main               ⇠ unisce docs/guida-codice (#2)                  lbianchi 15:33
  ┃ ┇   docs/guida-codice  3 commit  lunedì 27 luglio                              Giorgio
  ◆━┻━┓ main               ⇠ unisce chore/p3-cleanup (#1)                   lbianchi 14:16
  ┃   ┇ chore/p3-cleanup   28 commit  sabato 25 luglio → lunedì 27 luglio          Giorgio
  ┃   ┃ ── giovedì 5 marzo ─────────────────────────────────────────────────────────────
  ●━━━┛ main               Add search filters, user settings, and export/…   Giorgio 17:48
  ┃ ── 11 dicembre 2025 ────────────────────────────────────────────────────────────────
  ● main               Release v0.2.0: login improvements, UI fixes, and …   Giorgio 14:52
  ┃ ── 6 dicembre 2025 ─────────────────────────────────────────────────────────────────
  ● main               Improve dashboard widgets and fix UI issues           Giorgio 10:05
```

Il pannello ha tre parti.

**Sei su.** Il ramo su cui sei è un'etichetta nel suo colore. Accanto c'è il suo stato rispetto a GitHub:
- «☁ allineato con GitHub»;
- «↑ 2 da mandare», «↓ 3 da scaricare»;
- «non collegato a GitHub»;
- se non sei su nessun ramo (HEAD staccata), l'etichetta diventa «⎇ HEAD staccata su abc1234» in giallo e accanto c'è «nessun ramo: i commit fatti qui non hanno un nome».

A destra ci sono i file modificati o nuovi, non ancora committati. Sotto: quanto è vecchio il commit su cui sei, quanti commit e quanti rami sono letti.

**Rami.** Una riga per ramo, al massimo nove, a partire da quello su cui sei. Ogni ramo è disegnato su una linea del tempo comune:
- `┗━━┛` è nato da un altro ramo ed è stato unito;
- `┗━━●` è ancora aperto;
- il ramo su cui sei finisce con `◉`; un ramo che nella storia letta non nasce da un altro comincia con `●`.

La linea del tempo va per numero di commit, non per calendario: un periodo di lavoro fitto prende spazio, un anno di silenzio no. Fino a quattro date sopra dicono a quando corrisponde ogni punto; una data che toccherebbe la vicina, o che si ripete, è lasciata fuori. A destra c'è che fine ha fatto il ramo:
- «sei qui»;
- «unito #3» (con il numero della pull request), più «in develop» se è entrato in un ramo diverso dal tuo, e «☁ resta su GitHub» se il ramo esiste ancora lì;
- «aperto», con «☁ su GitHub» oppure «solo qui»;
- «solo su GitHub».

Il tasto con la cifra del ramo porta la mappa al suo ultimo commit.

**Commit.** La mappa, dal più recente:
- `●` è un commit, `◉` quello su cui sei (con l'etichetta «qui»), `◆` un merge;
- `┻` e `┛` segnano dove un ramo nasce da quello a sinistra; `┓` e `┳` dove un merge apre la linea del ramo unito; `┫` e `┣` dove un merge si aggancia a una linea già disegnata; `╋` dove due linee si incrociano;
- il nome del ramo compare dove la linea cambia ramo, e di nuovo dopo ogni intestazione di giorno e dopo la scheda; `☁` quando GitHub ha lo stesso commit, «☁ GitHub è qui» quando la copia su GitHub è rimasta indietro;
- gli altri nomi su un commit compaiono prima del titolo: `⎇ ramo` per un ramo locale, `☁ ramo` per uno su GitHub, `◇ tag` per un tag;
- un merge si legge in parole: «⇠ unisce docs/convenzioni (#3)»;
- un'intestazione segna l'inizio di ogni giorno più vecchio.

Tre o più commit di fila dello stesso ramo, senza niente di speciale (nessun nome di ramo o tag, nessun ramo che nasce o rientra), si chiudono in una riga. Il commit selezionato e quello su cui sei non finiscono mai dentro un gruppo. Esempio: `┇ chore/p3-cleanup  28 commit  sabato 25 luglio → lunedì 27 luglio`. Selezionata, `o` la apre; `o` su uno dei suoi commit la richiude.

Il commit selezionato si apre in una scheda sotto la sua riga, incorniciata nel colore del suo ramo, con accanto le linee che proseguono. La scheda mostra:
- l'hash intero, l'autore e la data (tagliati con `…` se la riga è stretta);
- il titolo per intero, poi fino a 12 righe del resto del messaggio, seguite da `…` se ce ne sono altre;
- i file cambiati con le righe aggiunte e tolte, fino a 8 file, poi «… e altri N file»;
- i comandi.

Un clic su una riga la seleziona.

| Tasto | Cosa fa |
|---|---|
| `j` / `k` | Riga successiva / precedente (commit o gruppo ripiegato) |
| `o` | Apre il gruppo selezionato; sopra uno dei suoi commit lo richiude |
| `1`–`9` | Va all'ultimo commit del ramo con quel numero nel panorama |
| `h` | Torna al commit su cui sei |
| `p` | Passa al primo ramo o commit proposto nella scheda (chiede conferma); non c'è quando hai file non committati |
| `b` | Nuovo ramo sul commit selezionato: scrivi il nome e premi Invio |
| `y` | Copia l'hash intero |
| `c` | Chiede a Claude di spiegare il commit |
| `f` | Scarica da GitHub (chiede conferma) |
| `r` | Rilegge il repository |
| `m` | Legge altri 200 commit |
| `s` / `n` | Sì, esegui / Annulla, quando c'è una domanda aperta |

### Di che ramo è un commit

Git non registra a quale ramo appartiene un commit: lo ricostruisce la mod. Dalla cima di ogni ramo risale lungo i primi genitori finché trova un commit già assegnato, in quest'ordine:
1. il ramo principale (`main`, `master`, `develop` o `trunk`), prima locale poi su GitHub;
2. il ramo su cui sei;
3. gli altri rami locali;
4. i rami su GitHub.

Così un ramo prende solo i commit fatti dopo essere nato, e la storia sotto resta del ramo principale. I commit che nessuna cima raggiunge prendono il nome dal merge che li ha uniti: «Merge pull request #3 from utente/docs/convenzioni» dà `docs/convenzioni`, «Merge branch 'x'» dà `x`. Se il merge non nomina un ramo, il tratto si chiama «unito in abc1234». Restano «senza nome» solo i commit che nessun merge ha unito. Un nome già usato prende « (2)», « (3)» e così via.

## I comandi git

Ogni comando che cambia qualcosa mostra prima che cosa fa, in parole, e il comando esatto; parte solo con «Sì, esegui» (`s`). Dopo, il pannello dice com'è andata e rilegge il repository.

| Pulsante | Comando | Quando c'è |
|---|---|---|
| «⇄ passa a feature/x» | `git switch feature/x` | Per ogni ramo locale sul commit, tranne quello su cui sei |
| «⇄ passa a fix» | `git switch --create fix --track origin/fix` | Per un ramo che sta solo su GitHub: crea il ramo locale collegato e ci passa |
| «⇄ passa a questo commit» | `git switch --detach <hash>` | Su un commit senza rami: ci passa senza ramo (HEAD staccata) |
| «⑂ nuovo ramo qui» | `git branch <nome> <hash>` | Sempre; resti dove sei. Il nome scritto e confermato con Invio vale come conferma |
| «↓ scarica» | `git fetch --all` | Sempre; non tocca i tuoi file né i tuoi rami locali |

Con file modificati o nuovi non committati, la scheda non propone di cambiare ramo: chiede prima di committarli o di metterli da parte con `git stash`.

Se sei su una HEAD staccata, la conferma per cambiare ramo avverte che i commit fatti lì e non su un ramo resteranno solo nel reflog (`git reflog`).

Un comando alla volta: finché uno è in corso, «Sì, esegui» non ne lancia un altro.

Il nome di un nuovo ramo non può cominciare con `-`, contenere spazi o essere quello di un ramo che esiste già; poi `git check-ref-format --branch` controlla che git lo accetti.

Non ci sono push, pull, merge, rebase, reset né cancellazione di rami.

## Cosa fa da sola

- **A fine risposta di Claude** (non dei subagent), se il pannello è aperto, rilegge il repository: Claude può aver fatto un commit o cambiato ramo.

## Cosa legge e cosa manda

- Legge il repository con `git log --all --topo-order` (rami locali, rami remoti e tag, senza lo stash), `git rev-parse`, `git symbolic-ref`, `git for-each-ref`, `git rev-list --left-right --count @{upstream}...HEAD`, `git status --porcelain`, e per il commit selezionato `git show -s --format=%B` e `git show --numstat` (per un merge, i file rispetto al primo genitore).
- «Chiedi a Claude» manda nella conversazione solo l'hash corto e il percorso del repository, e chiede di spiegare il commit leggendolo con `git show`, senza commit, push o cambi di ramo. Il messaggio del commit non entra nella richiesta: è testo del repository, scritto da chiunque, e Claude lo legge come dato.
- Lancia git con `GIT_OPTIONAL_LOCKS=0`, così la lettura non blocca l'indice mentre Claude fa un commit, e con `GIT_TERMINAL_PROMPT=0`, così uno scaricamento che chiede la password fallisce subito invece di restare appeso.
- Non chiama modelli e non salva niente: tutto sta in memoria finché dura la sessione.
- Mostra il nome dell'autore di ogni commit, non la sua email.

## Requisiti

- `git` 2.31 o più recente (per `--diff-merges`).
- Per `↓ scarica`, l'accesso al remoto già configurato in git.

## Limiti

- Mostra un repository solo: quello della cartella della sessione.
- Il panorama mostra nove rami; gli altri sono comunque nella mappa.
- L'appartenenza dei commit ai rami è ricostruita (vedi sopra): con una storia piena di merge fatti a mano, o di rami cancellati, un tratto può finire sotto un nome diverso da quello che ricordi.
- Legge gli ultimi 200 commit; `m` ne aggiunge altri 200 alla volta. Una linea il cui commit di partenza è oltre il limite arriva fino in fondo, e nel panorama il suo ramo comincia con `●` invece che con `┗`.
- I rami del remoto `origin` sono mostrati senza `origin/`; quelli di altri remoti hanno il nome intero.
- Il grafo prende la larghezza che serve al giorno più affollato tra due intestazioni, e al massimo il 40% del pannello: con moltissimi rami aperti nello stesso giorno le linee più a destra sono tagliate e la riga finisce con `…`.
- Le linee accanto alla scheda hanno tante righe quante ne calcola la mod. Se una riga va a capo lo stesso (pannello molto stretto, caratteri larghi come emoji o ideogrammi nei titoli e nei percorsi), le linee finiscono una riga prima della scheda.
- Se git non riesce a leggere un commit, la scheda lo dice; `r` riprova.
- I caratteri di controllo nei titoli, negli autori, nei messaggi e nei percorsi sono mostrati come spazi.
- Il nome di un nuovo ramo si scrive solo dove il pannello ha un campo di testo (terminale e desktop).
- Ogni comando git ha 15 secondi, `git fetch` 2 minuti.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install git-tree@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install git-tree --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

Oggi i test sono 62.
