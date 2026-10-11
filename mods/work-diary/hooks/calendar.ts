import type { Day } from '../types'

const DAY_MS = 86_400_000
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as const
const WEEKDAY_NAMES = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'] as const

export const isDay = (text: unknown): text is Day => typeof text === 'string' && DAY_RE.test(text)

/** Days are counted on UTC midnights: no time zone or daylight saving shifts them. */
const msOf = (day: Day): number => {
  const [, y, m, d] = DAY_RE.exec(day) ?? []
  return Date.UTC(Number(y), Number(m) - 1, Number(d))
}
const dayOfMs = (ms: number): Day => new Date(ms).toISOString().slice(0, 10)

export const shiftDay = (day: Day, n: number): Day => dayOfMs(msOf(day) + n * DAY_MS)

/** 0 Monday … 6 Sunday. */
export const weekdayOf = (day: Day): number => (new Date(msOf(day)).getUTCDay() + 6) % 7

export const mondayOf = (day: Day): Day => shiftDay(day, -weekdayOf(day))

/** The seven days, Monday to Sunday, of the week holding `day`. */
export const weekOf = (day: Day): Day[] => Array.from({ length: 7 }, (_, i) => shiftDay(mondayOf(day), i))

export const firstOfMonth = (day: Day): Day => `${day.slice(0, 7)}-01`

/** The same day of another month, or that month's last when it is shorter. */
export const shiftMonth = (day: Day, n: number): Day => {
  const date = new Date(msOf(day))
  const first = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n + 1, 0)).getUTCDate()
  return dayOfMs(first + (Math.min(date.getUTCDate(), last) - 1) * DAY_MS)
}

/** The month as rows of seven, Monday first; null outside it. */
export const monthGrid = (day: Day): (Day | null)[][] => {
  const first = firstOfMonth(day)
  const month = first.slice(0, 7)
  const start = mondayOf(first)
  const rows: (Day | null)[][] = []
  for (let week = start; week.slice(0, 7) <= month || rows.length === 0; week = shiftDay(week, 7)) {
    rows.push(weekOf(week).map(d => (d.slice(0, 7) === month ? d : null)))
  }
  return rows
}

export const dayNumber = (day: Day): number => Number(day.slice(8, 10))
const monthName = (day: Day): string => MONTHS[Number(day.slice(5, 7)) - 1] ?? ''

/** `sab 10 ottobre`. */
export const dayLabel = (day: Day): string => `${WEEKDAYS[weekdayOf(day)]} ${dayNumber(day)} ${monthName(day)}`

/** `sabato 10 ottobre`. */
export const longDayLabel = (day: Day): string => `${WEEKDAY_NAMES[weekdayOf(day)]} ${dayNumber(day)} ${monthName(day)}`

/** `6 – 12 ottobre 2026`, or `29 settembre – 5 ottobre 2026` across two months. */
export const weekLabel = (day: Day): string => {
  const days = weekOf(day)
  const [first, last] = [days[0]!, days[6]!]
  const year = last.slice(0, 4)
  return first.slice(0, 7) === last.slice(0, 7)
    ? `${dayNumber(first)} – ${dayNumber(last)} ${monthName(last)} ${year}`
    : `${dayNumber(first)} ${monthName(first)} – ${dayNumber(last)} ${monthName(last)} ${year}`
}

/** `ottobre 2026`. */
export const monthLabel = (day: Day): string => `${monthName(day)} ${day.slice(0, 4)}`

/** `2h15`, `45m`, `3h`: a calendar cell's width. */
export const shortMinutes = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`
}

/** `2h 15m`, `45m`, `0m`. */
export const formatMinutes = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
