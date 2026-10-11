/** Words kept for the typing game: enough for many rounds, small enough to hand the board. */
export const MAX_WORDS = 200
const MIN_LENGTH = 4
const MAX_LENGTH = 14

/** Names in a piece of code: identifiers of 4 to 14 letters, constants in capitals left out (hard to type). */
export const wordsFrom = (code: string): string[] => {
  const found = code.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []
  const fit = found.filter(w => w.length >= MIN_LENGTH && w.length <= MAX_LENGTH && w !== w.toUpperCase())
  return [...new Set(fit)]
}

/** Files whose words could be secrets (`.env`, keys, credentials): never shown on the board. */
const SECRET_FILE = /(^|\/)(\.env[^/]*|[^/]*(secret|credential|password|token)[^/]*|[^/]*\.(pem|key|p12|pfx))$/i

export const isSecretFile = (path: string): boolean => SECRET_FILE.test(path)

/** The pool with the newest words first, each once, at most MAX_WORDS. */
export const addWords = (pool: readonly string[], fresh: readonly string[]): string[] =>
  [...new Set([...fresh, ...pool])].slice(0, MAX_WORDS)
