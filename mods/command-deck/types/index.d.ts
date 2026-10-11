/** Where a command came from: an answer of Claude's, or a Bash call the permissions refused. */
export type CommandSource = 'answer' | 'denied'

/** One command in the deck. */
export type DeckCommand = {
  id: string
  text: string
  source: CommandSource
  /** What breaks the person's rules for commands (placeholders, ssh without -t…), in Italian. */
  warnings: string[]
  /** When it was added, ms on the session clock. */
  at: number
}

/** Who closed a to-do: the person with «Fatto», or Claude when the conversation showed it done. */
export type ClosedBy = 'you' | 'claude'

/** Something left for the person to do, as Claude read it off its answers, with the commands it takes. */
export type Todo = {
  id: string
  /** What to do, in a short imperative line. */
  title: string
  /** Why or how, in a sentence or two; empty when the title says it all. */
  detail: string
  /** Commands to paste for it, verbatim, each checked against the person's rules. */
  commands: { text: string; warnings: string[] }[]
  /** When it was added, ms on the session clock. */
  at: number
  /** Absent while open. */
  closed?: { by: ClosedBy; at: number }
}

declare module 'claude-code' {
  interface PluginState {
    'command-deck': {
      /** Newest first, each text once, at most MAX_COMMANDS. */
      commands: DeckCommand[]
      /** Open ones first in the order they came, then the closed ones, newest closed first. */
      todos: Todo[]
      /** The closed to-dos are listed under the open ones. */
      isDoneShown: boolean
    }
  }
}
