import { describe, expect, test } from 'claude-code/testing'

import { fitRow, framed, meter, PALETTE, widthOf } from './style'
import type { Row } from './types'

const text = (rows: readonly Row[]) => rows.map(r => r.map(s => s.text).join(''))

describe('style', () => {
  test('a frame is rounded, its title cut into the top edge, each row padded inside', () => {
    expect(text(framed([[{ text: 'ab' }], [{ text: 'abcdefgh' }]], 9, { title: 'Snake' }))).toEqual(['╭─ Snake ─╮', '│ab       │', '│abcdefgh │', '╰─────────╯'])
    // A title longer than the edge is cut, and the frame keeps its width.
    expect(text(framed([], 6, { title: 'Snake' }))[0]).toBe('╭─ Snak╮')
  })

  test('without a title the top edge is plain; a footer goes in the bottom edge', () => {
    const rows = text(framed([[{ text: 'x' }]], 8, { footer: [{ text: ' 3 s ', fg: PALETTE.good }] }))

    expect(rows).toEqual(['╭────────╮', '│x       │', '╰─ 3 s ──╯'])
    expect(rows.every(r => [...r].length === 10)).toBe(true)
  })

  test('rows are padded or cut to the width; the meter fills its share', () => {
    expect(widthOf(fitRow([{ text: 'ab' }, { text: 'cd' }], 3))).toBe(3)
    expect(widthOf(fitRow([{ text: 'ab' }], 5))).toBe(5)
    expect(meter(0.5, 4, '#ffffff').map(s => s.text).join('')).toBe('▰▰▱▱')
    expect(meter(0, 3, '#ffffff').map(s => s.text).join('')).toBe('▱▱▱')
  })
})
