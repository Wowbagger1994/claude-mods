/** A fast check to run locally: a shell line, run from the repository's top. */
export type CheckCommand = { label: string; command: string }

/** Where a repository's checks come from. */
export type CheckSource =
  | { kind: 'override'; path: string }
  | { kind: 'ci'; path: string }
  | { kind: 'default'; what: string }
  | { kind: 'none' }

export type CommandRun = {
  label: string
  command: string
  exitCode: number
  durationMs: number
  /** The output's last lines, secrets masked. */
  tail: string[]
}

export type LocalRun = { at: number; runs: CommandRun[] }

/** As gh names a check's outcome. */
export type Bucket = 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel'

export type CiCheck = { name: string; workflow: string; bucket: Bucket; link: string }

export type CiStatus = {
  sha: string
  pr: { number: number; url: string; title: string } | null
  checks: CiCheck[]
  at: number
}
