import type { Day, DayFacts, Summary } from '../types'
import { dayLabel, formatMinutes, shiftDay, weekLabel } from './calendar'
import { projectLabel, projectName } from './facts'

export const DAY_LINES = 5
export const WEEK_LINES = 6
/** Summaries older than this go: transcripts are kept 30 days, the diary no longer. */
export const KEEP_DAYS = 31
const MAX_FILES = 8
const MAX_COMMITS = 25

/** A long random-looking run (a token, a key) never reaches the summary's model. */
const RANDOM_RUN = /[A-Za-z0-9_\-+/=]{32,}/g
export const scrub = (text: string): string => text.replace(RANDOM_RUN, '…')

export const dayKey = (day: Day): string => `day:${day}`
export const weekKey = (monday: Day): string => `week:${monday}`

const basename = (path: string): string => path.split('/').filter(p => p !== '').pop() ?? path
const clock = (iso: string): string => iso.slice(11, 16)

/** The day's facts as the model reads them: no message's text, only what the calendar knows. */
export const dayFactsText = (f: DayFacts): string => {
  const sessions = f.sessions.map(s => {
    const files = s.edits.map(basename)
    const shown = files.slice(0, MAX_FILES).join(', ') + (files.length > MAX_FILES ? ` e altri ${files.length - MAX_FILES}` : '')
    return [
      `- ${clock(s.start)}–${clock(s.end)} ${projectName(s.repo)}${s.branch === null ? '' : ` (${s.branch})`}: «${s.title ?? 'senza titolo'}»`,
      `  ${formatMinutes(s.activeMinutes)} attivi, ${s.prompts} messaggi, ${s.commands} comandi${files.length > 0 ? `, file modificati: ${shown}` : ''}`,
    ].join('\n')
  })
  const commits = f.commits.slice(0, MAX_COMMITS).map(c => `- ${c.time} ${projectName(c.project)}: ${c.subject}`)
  return scrub(
    [
      `${dayLabel(f.day)}: ${formatMinutes(f.activeMinutes)} di lavoro con Claude`,
      `Progetti: ${f.projects.map(projectLabel).join(', ') || 'nessuno'}`,
      `Sessioni:\n${sessions.join('\n') || '- nessuna'}`,
      `Commit:\n${commits.join('\n') || '- nessuno'}${f.commits.length > MAX_COMMITS ? `\n- e altri ${f.commits.length - MAX_COMMITS}` : ''}`,
    ].join('\n'),
  )
}

export const SYSTEM =
  'Scrivi il diario di lavoro di uno sviluppatore, in italiano, alla seconda persona («hai…»). ' +
  'Usa solo i fatti che ti do: non inventare attività, cause o esiti. Frasi corte, per temi, niente titoli né markdown.'

export const dayPrompt = (f: DayFacts): string =>
  `${dayFactsText(f)}\n\nScrivi da 3 a ${DAY_LINES} righe su che cosa hai fatto in questa giornata, una per tema, ` +
  'ognuna che inizia con «• ». Raggruppa le sessioni dello stesso lavoro.'

/** The week: each day's summary when there is one, its facts otherwise. */
export const weekPrompt = (days: readonly DayFacts[], summaries: Readonly<Record<string, Summary>>): string => {
  const parts = days
    .filter(d => d.sessions.length > 0 || d.commits.length > 0)
    .map(d => {
      const written = summaries[dayKey(d.day)]
      return written === undefined ? dayFactsText(d) : `${dayLabel(d.day)} (${formatMinutes(d.activeMinutes)}):\n${written.text}`
    })
  const monday = days[0]?.day ?? ''
  return (
    `Settimana ${weekLabel(monday)}.\n\n${parts.join('\n\n')}\n\nScrivi da 3 a ${WEEK_LINES} righe sulla settimana: ` +
    'i filoni di lavoro, che cosa è andato avanti, che cosa è rimasto aperto se i fatti lo dicono. Ognuna inizia con «• ».'
  )
}

/** The model's reply as the diary shows it: its bullet lines, at most `max`. */
export const cleanReply = (text: string, max: number): string | null => {
  const lines = text
    .split('\n')
    .map(l => l.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, ''))
    .filter(l => l !== '' && !l.startsWith('#'))
    .slice(0, max)
    .map(l => `• ${l}`)
  return lines.length === 0 ? null : lines.join('\n')
}

/** The summaries still worth keeping: the last KEEP_DAYS days'. */
export const pruneSummaries = (all: Readonly<Record<string, Summary>>, today: Day): Record<string, Summary> => {
  const oldest = shiftDay(today, -KEEP_DAYS)
  return Object.fromEntries(Object.entries(all).filter(([key]) => key.slice(key.indexOf(':') + 1) >= oldest))
}
