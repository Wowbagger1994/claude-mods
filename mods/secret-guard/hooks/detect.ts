/**
 * Finds secrets by their value, wherever they appear, and blots them out:
 * known token shapes first, then .env-style assignments, then long random
 * strings. Pure: nothing here touches the session.
 */

/** One secret found: its kind and the label shown in its place (a public prefix at most). */
export type Finding = { kind: string; label: string }
export type Masked = { text: string; found: Finding[] }

export const MASK_OPEN = '[segreto oscurato: '
const MASK_CLOSE = ']'

type Rule = { kind: string; pattern: RegExp; label: (match: string) => string }

const NOT_AFTER_WORD = '(?<![A-Za-z0-9])'

/** Token shapes with a known prefix, most specific first. */
const RULES: readonly Rule[] = [
  {
    kind: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    label: () => 'chiave privata',
  },
  {
    kind: 'jwt',
    pattern: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    label: () => 'token JWT',
  },
  { kind: 'google-refresh', pattern: new RegExp(`${NOT_AFTER_WORD}1//[A-Za-z0-9_-]{20,}`, 'g'), label: () => 'token di aggiornamento Google 1//' },
  { kind: 'google-access', pattern: /ya29\.[A-Za-z0-9_-]{20,}/g, label: () => 'token Google ya29.' },
  { kind: 'google-api', pattern: /AIza[0-9A-Za-z_-]{35}/g, label: () => 'chiave API Google AIza' },
  {
    kind: 'user-token',
    pattern: new RegExp(`${NOT_AFTER_WORD}(?:ntok|nins|ngat)_[A-Za-z0-9_-]{8,}`, 'g'),
    label: m => `token ${m.slice(0, 5)}`,
  },
  { kind: 'anthropic', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: () => 'chiave Anthropic sk-ant-' },
  { kind: 'openai', pattern: new RegExp(`${NOT_AFTER_WORD}sk-(?:proj-)?[A-Za-z0-9_-]{20,}`, 'g'), label: () => 'chiave OpenAI sk-' },
  { kind: 'github', pattern: new RegExp(`${NOT_AFTER_WORD}gh[pousr]_[A-Za-z0-9]{30,}`, 'g'), label: m => `token GitHub ${m.slice(0, 4)}` },
  { kind: 'github', pattern: /github_pat_[A-Za-z0-9_]{20,}/g, label: () => 'token GitHub github_pat_' },
  { kind: 'gitlab', pattern: /glpat-[A-Za-z0-9_-]{20,}/g, label: () => 'token GitLab glpat-' },
  { kind: 'slack', pattern: /xox[abposr]-[A-Za-z0-9-]{10,}/g, label: m => `token Slack ${m.slice(0, 5)}` },
  { kind: 'aws', pattern: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/g, label: () => 'chiave AWS AKIA' },
  { kind: 'stripe', pattern: new RegExp(`${NOT_AFTER_WORD}[sr]k_(?:live|test)_[A-Za-z0-9]{10,}`, 'g'), label: m => `chiave Stripe ${m.slice(0, 8)}` },
  { kind: 'npm', pattern: new RegExp(`${NOT_AFTER_WORD}npm_[A-Za-z0-9]{30,}`, 'g'), label: () => 'token npm npm_' },
]

const maskOf = (label: string) => `${MASK_OPEN}${label}${MASK_CLOSE}`

/** True when the text holds a blotted-out secret: what a write must not put back in a file. */
export const hasMask = (text: string): boolean => text.includes(MASK_OPEN)

const applyRule = (text: string, rule: Rule): Masked => {
  const found: Finding[] = []
  const out = text.replace(rule.pattern, match => {
    const label = rule.label(match)
    found.push({ kind: rule.kind, label })
    return maskOf(label)
  })
  return { text: out, found }
}

// .env-style: NAME=value where NAME says it is a secret; only the value is blotted out.
const ENV_LINE =
  /^(\s*(?:export\s+)?[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|CREDENTIALS?)[A-Z0-9_]*\s*=\s*)(.+)$/gm
const MIN_ENV_VALUE = 8
const PLACEHOLDER = /^(?:changeme|change-me|xxx+|\*{3,}|<.*>|your[-_].*|example.*|placeholder.*|todo|none|null|undefined|true|false)$/i

