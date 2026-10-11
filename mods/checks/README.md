# checks

Un pannello «Verifiche» con i test veloci, lanciati a fine risposta nei repository che Claude ha modificato, e lo stato della CI su GitHub, così sai subito se una modifica ha rotto qualcosa.

## Come si usa

`/checks` apre il pannello. Per ogni repository: nome e ramo, «Test locali» con da dove vengono e l'esito di ogni comando, poi «CI» con la PR (o il commit) e i suoi controlli. Sotto un test fallito compaiono le ultime 8 righe del suo output.

| Tasto | Cosa fa |
|---|---|
| `e` | «Esegui»: lancia di nuovo i test veloci del primo repository |
| `g` | Aggiorna la CI di tutti i repository |
| `c` | «Chiedi a Claude» sul primo errore mostrato |

Senza tasto: «Esegui» degli altri repository, «Chiedi a Claude» sugli altri errori, «apri» porta al controllo su GitHub.

Riga di stato: `✓ test 4/4 · CI ✓ 2/2 · /checks`, oppure `✗ test 1/4 · CI ⏳ 1/3 · /checks`.
Avvisi (toast), solo a pannello chiuso: «✗ shop: unit — /checks», «✓ shop: i test sono di nuovo verdi», «✗ CI di shop: lint — /checks, poi c per chiedere a Claude», «✓ CI di shop: tutto verde».

«Chiedi a Claude» manda nella conversazione un messaggio con il comando, l'esito e la parte finale dell'output (per la CI, del log), e chiede la causa e una correzione, senza commit né push.

## Cosa fa da sola

- **All'avvio della sessione**: se la cartella della sessione è in un repository git, lo aggiunge e legge la sua CI.
- **Dopo ogni Edit o Write**: il repository del file entra nel pannello e viene segnato come modificato.
- **A fine risposta di Claude** (non dei subagent): lancia i test dei repository modificati, uno dopo l'altro, e rilegge la CI se l'ultima lettura ha più di un minuto.
- **Dopo un `git push` lanciato da Bash**: dopo 15 secondi rilegge la CI di tutti i repository del pannello. Ogni volta che la CI ha controlli in corso, la rilegge dopo 30 secondi.

Quali test lancia, in quest'ordine:

1. quelli scritti in `.claude/checks.json` del repository: `{"checks": [{"label": "unit", "command": "…"}]}`;
2. altrimenti i passi veloci del primo file in `.github/workflows/` (in ordine alfabetico) che ne ha: righe `run:` di una riga che cominciano con `python3`, `python`, `pytest`, `go`, `npm`, `npx`, `bun`, `node`, `cargo`, `make`, `ruff` o `mypy`. Salta i workflow con deploy, release o publish nel nome, e i passi con parole come docker, install, ssh, curl, build, push, secrets. `python` diventa `python3`;
3. altrimenti il test solito del progetto: `go test ./...` con `go.mod`; lo script `test` di `package.json` (`bun run test` con un lockfile di bun, se no `npm test --silent`); `python3 -m pytest -q` con `pytest.ini` o `conftest.py`; `cargo test --quiet` con `Cargo.toml`.

## Cosa legge e cosa manda

- Legge `.claude/checks.json`, i file in `.github/workflows/`, `package.json` e l'elenco dei file in cima al repository.
- Esegue i test con `/bin/bash -c <comando>` dalla cima del repository: sono comandi scritti nei file del repository, lanciati sul tuo computer senza chiedere.
- Lancia `git -C <cartella> rev-parse --show-toplevel`, `branch --show-current` e `rev-parse HEAD`.
- Per la CI lancia `gh pr view --json number,url,title`, `gh pr checks <n> --json name,bucket,link,workflow`, senza PR `gh run list --commit <sha> --json …`, e per «Chiedi a Claude» `gh run view <id> --log-failed`.
- Non chiama modelli: il testo arriva a Claude solo quando premi «Chiedi a Claude». Prima oscura i token con prefisso noto (`ghp_`, `gho_`, `ghs_`, `github_pat_`, `ya29.`, `1//`, `ntok_`, `nins_`, `ngat_`, `sk-`, `xoxb-`…, `AKIA`) e ogni sequenza di 32 o più lettere, cifre e `_-+=` che mescola lettere e cifre. I percorsi restano leggibili: la `/` interrompe la sequenza. Anche un hash lungo diventa `[oscurato]`.
- Non usa lo stato della sessione: tutto sta in memoria e sparisce quando la sessione finisce.

## Requisiti

- `git`.
- `gh` con l'accesso fatto (`gh auth login`), per la CI; senza, al posto della CI compare una nota (ad esempio «esecuzioni della CI illeggibili»).
- `/bin/bash` e gli strumenti dei test del progetto.

## Limiti

- Ogni test ha 5 minuti; `git` 15 secondi; `gh` 30 secondi.
- Tiene le ultime 40 righe dell'output di un test e manda a Claude le ultime 120 del log della CI.
- Un `run: |` su più righe resta alla CI.
- Solo Edit e Write segnano un repository come modificato; i file cambiati da Bash o MultiEdit no.
- Un `.claude/checks.json` con una voce malformata viene ignorato per intero.
- Il tasto `c` vale solo per il primo errore mostrato: repository per repository, prima i test locali e poi la CI.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install checks@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install checks --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

Oggi i test sono 22.
