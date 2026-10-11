import { expect, test } from 'claude-code/testing'

import { dayLabel, formatMinutes, shortMinutes, isDay, mondayOf, monthGrid, monthLabel, shiftDay, shiftMonth, weekdayOf, weekLabel, weekOf } from './calendar'

test('a week runs Monday to Sunday around the day, across a month', () => {
  expect(weekOf('2026-10-10')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
  expect(mondayOf('2026-10-05')).toBe('2026-10-05')
  expect(mondayOf('2026-10-11')).toBe('2026-10-05')
  expect(weekOf('2026-10-01')[0]).toBe('2026-09-28')
  expect(weekdayOf('2026-10-10')).toBe(5)
})

test('days shift across months, years and the change of daylight saving', () => {
  expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
  expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  // The clocks go back on 25 October 2026 in Rome: still one day.
  expect(shiftDay('2026-10-25', 1)).toBe('2026-10-26')
  expect(shiftDay('2026-10-10', -7)).toBe('2026-10-03')
})

test('a month later keeps the day, or the month’s last', () => {
  expect(shiftMonth('2026-10-10', 1)).toBe('2026-11-10')
  expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28')
  expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28')
  expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15')
  expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-15')
})

test('the month grid holds each day once, in its weekday’s column, blanks outside', () => {
  const grid = monthGrid('2026-10-20')
  const days = grid.flat().filter(d => d !== null)

  expect(grid.every(row => row.length === 7)).toBe(true)
  expect(days).toEqual(Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`))
  // 1 October 2026 is a Thursday, 31 a Saturday.
  expect(grid[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  expect(grid[grid.length - 1]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
  // February 2027 starts on a Monday and fills four rows exactly.
  expect(monthGrid('2027-02-10')).toHaveLength(4)
})

test('labels read in Italian', () => {
  expect(dayLabel('2026-10-10')).toBe('sab 10 ottobre')
  expect(weekLabel('2026-10-10')).toBe('5 – 11 ottobre 2026')
  expect(weekLabel('2026-10-01')).toBe('28 settembre – 4 ottobre 2026')
  expect(monthLabel('2026-10-10')).toBe('ottobre 2026')
})

test('minutes read as hours and minutes', () => {
  expect(formatMinutes(0)).toBe('0m')
  expect(formatMinutes(45)).toBe('45m')
  expect(formatMinutes(60)).toBe('1h')
  expect(formatMinutes(135)).toBe('2h 15m')
  expect(formatMinutes(-3)).toBe('0m')
})

test('a calendar cell reads time short', () => {
  expect([0, 45, 60, 135, 605].map(shortMinutes)).toEqual(['0m', '45m', '1h', '2h15', '10h05'])
})

test('only YYYY-MM-DD is a day', () => {
  expect(isDay('2026-10-10')).toBe(true)
  expect(isDay('2026-10-10T00:00')).toBe(false)
  expect(isDay(20261010)).toBe(false)
})
