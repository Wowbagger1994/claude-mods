import type { Ref } from '../types'

const MINUTE_S = 60
const HOUR_S = 60 * MINUTE_S
const DAY_S = 24 * HOUR_S
const WEEK_DAYS = 7
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const DAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
/** A branch name longer than this is cut in the middle of the row. */
export const MAX_REF = 28

/** `adesso`, `12 min fa`, `3 h fa`, `ieri`, `4 g fa`, then the date: `12 ott`, `12 ott 2024` in another year. */
export const ageOf = (atS: number, nowMs: number): string => {
  const s = Math.max(0, Math.floor(nowMs / 1000) - atS)
  if (s < MINUTE_S) return 'adesso'
  if (s < HOUR_S) return `${Math.floor(s / MINUTE_S)} min fa`
  if (s < DAY_S) return `${Math.floor(s / HOUR_S)} h fa`
  const days = Math.floor(s / DAY_S)
  if (days === 1) return 'ieri'
  if (days < WEEK_DAYS) return `${days} g fa`
  const d = new Date(atS * 1000)
  const year = d.getFullYear() === new Date(nowMs).getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`
}

/** `lun 12 ott 2026, 10:32`, in this machine's time. */
export const fullDate = (atS: number): string => {
  const d = new Date(atS * 1000)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

export const shortRef = (name: string, max = MAX_REF) => (name.length <= max ? name : `${name.slice(0, max - 1)}…`)

/** What a commit's names say on its row. */
export type Badge =
  | { kind: 'head'; text: string; isSynced: boolean }
  | { kind: 'local'; text: string; isSynced: boolean }
  | { kind: 'remote'; text: string }
  | { kind: 'tag'; text: string }

/** `origin/feature/x` as `feature/x`; another remote keeps its name. */
const remoteShown = (name: string) => (name.startsWith('origin/') ? name.slice('origin/'.length) : name)

/**
 * A commit's names, as few as tell it all: the checked-out branch first, then the
 * local ones; a GitHub copy on the same commit as its local branch folds into it.
 */
export const badgesOf = (refs: readonly Ref[]): Badge[] => {
  const remotes = refs.filter(r => r.kind === 'remote').map(r => r.name)
  const isSynced = (name: string) => remotes.includes(`origin/${name}`)
  const locals = refs.filter(r => r.kind === 'head' || r.kind === 'local').map(r => r.name)
  const head = refs.find(r => r.kind === 'head')
  return [
    ...(head === undefined ? [] : [{ kind: 'head' as const, text: head.name === '' ? 'HEAD' : head.name, isSynced: head.name !== '' && isSynced(head.name) }]),
    ...refs.filter(r => r.kind === 'local').map(r => ({ kind: 'local' as const, text: r.name, isSynced: isSynced(r.name) })),
    ...remotes.filter(n => !locals.some(l => `origin/${l}` === n)).map(n => ({ kind: 'remote' as const, text: remoteShown(n) })),
    ...refs.filter(r => r.kind === 'tag').map(r => ({ kind: 'tag' as const, text: r.name })),
  ]
}

/** Words to lines of at most `width`, a word longer than that cut; blank lines kept. */
export const wrapText = (text: string, width: number): string[] =>
  text.split('\n').flatMap(paragraph => {
    if (paragraph.trim() === '') return ['']
    const lines: string[] = []
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(w => w !== '')) {
      const pieces = word.length > width ? word.match(new RegExp(`.{1,${Math.max(1, width)}}`, 'g')) ?? [word] : [word]
      for (const piece of pieces) {
        if (line === '') line = piece
        else if (line.length + 1 + piece.length <= width) line = `${line} ${piece}`
        else {
          lines.push(line)
          line = piece
        }
      }
    }
    return [...lines, line]
  })

const LONG_DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const LONG_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** The local day a moment falls on, as `2026-07-27`: days compare as strings. */
export const dayKey = (atS: number): string => {
  const d = new Date(atS * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `oggi`, `ieri`, `lunedì 27 luglio`, `27 luglio 2025` in another year. */
export const dayLabel = (atS: number, nowMs: number): string => {
  const today = dayKey(Math.floor(nowMs / 1000))
  const key = dayKey(atS)
  if (key === today) return 'oggi'
  if (key === dayKey(Math.floor(nowMs / 1000) - 86_400)) return 'ieri'
  const d = new Date(atS * 1000)
  if (d.getFullYear() !== new Date(nowMs).getFullYear()) return `${d.getDate()} ${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`
  return `${LONG_DAYS[d.getDay()]} ${d.getDate()} ${LONG_MONTHS[d.getMonth()]}`
}

/** `17:35`, in this machine's time. */
export const clockOf = (atS: number): string => {
  const d = new Date(atS * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
