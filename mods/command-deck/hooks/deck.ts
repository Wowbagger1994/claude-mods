import type { CommandSource, DeckCommand } from '../types'
import { lint } from './extract'

/** Commands kept: the recent ones, which are the ones still worth pasting. */
export const MAX_COMMANDS = 30

/** Entries for commands found at `at`, checked against the person's rules. */
export const toCommands = (texts: readonly string[], source: CommandSource, at: number): DeckCommand[] =>
  texts.map((text, i) => ({ id: `${at}-${i}`, text, source, warnings: lint(text), at }))

/** The texts among `fresh` the deck does not hold yet. */
export const newTexts = (deck: readonly DeckCommand[], fresh: readonly DeckCommand[]): string[] =>
  fresh.map(c => c.text).filter(text => !deck.some(c => c.text === text))

/** The deck with `fresh` on top, in their order; a command already there moves up, once; at most MAX_COMMANDS. */
export const addCommands = (deck: readonly DeckCommand[], fresh: readonly DeckCommand[]): DeckCommand[] => {
  const texts = new Set(fresh.map(c => c.text))
  return [...fresh, ...deck.filter(c => !texts.has(c.text))].slice(0, MAX_COMMANDS)
}
