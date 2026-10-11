import type { Bucket, CiCheck } from '../types'

const BUCKETS = new Set<Bucket>(['pass', 'fail', 'pending', 'skipping', 'cancel'])
const RUN_ID = /\/actions\/runs\/(\d+)/

const parseArray = (text: string): Record<string, unknown>[] | null => {
  try {
    const raw = JSON.parse(text) as unknown
    return Array.isArray(raw) ? raw.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : null
  } catch {
    return null
  }
}
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** `gh pr checks --json name,bucket,link,workflow`. */
export const parsePrChecks = (text: string): CiCheck[] | null =>
  parseArray(text)?.map(c => ({
    name: str(c.name),
    workflow: str(c.workflow),
    bucket: BUCKETS.has(c.bucket as Bucket) ? (c.bucket as Bucket) : 'pending',
    link: str(c.link),
  })) ?? null

/** A workflow run's status and conclusion as a check's bucket. */
export const bucketOf = (status: string, conclusion: string): Bucket => {
  if (status !== 'completed') return 'pending'
  if (conclusion === 'success') return 'pass'
  if (conclusion === 'skipped' || conclusion === 'neutral') return 'skipping'
  if (conclusion === 'cancelled') return 'cancel'
  return 'fail'
}

/** `gh run list --commit <sha> --json name,status,conclusion,url,workflowName`: the runs of a commit with no PR. */
export const parseRuns = (text: string): CiCheck[] | null =>
  parseArray(text)?.map(r => ({
    name: str(r.name),
    workflow: str(r.workflowName),
    bucket: bucketOf(str(r.status), str(r.conclusion)),
    link: str(r.url),
  })) ?? null

export type Tally = { total: number; passed: number; failed: number; pending: number }

export const tally = (checks: readonly CiCheck[]): Tally => ({
  total: checks.filter(c => c.bucket !== 'skipping').length,
  passed: checks.filter(c => c.bucket === 'pass').length,
  failed: checks.filter(c => c.bucket === 'fail' || c.bucket === 'cancel').length,
  pending: checks.filter(c => c.bucket === 'pending').length,
})

export const runIdOf = (link: string): string | null => RUN_ID.exec(link)?.[1] ?? null

/** What to tell when new checks arrive: the failures not told yet, and whether the whole lot just ended. */
export const news = (
  before: readonly CiCheck[] | null,
  after: readonly CiCheck[],
  told: ReadonlySet<string>,
  sha: string,
): { failed: CiCheck[]; isDone: boolean } => {
  const failed = after.filter(c => (c.bucket === 'fail' || c.bucket === 'cancel') && !told.has(`${sha}:${c.name}`))
  const wasPending = before === null || before.some(c => c.bucket === 'pending')
  const isDone = after.length > 0 && wasPending && !after.some(c => c.bucket === 'pending')
  return { failed, isDone }
}

const SECRET_PREFIX = /\b(?:ghp_|gho_|ghs_|github_pat_|ya29\.|1\/\/|ntok_|nins_|ngat_|sk-|xox[bpas]-|AKIA)[\w\-./+=]{8,}/g
/** A run of 32 or more with letters and digits mixed: a token, not a word or a path (`/` ends it). */
const RANDOM_RUN = /(?=[A-Za-z0-9_\-+=]*\d)(?=[A-Za-z0-9_\-+=]*[A-Za-z])[A-Za-z0-9_\-+=]{32,}/g

/** A log as it may leave the machine: known token shapes and long random runs masked. */
export const scrub = (text: string): string => text.replace(SECRET_PREFIX, '[segreto oscurato]').replace(RANDOM_RUN, '[oscurato]')

/** The last `n` lines with text, scrubbed. */
export const tailOf = (text: string, n: number): string[] =>
  scrub(text)
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l !== '')
    .slice(-n)
