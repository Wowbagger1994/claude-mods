# command-deck

Un pannello «Da fare» con quello che resta da fare a te dopo le risposte di Claude, con i comandi pronti da copiare, così non si perdono nel testo della conversazione.

## Come si usa

`/command-deck` apre il pannello «Da fare». In alto le cose da fare aperte, ognuna con i suoi comandi; sotto, «Altri comandi delle risposte»; in fondo, i fatti.

| Tasto | Cosa fa |
|---|---|
| `1` … `9` | Copia il comando con quel numero («Copia 1», «Copia 2»…) |
| `f` | Mostra o nasconde l'elenco «Fatti (N)» |
| `x` | Svuota gli altri comandi delle risposte |

I pulsanti «Fatto» (chiude una cosa da fare) e «Riapri» (la riporta tra le aperte) si premono senza tasto.
Sotto un comando compaiono gli avvisi, con «⚠», se non rispetta le regole dell'autore per i comandi: `Segnaposto da sostituire: <host>`, «Valore da completare» (`YOUR_…`, `TUO_…`, `CHANGEME`), «xxx», `path/to/`, «...» al posto di un argomento, `ssh` senza `-t` con un comando remoto, più di un `ssh`, `>>` sul server.

Nella riga di stato: `☐ 3 da fare · /command-deck`, niente quando non c'è nulla.
Quando il pannello è chiuso, un avviso (toast) dice cosa è arrivato, ad esempio «2 cose da fare e 1 comando: /command-deck».

## Cosa fa da sola

- **A fine risposta di Claude** (non dei subagent):
  1. prende i comandi dai blocchi di codice della risposta: quelli marcati `bash`, `sh`, `zsh`, `shell`, `console` o `terminal`, e quelli senza linguaggio in cui ogni riga comincia con un programma noto (`git`, `npm`, `ssh`, `docker`…) o con `./` o `!`. Se un blocco ha righe che cominciano con `$ `, prende solo quelle, senza il `$ `; righe vuote e commenti `#` non contano.
  2. fa a Claude una domanda tecnica sulla conversazione, per tenere il pannello allineato al lavoro com'è adesso. Gli mostra le cose da fare aperte per intero (titolo, dettaglio, comandi), i comandi sciolti e la sua ultima risposta, che la domanda altrimenti non vedrebbe. Claude:
     - chiude («chiuso da Claude») le cose fatte da te o da lui, quelle superate o non più pertinenti, e i doppioni;
     - riscrive quelle aperte quando i fatti sono cambiati (titolo, dettaglio, comandi nuovi);
     - aggiunge quelle nuove che restano da fare a te (prove, comandi, decisioni, verifiche);
     - toglie i comandi sciolti che non servono più: già eseguiti, sostituiti da una versione nuova, legati a lavoro finito o ripresi in una cosa da fare. Quelli dell'ultima risposta restano almeno fino alla risposta dopo.
- **Quando una cosa da fare si chiude** (con «Fatto» o da Claude) **o Claude ne cambia i comandi**: i comandi che non stanno più sotto nessuna cosa aperta lasciano il pannello, invece di finire tra gli altri comandi. «Riapri» riporta una cosa chiusa con i suoi comandi.
- **Quando la modalità auto nega un comando Bash**: il comando diventa una cosa da fare («Esegui tu: …»), il pannello si apre e compare «Comando negato: copialo da /command-deck ed eseguilo tu». Un «No» premuto da te non conta.

## Cosa legge e cosa manda

- La domanda a fine risposta usa `$.model.fork`: lo stesso modello della sessione rilegge la conversazione fino all'ultima richiesta, con gli strumenti negati, più la domanda. La domanda contiene l'ultima risposta di Claude, l'elenco aperto e i comandi sciolti: tutte cose già nella conversazione, quindi non escono dati nuovi. Ogni risposta costa una richiesta in più.
- Questa mod non oscura nulla: legge la conversazione così com'è.
- Copia negli appunti del terminale solo quando premi «Copia».
- Non legge file e non lancia processi.
- Nello stato della sessione tiene i comandi (`commands`), le cose da fare (`todos`) e se i fatti sono in vista (`isDoneShown`).

## Requisiti

Nessuno strumento esterno.

## Limiti

- Tiene al massimo 30 comandi, 30 cose da fare aperte (le più vecchie escono) e 20 chiuse.
- Per ogni risposta accetta al massimo 8 cose nuove, ognuna con al massimo 5 comandi; titolo fino a 120 caratteri, dettaglio fino a 400, comando fino a 2000.
- Un blocco di codice più lungo di 25 righe non viene preso come comando.
- Solo i primi 9 comandi hanno un tasto.
- Se la domanda a Claude fallisce o la risposta non è JSON valido, l'elenco resta com'è.
- Una cosa nuova con lo stesso titolo di una già aperta (a parte maiuscole e spazi) non viene aggiunta. I doppioni scritti in altro modo li chiude Claude, a giudizio suo.
- Della sua ultima risposta, Claude rilegge al massimo gli ultimi 8000 caratteri; dei comandi, i primi 300.
- Chiudere, riscrivere e togliere dipendono dal giudizio del modello: se sbaglia, «Riapri» riporta una cosa chiusa, ma un comando tolto non torna.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install command-deck@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install command-deck --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

Oggi i test sono 49.
