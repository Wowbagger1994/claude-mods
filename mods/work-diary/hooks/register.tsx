import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Day, DayFacts, Summary } from '../types'
import { mondayOf, shiftDay, shiftMonth, weekOf } from './calendar'
import { daysOf, factsKey, factsOf, parseScan } from './facts'
import { cleanReply, DAY_LINES, dayKey, dayPrompt, KEEP_DAYS, pruneSummaries, SYSTEM, WEEK_LINES, weekKey, weekPrompt } from './summary'
import type { Actions, DiaryState } from './view'
import { diaryView } from './view'

const PLUGIN = 'work-diary'
const PANE = 'work-diary'
const TITLE = 'Diario'
const SCAN_TIMEOUT_MS = 120_000
const SUMMARY_TIMEOUT_MS = 60_000
const SUMMARY_MAX_TOKENS = 600
const DAY_MS = 86_400_000

const summaries = atom({ plugin: 'work-diary', key: 'summaries' } as const, {})
/** Where the summaries outlive the session: `$.state` is the session's, `$.store` the machine's. */
const STORE_SUMMARIES = 'summaries'

const isSummary = (v: unknown): v is Summary =>
  typeof v === 'object' && v !== null && typeof (v as Summary).text === 'string' && typeof (v as Summary).factsKey === 'string' && typeof (v as Summary).at === 'number'

/** What the store holds, as far as it is summaries. */
const savedSummaries = (raw: unknown): Record<string, Summary> =>
  typeof raw !== 'object' || raw === null ? {} : Object.fromEntries(Object.entries(raw).filter(([, v]) => isSummary(v)))

/** Changes the summaries, and keeps them for the next sessions. */
const setSummaries = async ($: EngineInterface, fn: (all: Readonly<Record<string, Summary>>) => Record<string, Summary>) => {
  await update($, summaries, fn)
  // Another session may have written its own meanwhile: kept too, this session's winning; the old ones go.
  const merged = { ...savedSummaries(await $.store.get(STORE_SUMMARIES)), ...(await read($, summaries)) }
  await $.store.set(STORE_SUMMARIES, today === null ? merged : pruneSummaries(merged, today))
}

/** What the last reading of the transcripts found, and what the pane shows: this session's, not kept. */
let days: ReadonlyMap<Day, DayFacts> = new Map()
let today: Day | null = null
let selected: Day | null = null
let isScanning = false
let error: string | null = null
const writing = new Set<string>()
/** A summary asked for while others are being written: the writer goes round once more. */
let isWriting = false
let isWriteAgain = false
/** Summaries `r` asked to write anew, by key: kept until written, whatever is selected meanwhile. */
const forced = new Set<string>()

const hasWork = (f: Pick<DayFacts, 'sessions' | 'commits'>) => f.sessions.length > 0 || f.commits.length > 0

/** One summary to write: its key, the facts it stands on, how to ask for it. */
type Job = { key: string; facts: DayFacts[]; prompt: () => Promise<string>; lines: number }

/** The selected day first, then its week, then the week's other days, so a press on them finds them written. */
const jobsFor = async ($: EngineInterface, day: Day): Promise<Job[]> => {
  const week = weekOf(day).filter(d => today === null || d <= today).map(d => factsOf(days, d))
  const dayJob = (f: DayFacts): Job => ({ key: dayKey(f.day), facts: [f], prompt: async () => dayPrompt(f), lines: DAY_LINES })
  const selectedFacts = factsOf(days, day)
  const weekJob: Job = { key: weekKey(mondayOf(day)), facts: week, prompt: async () => weekPrompt(week, await read($, summaries)), lines: WEEK_LINES }
  return [dayJob(selectedFacts), weekJob, ...week.filter(f => f.day !== day).map(dayJob)].filter(j => j.facts.some(hasWork))
}

const writeOne = async ($: EngineInterface, job: Job) => {
  const key = factsKey(job.facts)
  const known = (await read($, summaries))[job.key]
  if (!forced.has(job.key) && known?.factsKey === key) return
  forced.delete(job.key)
  writing.add(job.key)
  $.ui.invalidate('ui.render')
  try {
    const reply = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt: await job.prompt(), maxTokens: SUMMARY_MAX_TOKENS, timeoutMs: SUMMARY_TIMEOUT_MS })
    const text = reply.isAnswered ? cleanReply(reply.text, job.lines) : null
    if (text === null) {
      $.ui.log(`${PLUGIN}: riassunto ${job.key} non scritto: ${reply.isAnswered ? 'risposta vuota' : reply.reason}`, { to: 'debug' })
      return
    }
    const at = await $.clock.now()
    await setSummaries($, all => ({ ...all, [job.key]: { text, factsKey: key, at } }))
  } finally {
    writing.delete(job.key)
    $.ui.invalidate('ui.render')
  }
}

