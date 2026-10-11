/** A local calendar day, `YYYY-MM-DD` in the Mac's time zone. */
export type Day = string

/** A stretch of work, from its first message to its last: ISO times with their offset. */
export type Span = [string, string]

/** One session's work on one day, read off its transcript: facts only, never the messages' text. */
export type SessionDay = {
  sessionId: string
  day: Day
  /** The session's working directory. */
  project: string
  /** The repository it worked in: its directory's, or the one most of its edits are in; else its directory. */
  repo: string
  branch: string | null
  /** The session's title as Claude Code named it; null when it has none. */
  title: string | null
  /** First and last message of that day. */
  start: string
  end: string
  /** The gaps between its messages, each counted up to the idle cap. */
  activeMinutes: number
  /** Its stretches of work: parallel sessions overlap, so a day's time is their union. */
  spans: Span[]
  /** The person's own messages that day. */
  prompts: number
  /** Files Claude edited or wrote that day, each once, absolute paths. */
  edits: string[]
  /** Bash calls that day. */
  commands: number
}

/** A commit of the person's, in a repository the sessions worked in. */
export type Commit = { project: string; day: Day; time: string; hash: string; subject: string }

/** What hooks/scan.py prints. */
export type Scan = { today: Day; sessions: SessionDay[]; commits: Commit[] }

/** One project's share of a day or a week. */
export type ProjectTime = { name: string; minutes: number; sessions: number; commits: number }

/** Everything known about a day, for the calendar and its summary. */
export type DayFacts = {
  day: Day
  /** The union of the day's spans. */
  activeMinutes: number
  /** Most minutes first. */
  projects: ProjectTime[]
  /** Earliest first. */
  sessions: SessionDay[]
  /** Earliest first. */
  commits: Commit[]
}

/** A summary Claude wrote, and the facts it was written from, to know when it is stale. */
export type Summary = { text: string; factsKey: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'work-diary': {
      /** By `day:YYYY-MM-DD` or `week:YYYY-MM-DD` (the week's Monday). */
      summaries: Record<string, Summary>
    }
  }
}
