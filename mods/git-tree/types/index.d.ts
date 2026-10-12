/** Where a ref points from: the checked-out branch, another local one, GitHub's copy, a tag. */
export type RefKind = 'head' | 'local' | 'remote' | 'tag'

/** A name on a commit; `head` with an empty name is a detached HEAD. */
export type Ref = { kind: RefKind; name: string }

export type Commit = {
  sha: string
  parents: string[]
  author: string
  /** Seconds since the epoch, as git gives them. */
  at: number
  subject: string
  refs: Ref[]
}

/** One file of a commit's change; null counts for a binary file. */
export type FileChange = { path: string; added: number | null; removed: number | null }

export type CommitDetail = { sha: string; body: string; files: FileChange[] }

/** Where the checked-out branch stands. */
export type HeadState = {
  branch: string | null
  /** Commits ahead of and behind its upstream; null without one. */
  ahead: number | null
  behind: number | null
  /** Files changed and not committed. */
  changed: number
}