/** Writes the summaries the pane shows that are missing or stale, and those `r` asked for anew. */
const writeSummaries = async ($: EngineInterface) => {
  if (isWriting) {
    isWriteAgain = true
    return
  }
  isWriting = true
  try {
    do {
      isWriteAgain = false
      const day = selected ?? today
      if (day === null) break
      for (const job of await jobsFor($, day)) {
        if (isWriteAgain) break
        // One summary failing leaves the others to write.
        await writeOne($, job).catch((cause: unknown) =>
          $.ui.log(`${PLUGIN}: riassunto ${job.key} non scritto: ${String(cause)}`, { to: 'debug' }),
        )
      }
    } while (isWriteAgain)
  } catch (cause) {
    $.ui.log(`${PLUGIN}: riassunti non scritti: ${String(cause)}`, { to: 'debug' })
  } finally {
    isWriting = false
  }
}

/** Reads the last 30 days of transcripts again, then writes what summaries are missing. */
const refresh = async ($: EngineInterface) => {
  if (isScanning) return
  isScanning = true
  error = null
  $.ui.invalidate('ui.render')
  try {
    const home = await $.env.get('HOME')
    if (home === undefined) throw new Error('HOME non impostata')
    const now = await $.clock.now()
    const since = new Date(now - KEEP_DAYS * DAY_MS).toISOString().slice(0, 10)
    const ran = await $.process.run(['python3', '-I', `${$.plugin.root}/hooks/scan.py`, `${home}/.claude/projects`, since], { timeoutMs: SCAN_TIMEOUT_MS })
    const scan = ran.exitCode === 0 ? parseScan(ran.stdout) : null
    if (scan === null) throw new Error(ran.stderr.trim().split('\n').pop() || `scan.py è uscito con ${ran.exitCode}`)
    days = daysOf(scan)
    today = scan.today
    selected = selected ?? scan.today
    await setSummaries($, all => pruneSummaries(all, scan.today))
  } catch (cause) {
    error = `Transcript non letti: ${cause instanceof Error ? cause.message : String(cause)}`
    $.ui.log(`${PLUGIN}: ${error}`, { to: 'debug' })
  } finally {
    isScanning = false
    $.ui.invalidate('ui.render')
  }
  if (error === null) await writeSummaries($)
}

const select = ($: EngineInterface, day: Day) => {
  selected = day
  $.ui.invalidate('ui.render')
  void writeSummaries($)
}

const actionsFor = ($: EngineInterface): Actions => ({
  select: day => select($, day),
  shift: n => {
    const day = selected ?? today
    if (day !== null) select($, shiftMonth(day, n))
  },
  move: n => {
    const day = selected ?? today
    if (day !== null) select($, shiftDay(day, n))
  },
  // Today as the clock says it, past a midnight too: the transcripts are read again.
  today: () => {
    selected = null
    return refresh($)
  },
  rewrite: async () => {
    const day = selected ?? today
    if (day === null) return
    forced.add(dayKey(day))
    forced.add(weekKey(mondayOf(day)))
    await writeSummaries($)
  },
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'diary', description: 'Il lavoro fatto con Claude: giorno, settimana e mese, con i riassunti' })
    // The summaries of earlier sessions: this session's own win where both have one.
    const saved = savedSummaries(await $.store.get(STORE_SUMMARIES))
    await update($, summaries, all => ({ ...saved, ...all }))
    return next(e)
  })

  on('command.run', { command: 'diary' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true }).catch(() => $.ui.open({ id: PANE, title: TITLE }))
    void refresh($)
    return { text: 'Diario aperto: clicca un giorno, oppure a/d giorno, w/s settimana, p/n mese, t oggi.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state: DiaryState = {
      columns: Math.max(40, e.props.bodyColumns),
      selected: selected ?? today ?? new Date(await $.clock.now()).toISOString().slice(0, 10),
      today,
      oldest: today === null ? null : shiftDay(today, -(KEEP_DAYS - 1)),
      days,
      summaries: await read($, summaries),
      writing,
      isScanning,
      error,
    }
    return diaryView($.ui.resolve(e), state, actionsFor($))
  })
}
