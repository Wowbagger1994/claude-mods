import type { Commit } from '../types'

/** The branch every repository keeps as its trunk, first after the one you are on. */
const TRUNKS = ['main', 'master', 'develop', 'trunk']

/** A branch's place in the story: where you are, the trunk, still open, merged, only on GitHub. */
export type BranchStatus = 'head' | 'open' | 'merged' | 'remote'

export type BranchInfo = {
  name: string
  /** Its colour: 0 for the branch you are on, then in the order shown. */
  color: number
  status: BranchStatus
  /** Newest first, as in the log. */
  shas: string[]
  /** The commit it grew from, on another branch; null when that is beyond the commits read. */
  forkSha: string | null
  /** The merge that brought it into another branch, and the pull request's number when the merge names one. */
  mergeSha: string | null
  pr: number | null
  mergedInto: string | null
  /** A GitHub copy exists under its name. */
  isOnGitHub: boolean
}

/** The branch a merge's subject names: `Merge pull request #4 from user/x`, `Merge branch 'x'`, `Merge remote-tracking branch 'origin/x'`. */
export const mergedBranchOf = (subject: string): string | null => {
  const pr = /^Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(subject)
  if (pr) return pr[1]!
  const branch = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject)
  if (branch) return branch[1]!.replace(/^origin\//, '')
  return null
}

export const prOf = (subject: string): number | null => {
  const m = /^Merge pull request #(\d+)/.exec(subject) ?? /\(#(\d+)\)\s*$/.exec(subject)
  return m ? Number(m[1]) : null
}

/** What a merge did, in words: `unisce docs/convenzioni (#3)`; null for any other commit. */
export const mergeTitle = (c: Commit): string | null => {
  if (c.parents.length < 2) return null
  const name = mergedBranchOf(c.subject)
  if (name === null) return null
  const pr = prOf(c.subject)
  return `unisce ${name}${pr === null ? '' : ` (#${pr})`}`
}

const remoteName = (name: string) => (name.startsWith('origin/') ? name.slice('origin/'.length) : name)

/**
 * The branch names to start from, best first: the trunk, then where you are, then
 * the other local branches, then GitHub's. The trunk goes first because a branch's
 * first parents run on into the trunk's history below where it grew: taken first,
 * that history would be the branch's.
 */
const tipsOf = (commits: readonly Commit[]): { name: string; sha: string }[] => {
  const head = commits.flatMap(c => c.refs.filter(r => r.kind === 'head').map(r => ({ name: r.name === '' ? 'HEAD staccata' : r.name, sha: c.sha })))
  const locals = commits.flatMap(c => c.refs.filter(r => r.kind === 'local').map(r => ({ name: r.name, sha: c.sha })))
  const remotes = commits.flatMap(c => c.refs.filter(r => r.kind === 'remote').map(r => ({ name: remoteName(r.name), sha: c.sha })))
  const isTrunk = (t: { name: string }) => TRUNKS.includes(t.name)
  return [...head.filter(isTrunk), ...locals.filter(isTrunk), ...remotes.filter(isTrunk), ...head, ...locals.filter(t => !isTrunk(t)), ...remotes.filter(t => !isTrunk(t))]
}

/**
 * Which branch each commit belongs to: from each tip, best first, down its first
 * parents to a commit another branch already took; then each merge's other parents,
 * named after what the merge says; whatever is left is a branch with no name.
 */
export const branchesOf = (commits: readonly Commit[]): Map<string, string> => {
  const bySha = new Map(commits.map(c => [c.sha, c]))
  const owner = new Map<string, string>()
  const used = new Set<string>()
  const claim = (from: string, name: string) => {
    let sha: string | undefined = from
    while (sha !== undefined && bySha.has(sha) && !owner.has(sha)) {
      owner.set(sha, name)
      sha = bySha.get(sha)!.parents[0]
    }
    used.add(name)
  }
  // A name met again (GitHub's copy ahead of the local branch) goes on taking its own commits.
  for (const t of tipsOf(commits)) if (!owner.has(t.sha)) claim(t.sha, t.name)
  const unique = (name: string) => {
    if (!used.has(name)) return name
    let n = 2
    while (used.has(`${name} (${n})`)) n++
    return `${name} (${n})`
  }
  for (const c of commits) {
    if (!owner.has(c.sha)) claim(c.sha, unique('senza nome'))
    for (const p of c.parents.slice(1)) if (bySha.has(p) && !owner.has(p)) claim(p, unique(mergedBranchOf(c.subject) ?? `unito in ${c.sha.slice(0, 7)}`))
  }
  return owner
}

/** Each branch's story, the one you are on first, then by its newest commit. */
export const branchInfos = (commits: readonly Commit[], owner: ReadonlyMap<string, string>, headBranch: string | null): BranchInfo[] => {
  const bySha = new Map(commits.map(c => [c.sha, c]))
  const order: string[] = []
  const shas = new Map<string, string[]>()
  for (const c of commits) {
    const name = owner.get(c.sha)
    if (name === undefined) continue
    if (!shas.has(name)) order.push(name)
    shas.set(name, [...(shas.get(name) ?? []), c.sha])
  }
  const merges = new Map<string, Commit>()
  for (const c of commits) for (const p of c.parents.slice(1)) {
    const name = owner.get(p)
    // The newest merge of a branch's tip is the one that took it all.
    if (name !== undefined && shas.get(name)?.[0] === p && !merges.has(name)) merges.set(name, c)
  }
  const remoteNames = new Set(commits.flatMap(c => c.refs.filter(r => r.kind === 'remote').map(r => remoteName(r.name))))
  const localNames = new Set(commits.flatMap(c => c.refs.filter(r => r.kind === 'local' || r.kind === 'head').map(r => r.name)))
  const sorted = [...order].sort((a, b) => Number(b === headBranch) - Number(a === headBranch) || Number(TRUNKS.includes(b)) - Number(TRUNKS.includes(a)))
  return sorted.map((name, color) => {
    const own = shas.get(name)!
    const oldest = bySha.get(own[own.length - 1]!)!
    const fork = oldest.parents[0]
    const merge = merges.get(name) ?? null
    const status: BranchStatus = name === headBranch ? 'head' : merge !== null ? 'merged' : !localNames.has(name) && remoteNames.has(name) ? 'remote' : 'open'
    return {
      name,
      color,
      status,
      shas: own,
      forkSha: fork !== undefined && bySha.has(fork) ? fork : null,
      mergeSha: merge?.sha ?? null,
      pr: merge === null ? null : prOf(merge.subject),
      mergedInto: merge === null ? null : (owner.get(merge.sha) ?? null),
      isOnGitHub: remoteNames.has(name),
    }
  })
}
