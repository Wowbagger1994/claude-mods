/** What a block of changed lines did: lines added, lines replaced, or lines taken out at a point. */
export type ChangeKind = 'added' | 'changed' | 'removed'

/** Lines of the file as it stands now (1-based, inclusive) that one edit touched. */
export type Mark = {
  editId: string
  start: number
  end: number
  kind: ChangeKind
}

/** Where an edit's explanation stands: waiting for the turn to end, being asked, ready, or failed. */
export type ExplanationState = 'pending' | 'loading' | 'done' | 'failed'

/** One edit Claude made to a file, as a unified diff ready for `Code`. */
export type FileEdit = {
  id: string
  diff: string
  added: number
  removed: number
  /** Milliseconds since the epoch. */
  at: number
  explanation: string | null
  explanationState: ExplanationState
}

/** A file Claude touched in this session, its edits oldest first. */
export type ChangedFile = {
  path: string
  isNew: boolean
  edits: FileEdit[]
  /** Lines in the file now; null when the engine did not say and nothing earlier did. */
  lineCount: number | null
  /** Changed lines in today's coordinates, every edit's, shifted as later edits moved them. */
  marks: Mark[]
  /** The git worktree the file lives in, and its branch; null outside git. */
  root: string | null
  branch: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'diff-checker': {
      /** `changes`, not `files`: version 0.1 kept a smaller shape under `files`. */
      changes: ChangedFile[]
      selected: string | null
      hasAutoOpened: boolean
      /** Edits the person opened or closed, by id; the latest of a file is open unless closed. */
      expanded: Record<string, boolean>
      isOverviewOpen: boolean
      /** What Svuota is asking to confirm: `*` every file, else one group by its root (`-` outside git); null: nothing. */
      confirmingClear: string | null
    }
  }
}
