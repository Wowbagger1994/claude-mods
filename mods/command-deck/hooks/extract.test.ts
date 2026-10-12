import { describe, expect, test } from 'claude-code/testing'

import type { Todo } from '../types'
import { addCommands, dropCommands, MAX_COMMANDS, newTexts, toCommands, withoutSettled } from './deck'
import { commandsIn, lint, SSH_APPEND, SSH_MORE_THAN_ONE, SSH_WITHOUT_TTY } from './extract'

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```'

describe('commandsIn', () => {
  test('takes shell fences whole, whatever their language tag', () => {
    const answer = ['Esegui:', fence('bash', 'cd /tmp && ls'), 'poi', fence('zsh', 'brew install jq'), fence('sh', 'echo hi')].join('\n')

    expect(commandsIn(answer)).toEqual(['cd /tmp && ls', 'brew install jq', 'echo hi'])
  })

  test('takes an untagged fence only when every line starts with a known program', () => {
    const commands = fence('', 'git status\nFOO=1 npm test\n./run.sh\n! echo "kind=$X"')
    const prose = fence('', 'Diagramma\n  ├── cart.js')
    const mixed = fence('', 'git status\nthen think about it')

    expect(commandsIn(commands)).toEqual(['git status\nFOO=1 npm test\n./run.sh\n! echo "kind=$X"'])
    expect(commandsIn(prose)).toEqual([])
    expect(commandsIn(mixed)).toEqual([])
  })

  test('leaves out code in other languages, blocks over 25 lines and comment-only lines', () => {
    const long = fence('bash', Array.from({ length: 26 }, (_, i) => `echo ${i}`).join('\n'))
    const commented = fence('bash', '# prima il backup\ncp a b\n  # poi\nmv b c')

    expect(commandsIn(fence('ts', 'const a = 1'))).toEqual([])
    // A fence tagged with another language is shown as that, even when it reads like a command.
    expect(commandsIn(fence('text', 'npm test'))).toEqual([])
    expect(commandsIn(long)).toEqual([])
    expect(commandsIn(commented)).toEqual(['cp a b\nmv b c'])
  })

  test('keeps a heredoc body whole, `#` lines included', () => {
    const heredoc = fence('bash', "python3 - <<'EOF'\n# not a shell comment\nprint(1)\nEOF\n# a shell comment")

    expect(commandsIn(heredoc)).toEqual(["python3 - <<'EOF'\n# not a shell comment\nprint(1)\nEOF"])
  })

  test('in a console transcript keeps the lines after `$ `, without it, and drops the output', () => {
    const transcript = fence('console', '$ git status\nOn branch main\n$ ls\nREADME.md')

    expect(commandsIn(transcript)).toEqual(['git status\nls'])
  })

  test('gives each command once and nothing for an answer with none', () => {
    expect(commandsIn([fence('bash', 'ls'), fence('sh', 'ls')].join('\n'))).toEqual(['ls'])
    expect(commandsIn('Nessun comando qui.')).toEqual([])
  })
})

describe('lint', () => {
  test('flags placeholders, but not heredocs or redirections', () => {
    expect(lint('ssh -t <utente>@<host> ls')).toEqual(['Segnaposto da sostituire: <utente>', 'Segnaposto da sostituire: <host>'])
    expect(lint("cat <<EOF > a\nx\nEOF")).toEqual([])
    expect(lint("cat <<EOF>notes.txt\nx\nEOF")).toEqual([])
    expect(lint('sort < input.txt > out.txt')).toEqual([])
  })

  test('flags values left to fill in', () => {
    expect(lint('export KEY=YOUR_API_KEY')).toEqual(['Valore da completare'])
    expect(lint('export KEY=CHANGEME')).toEqual(['Valore da completare'])
    expect(lint('curl -H "x: xxx" host')).toEqual(['Valore finto «xxx» da sostituire'])
    expect(lint('cp path/to/file .')).toEqual(['Percorso d’esempio «path/to/» da sostituire'])
    expect(lint('npm install ...')).toEqual(['«...» al posto di un argomento'])
    expect(lint('ls ../dir')).toEqual([])
  })

  test('wants one ssh -t for a remote command', () => {
    expect(lint("ssh -t enrik@host 'ls'")).toEqual([])
    expect(lint('ssh enrik@host')).toEqual([])
    expect(lint("ssh enrik@host 'ls'")).toEqual([SSH_WITHOUT_TTY])
    expect(lint("ssh -i key -t enrik@host 'ls'")).toEqual([])
    expect(lint("ssh -p 22 enrik@host 'ls'")).toEqual([SSH_WITHOUT_TTY])
    expect(lint("ssh -t a@h 'ls'\nssh -t a@h 'pwd'")).toEqual([SSH_MORE_THAN_ONE])
    expect(lint('ssh-add --apple-use-keychain')).toEqual([])
    expect(lint("ssh-add --apple-use-keychain && ssh -t a@h 'ls'")).toEqual([])
  })

  test('flags >> on the server, not >> on this machine', () => {
    expect(lint("ssh -t a@h 'echo x >> /etc/conf'")).toEqual([SSH_APPEND])
    expect(lint('echo x >> notes.txt')).toEqual([])
  })
})

describe('deck', () => {
  test('puts new commands on top, moves a repeated one up once, and keeps at most MAX_COMMANDS', () => {
    const old = toCommands(Array.from({ length: MAX_COMMANDS }, (_, i) => `echo ${i}`), 'answer', 1)
    const fresh = toCommands(['ls', 'echo 5'], 'denied', 2)
    const deck = addCommands(old, fresh)

    expect(deck.slice(0, 3).map(c => c.text)).toEqual(['ls', 'echo 5', 'echo 0'])
    expect(deck).toHaveLength(MAX_COMMANDS)
    expect(deck.filter(c => c.text === 'echo 5')).toHaveLength(1)
    expect(newTexts(old, fresh)).toEqual(['ls'])
  })

  test('drops the commands Claude names, by id', () => {
    expect(dropCommands(toCommands(['ls', 'pwd'], 'answer', 4), ['4-0']).map(c => c.text)).toEqual(['pwd'])
  })

  test('commands that leave the open to-dos, closed or rewritten away, leave the deck; one still open, or settled before, stays', () => {
    const item = (id: string, texts: string[], isClosed: boolean): Todo => ({
      id, title: id, detail: '', commands: texts.map(text => ({ text, warnings: [] })), at: 1, ...(isClosed ? { closed: { by: 'you' as const, at: 2 } } : {}),
    })
    const deck = toCommands(['git push', 'make test', 'ls', 'pwd', 'npm ci'], 'answer', 5)
    const before = [item('a', ['git push', 'make test'], false), item('b', ['make test'], false), item('old', ['ls'], true), item('c', ['npm ci'], false)]
    const after = [item('a', ['git push', 'make test'], true), item('b', ['make test'], false), item('old', ['ls'], true), item('c', ['npm install'], false)]

    expect(withoutSettled(deck, before, after).map(c => c.text)).toEqual(['make test', 'ls', 'pwd'])
  })

  test('checks each command against the rules as it is added', () => {
    expect(toCommands(["ssh a@h 'ls'"], 'answer', 3)[0]).toMatchObject({ id: '3-0', source: 'answer', warnings: [SSH_WITHOUT_TTY], at: 3 })
  })
})
