# secret-guard

Oscura token, chiavi e password nei risultati degli strumenti prima che Claude li legga, così un segreto stampato da un comando non finisce nella conversazione.

## Come si usa

Non serve fare nulla: lavora da sola. Il comando `/segreti` dice quanti segreti ha oscurato nella sessione, per tipo:

```text
secret-guard ha oscurato in questa sessione:
- token Google ya29.: 2
- stringa casuale: 1
```

Al posto del valore Claude legge, tra parentesi quadre, «segreto oscurato:» seguito dal tipo, ad esempio «chiave AWS AKIA».
Ogni volta compare un avviso (toast), con un lucchetto davanti: «Oscurato 1 segreto (token Google ya29.) nel risultato di Bash».

## Cosa fa da sola

- **Su ogni chiamata a uno strumento**, dopo che è stata eseguita: cerca i segreti in tutte le stringhe del risultato e li sostituisce. Se lo strumento finisce in errore, oscura anche il testo dell'errore.
- **Prima di Edit, Write, MultiEdit e NotebookEdit**: se il testo da scrivere contiene un segreto oscurato, la scrittura viene rifiutata. Altrimenti Claude scriverebbe nel file il segnaposto al posto del valore vero. Claude riceve l'indicazione di fare una modifica più piccola che lasci com'è la parte con il segreto, oppure di chiedere a te di inserire il valore.
- **Sui tuoi messaggi**: non cambia nulla, avvisa soltanto: «⚠ Il messaggio contiene 1 segreto (…): Claude lo leggerà.»

Cosa riconosce, in quest'ordine:

| Tipo | Come lo riconosce |
|---|---|
| Forme note | chiave privata PEM, JWT, token Google (`1//`, `ya29.`, `AIza`), `ntok_`/`nins_`/`ngat_`, Anthropic `sk-ant-`, OpenAI `sk-`, GitHub (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), GitLab `glpat-`, Slack `xox…-`, AWS `AKIA`, Stripe `sk_live_`, `rk_test_`…, npm `npm_` |
| Righe in stile `.env` | `NOME=valore` dove il nome contiene PASSWORD, PASSWD, SECRET, TOKEN, API_KEY, APIKEY, PRIVATE_KEY o CREDENTIAL(S); oscura solo il valore |
| Stringhe casuali | 32 caratteri o più, con almeno tre classi di caratteri e un'entropia di almeno 4,3 bit per carattere |

## Cosa legge e cosa manda

- Legge solo i risultati degli strumenti e i tuoi messaggi, in memoria. Non apre file, non lancia processi, non chiama modelli.
- Nello stato della sessione tiene solo il conteggio per tipo (`counts`), mai un valore. Per le righe `.env` il tipo contiene il nome della variabile (ad esempio «valore di DB_PASSWORD»).
- Nella conversazione resta il risultato oscurato al posto di quello vero.

## Requisiti

Nessuno strumento esterno.

## Limiti

- Riconosce i segreti dalla forma del valore: una password corta e senza un nome che la indichi (`PASSWORD=…`) passa.
- Una riga `.env` non viene oscurata se il valore ha meno di 8 caratteri, se comincia con `$` o se è un segnaposto (`changeme`, `xxx`, `<…>`, `your_…`, `example…`, `todo`, `none`, `true`…).
- Non sono considerate casuali le stringhe esadecimali, gli UUID, gli hash `sha…-` dei lockfile, i percorsi e gli identificatori lunghi in camelCase o snake_case.
- Non guarda i campi `base64`, `type`, `filePath`, `rawOutputPath`, `backgroundTaskId`, `mimeType` e `media_type` dei risultati (immagini, percorsi, identificativi).
- Non oscura il testo che Claude scrive né quello che passa agli strumenti: solo quello che riceve.
- Blocca solo le scritture fatte con Edit, Write, MultiEdit e NotebookEdit; un segnaposto scritto in un file da Bash non viene fermato.
- Un testo che contiene alla lettera il segnaposto (anche solo per documentarlo) non si può scrivere con quegli strumenti.
- Se il controllo stesso va in errore o supera il tempo concesso, il risultato passa così com'è, senza oscuramento.

## Installazione

```sh
claude plugin marketplace add Wowbagger1994/claude-mods
claude plugin install secret-guard@enrik-mods
```

Oppure, dal prompt di Claude Code: `/plugin install secret-guard --marketplace Wowbagger1994/claude-mods`.

## Sviluppo

Dalla cartella della mod:

```sh
claude plugin validate .
claude plugin test .
```

Oggi i test sono 32.
