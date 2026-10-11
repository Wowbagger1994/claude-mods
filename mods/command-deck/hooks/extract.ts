/** Fence languages that hold commands for a terminal. */
const SHELL_LANGUAGES = new Set(['bash', 'sh', 'zsh', 'shell', 'console', 'terminal'])

/** Programs a line of a fence without a language may start with to count as a command. */
const KNOWN_COMMANDS = new Set([
  'cd', 'git', 'gh', 'npm', 'npx', 'bun', 'node', 'python3', 'pip', 'go', 'brew', 'claude', 'ssh', 'scp', 'rsync',
  'cp', 'mv', 'rm', 'ls', 'cat', 'mkdir', 'open', 'code', 'docker', 'colima', 'kubectl', 'make', 'curl', 'sips',
  'defaults', 'launchctl', 'export', 'source', 'sudo',
])

/** A block longer than this is code to read, not a command to paste. */
const MAX_BLOCK_LINES = 25
const PROMPT = '$ '

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g
const HEREDOC_START = /<<-?\s*['"]?([A-Za-z_]\w*)['"]?/
const ENV_ASSIGNMENT = /^[A-Za-z_]\w*=\S*$/

const isComment = (line: string) => line.trimStart().startsWith('#')

/** The lines without comment-only ones, a heredoc's body kept whole (its `#` may be code). */
const withoutComments = (lines: readonly string[]): string[] =>
  lines.reduce<{ kept: string[]; until: string | null }>(
    (acc, line) => {
      if (acc.until !== null) return { kept: [...acc.kept, line], until: line.trim() === acc.until ? null : acc.until }
      if (isComment(line)) return acc
      const heredoc = HEREDOC_START.exec(line)
      return { kept: [...acc.kept, line], until: heredoc?.[1] ?? null }
    },
    { kept: [], until: null },
  ).kept

/** A console transcript: the lines after `$ ` are the commands, the rest is output. */
const promptedLines = (lines: readonly string[]): string[] | null => {
  const prompted = lines.filter(line => line.startsWith(PROMPT))
  return prompted.length === 0 ? null : prompted.map(line => line.slice(PROMPT.length))
}

/** The program a line runs: its first word past `VAR=value` assignments. */
const programOf = (line: string): string => line.trim().split(/\s+/).find(word => !ENV_ASSIGNMENT.test(word)) ?? ''

const looksLikeCommand = (line: string): boolean => {
  const program = programOf(line)
  return KNOWN_COMMANDS.has(program) || program.startsWith('./') || program.startsWith('!')
}

/** The command a fence holds, or null when it holds none. */
const commandOf = (language: string, body: string): string | null => {
  const lines = body.replace(/\n$/, '').split('\n')
  if (lines.length > MAX_BLOCK_LINES) return null
  const lang = language.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const isShell = SHELL_LANGUAGES.has(lang)
  if (!isShell && lang !== '') return null

  const commands = withoutComments(promptedLines(lines) ?? lines).filter(line => line.trim() !== '')
  if (commands.length === 0) return null
  if (!isShell && !commands.every(looksLikeCommand)) return null
  return commands.join('\n')
}

/**
 * The terminal commands an answer holds: fences tagged as shell, and untagged
 * fences whose every line starts with a known program. Each text once.
 */
export const commandsIn = (answer: string): string[] => {
  const found = [...answer.matchAll(FENCE)].flatMap(m => {
    const command = commandOf(m[1] ?? '', m[2] ?? '')
    return command === null ? [] : [command]
  })
  return [...new Set(found)]
}

/** An `ssh` call: its options, host and remote command, from the text after `ssh`. */
type SshCall = { hasTty: boolean; remote: string }

/** ssh options that take a value: the word after them is that value, not the host. */
const SSH_VALUE_OPTIONS = new Set(['-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w'])
const SSH_CALL = /(?:^|[\s;&|(])ssh\s+([^\n]*)/g

const parseSsh = (rest: string): SshCall => {
  const words = rest.trim().split(/\s+/)
  let i = 0
  let hasTty = false
  while (i < words.length && words[i]!.startsWith('-')) {
    const option = words[i]!
    if (/^-[A-Za-z]*t/.test(option) && !SSH_VALUE_OPTIONS.has(option)) hasTty = true
    i += SSH_VALUE_OPTIONS.has(option) ? 2 : 1
  }
  // words[i] is the host; whatever follows is run on it.
  return { hasTty, remote: words.slice(i + 1).join(' ') }
}

const PLACEHOLDER = /(?<![<\w])<([A-Za-z_][\w-]*)>/g
const FILL_INS: { pattern: RegExp; warning: string }[] = [
  { pattern: /\b(YOUR|TUO|TUA)_[A-Z_]*/, warning: 'Valore da completare' },
  { pattern: /\bCHANGEME\b/i, warning: 'Valore da completare' },
  { pattern: /\bx{3,}\b/i, warning: 'Valore finto «xxx» da sostituire' },
  { pattern: /\bpath\/to\//, warning: 'Percorso d’esempio «path/to/» da sostituire' },
  { pattern: /(^|\s)(\.\.\.|…)(\s|$)/, warning: '«...» al posto di un argomento' },
]

export const SSH_WITHOUT_TTY = 'ssh senza -t: con un comando remoto usa ssh -t utente@host \'…\''
export const SSH_MORE_THAN_ONE = 'Più di un ssh: usa un solo ssh -t utente@host \'…\''
export const SSH_APPEND = 'Scrive con >> sul server: prima una guardia sulla macchina e sul file atteso'

/** What in a command breaks the person's rules: placeholders, unfinished values, ssh used otherwise than once with -t. */
export const lint = (command: string): string[] => {
  const placeholders = [...command.matchAll(PLACEHOLDER)].map(m => `Segnaposto da sostituire: <${m[1]}>`)
  const fillIns = FILL_INS.filter(f => f.pattern.test(command)).map(f => f.warning)
  const calls = [...command.matchAll(SSH_CALL)].map(m => parseSsh(m[1] ?? ''))
  const sshWarnings = [
    ...(calls.some(c => c.remote !== '' && !c.hasTty) ? [SSH_WITHOUT_TTY] : []),
    ...(calls.length > 1 ? [SSH_MORE_THAN_ONE] : []),
    ...(calls.some(c => c.remote.includes('>>')) ? [SSH_APPEND] : []),
  ]
  return [...new Set([...placeholders, ...fillIns, ...sshWarnings])]
}