const isRealValue = (raw: string): boolean => {
  const value = raw.trim().replace(/^['"]|['"]$/g, '')
  if (value.length < MIN_ENV_VALUE || hasMask(value)) return false
  if (value.startsWith('$') || PLACEHOLDER.test(value)) return false
  return true
}

const maskEnv = (text: string): Masked => {
  const found: Finding[] = []
  const out = text.replace(ENV_LINE, (line, head: string, value: string) => {
    if (!isRealValue(value)) return line
    const name = head.replace(/^\s*(?:export\s+)?/, '').replace(/\s*=\s*$/, '')
    const label = `valore di ${name}`
    found.push({ kind: 'env', label })
    return `${head}${maskOf(label)}`
  })
  return { text: out, found }
}

/** A candidate: base64-ish characters, '=' only as trailing padding, so `NAME=value` splits at the sign. */
const RANDOM_TOKEN = /[A-Za-z0-9_\-+/.]{32,}={0,2}/g
const MIN_ENTROPY = 4.3
const MIN_CLASSES = 3
// A lockfile's integrity hash: the prefix may sit just before the token or, since '-' is a token character, open it.
const INTEGRITY_PREFIX = /sha(?:1|256|384|512)-$/
const INTEGRITY_TOKEN = /^sha(?:1|256|384|512)-/
const HEX = /^[0-9a-fA-F]+$/
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const WORDY_SEGMENT = /^[A-Za-z][a-z0-9]*(?:[._-][A-Za-z0-9]+)*$/
/** A file name's extension: base64 and random keys have no dots, a path's last segment often does. */
const FILE_EXTENSION = /\.[a-z][a-z0-9]{0,4}$/

/** Bits per character of the string's own symbol frequencies. */
export const entropy = (s: string): number => {
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  return [...counts.values()].reduce((sum, n) => {
    const p = n / s.length
    return sum - p * Math.log2(p)
  }, 0)
}

const classesOf = (s: string): number =>
  [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(s)).length

/** A path: rooted, or slash-separated with mostly word-like segments. */
const isPath = (s: string): boolean => {
  if (/^(?:\/|\.\.?\/|~\/)/.test(s)) return true
  if (!s.includes('/')) return false
  const segments = s.split('/').filter(Boolean)
  if (segments.some(seg => FILE_EXTENSION.test(seg))) return true
  return segments.filter(seg => WORDY_SEGMENT.test(seg)).length * 2 >= segments.length
}

/** A long identifier: camelCase or snake words, mostly of 3 letters or more. */
const isIdentifier = (s: string): boolean => {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) return false
  const words = s.split(/_|(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z0-9])/).filter(Boolean)
  return words.filter(w => w.length >= 3).length >= words.length * 0.7
}

/** A long string that looks random enough to be a credential. */
export const isRandomSecret = (token: string, before: string): boolean =>
  !HEX.test(token.replace(/-/g, '')) &&
  !INTEGRITY_PREFIX.test(before) &&
  !INTEGRITY_TOKEN.test(token) &&
  !UUID_LIKE.test(token) &&
  !isPath(token) &&
  !isIdentifier(token) &&
  classesOf(token) >= MIN_CLASSES &&
  entropy(token) >= MIN_ENTROPY

const maskRandom = (text: string): Masked => {
  const found: Finding[] = []
  const out = text.replace(RANDOM_TOKEN, (token: string, at: number) => {
    if (!isRandomSecret(token, text.slice(Math.max(0, at - 8), at))) return token
    found.push({ kind: 'random', label: 'stringa casuale' })
    return maskOf('stringa casuale')
  })
  return { text: out, found }
}

/** The text with every secret blotted out, and what was found, in order of the passes. */
export const maskText = (text: string): Masked => {
  const steps = [...RULES.map(rule => (t: string) => applyRule(t, rule)), maskEnv, maskRandom]
  return steps.reduce<Masked>(
    (acc, step) => {
      const next = step(acc.text)
      return { text: next.text, found: [...acc.found, ...next.found] }
    },
    { text, found: [] },
  )
}

/** Keys whose strings are data, not text a secret hides in: images, paths, ids, types. */
const SKIPPED_KEYS = new Set(['base64', 'type', 'filePath', 'rawOutputPath', 'backgroundTaskId', 'mimeType', 'media_type'])

export type MaskedValue = { value: unknown; found: Finding[] }

/** A copy of any JSON-like value with every string masked; the value itself is never changed. */
export const maskDeep = (value: unknown): MaskedValue => {
  if (typeof value === 'string') {
    const m = maskText(value)
    return { value: m.text, found: m.found }
  }
  if (Array.isArray(value)) {
    const parts = value.map(maskDeep)
    return { value: parts.map(p => p.value), found: parts.flatMap(p => p.found) }
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([key, v]): [string, MaskedValue] =>
      SKIPPED_KEYS.has(key) ? [key, { value: v, found: [] }] : [key, maskDeep(v)],
    )
    return {
      value: Object.fromEntries(entries.map(([k, m]) => [k, m.value])),
      found: entries.flatMap(([, m]) => m.found),
    }
  }
  return { value, found: [] }
}

/** «token Google ya29., stringa casuale ×2»: what was found, each label once with its count. */
export const describe = (found: readonly Finding[]): string => {
  const counts = new Map<string, number>()
  for (const f of found) counts.set(f.label, (counts.get(f.label) ?? 0) + 1)
  return [...counts.entries()].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(', ')
}
