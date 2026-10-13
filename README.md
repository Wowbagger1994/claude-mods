# claude-mods

Mod per [Claude Code](https://claude.com/claude-code): pannelli, comandi e controlli che si aggiungono all'interfaccia e al comportamento di Claude. Ogni mod sta nella sua cartella sotto `mods/`, con il suo README.

| Mod | Comando | Cosa fa |
|---|---|---|
| [secret-guard](mods/secret-guard/README.md) | `/segreti` | Oscura token, chiavi e password nei risultati degli strumenti prima che Claude li legga |
| [command-deck](mods/command-deck/README.md) | `/command-deck` | Quello che ti resta da fare dopo le risposte di Claude, con i comandi da copiare |
| [checks](mods/checks/README.md) | `/checks` | I test veloci a fine risposta e la CI su GitHub, con «Chiedi a Claude» sugli errori |
| [work-diary](mods/work-diary/README.md) | `/diary` | Calendario del mese con le ore di lavoro e i resoconti di giorno e settimana |
| [diff-checker](mods/diff-checker/README.md) | `/diff-checker` | Un tab per ogni file modificato da Claude, con il diff |
| [git-tree](mods/git-tree/README.md) | `/git-tree` | La storia del repository come mappa della metro: panorama dei rami nel tempo, commit raggruppati, cambio di ramo con conferma |
| [drawio-viewer](mods/drawio-viewer/README.md) | `/drawio` | Anteprima dei diagrammi draw.io nel pannello |
| [arcade](mods/arcade/README.md) | `/play` | Undici giochi per le attese, con i record |

Le mod sono scritte e provate con Claude Code 2.1.296 su macOS. drawio-viewer disegna il PNG solo su macOS, altrove mostra il disegno a caratteri; le altre usano solo strumenti comuni (`git`, `python3`, `gh`), come dice il README di ognuna.

## Installazione

Da un terminale:

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
for m in secret-guard command-deck checks work-diary diff-checker git-tree drawio-viewer arcade; do claude plugin install "$m@enrik-mods"; done
```

Per una mod sola, dal prompt di Claude Code:

```
/plugin install checks --marketplace Wowbagger1994/claude-mods
```

Le mod installate valgono in ogni sessione nuova. Per spegnerne una: `/plugin`, oppure `claude plugin disable <mod>@enrik-mods`.

## Aggiornamento

```sh
claude plugin marketplace update enrik-mods
claude plugin update checks@enrik-mods
```

Il secondo comando va ripetuto per ogni mod installata, poi si riavvia la sessione.

## Sviluppo

Con il repository clonato, si può installare dalla cartella invece che da GitHub: le modifiche si leggono dalla cartella stessa, senza nuove versioni.

```sh
claude plugin marketplace add ~/Repos/claude-mods
claude plugin install checks@enrik-mods
```

Dopo una modifica basta `/reload-plugins` nella sessione. Dentro `mods/<mod>`: `claude plugin validate .` controlla manifesto e codice, `claude plugin test .` lancia i test. I tipi dell'API (`.claude-plugin/types/`) li scrive Claude Code quando carica la mod, e non sono nel repository.

## Licenza

[MIT](LICENSE)
