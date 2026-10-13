import { describe, expect, test } from 'claude-code/testing'

import type { Grid, Maze } from './maze'
import {
  carveMaze,
  CLEARED_MS,
  EXIT,
  HEADINGS,
  keyMaze,
  LEVEL_POINTS,
  MAZE,
  newMaze,
  OPEN,
  pointsFor,
  RADIUS,
  SECOND_POINTS,
  sizeOf,
  STEP,
  tickMaze,
  timeLimitOf,
  WALL,
} from './maze'
import { castRay, frameColorOf, MAP, shadeOf, wallSpan } from './maze-view'
import { PALETTE, widthOf } from './style'
import type { Row, Span } from './types'

const SEED = { seed: 11 }
const fresh = (columns = 80, rows = 20): Maze => newMaze(columns, rows, SEED)

/** A walled room 7×7 with the door on the east wall of its bottom row. */
const ROOM: Grid = ['#######', '#     #', '#     #', '#     #', '#     #', '#     E', '#######']
/** The player in ROOM at (x, y), looking along `heading`, past the opening hint. */
const inRoom = (x: number, y: number, heading: number): Maze => ({
  ...fresh(),
  grid: ROOM,
  visited: Array<boolean>(49).fill(false),
  x,
  y,
  heading,
  playedMs: 10_000,
})
const EAST = 0
const SOUTH = HEADINGS / 4
/** A number to the thousandth, for positions and distances worked out in floating point. */
const round = (n: number) => Math.round(n * 1000) / 1000
const press = (g: Maze, ...keys: string[]) => keys.reduce(keyMaze, g)
const run = (g: Maze, ms: number) => Array.from({ length: Math.ceil(ms / 50) }).reduce<Maze>(acc => tickMaze(acc, 50), g)

type Cell = { ch: string; fg?: string; bg?: string }
/** A drawn row cell by cell. */
const cellsOf = (row: Row): Cell[] => row.flatMap(s => [...s.text].map(ch => ({ ch, fg: s.fg, bg: s.bg })))
const textOf = (rows: Row[]) => rows.map(r => r.map(s => s.text).join(''))
/** The view inside the frame: rows of cells, without the frame's edges. */
const viewOf = (g: Maze): Cell[][] => MAZE.draw(g).slice(1, -1).map(r => cellsOf(r).slice(1, -1))
const WALL_GLYPHS = '█▓▒░▏'
/** Rows of the view's middle column that show a wall's body. */
const wallRows = (g: Maze): number => {
  const view = viewOf({ ...g, showMap: false })
  const mid = Math.floor(view[0]!.length / 2)
  return view.filter(row => WALL_GLYPHS.includes(row[mid]!.ch)).length
}
const brightness = (hex: string) => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0)
const isGreen = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return g! > r! * 1.5 && g! > b! * 1.5
}

/** Open cells reached from (1, 1) through open cells. */
const reachable = (grid: Grid): Set<string> => {
  const seen = new Set(['1,1'])
  const queue = [[1, 1]]
  while (queue.length > 0) {
    const [x, y] = queue.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nx, ny] = [x! + dx!, y! + dy!]
      if (grid[ny]?.[nx] === OPEN && !seen.has(`${nx},${ny}`)) {
        seen.add(`${nx},${ny}`)
        queue.push([nx, ny])
      }
    }
  }
  return seen
}

describe('labirinto: the maze', () => {
  test('is perfect: every room open, all reached from the start, and exactly one path between two rooms', () => {
    for (const size of [9, 11, 13]) {
      for (const seed of [1, 2, 3, 11]) {
        const [grid] = carveMaze(size, { seed })
        const rooms = ((size - 1) / 2) ** 2
        const open = grid.join('').split('').filter(c => c === OPEN).length

        expect(grid.every(row => row.length === size)).toBe(true)
        for (let y = 1; y < size; y += 2) for (let x = 1; x < size; x += 2) expect(grid[y]![x]).toBe(OPEN)
        // A tree over the rooms: the rooms and one passage fewer than them, all connected.
        expect(open).toBe(2 * rooms - 1)
        expect(reachable(grid).size).toBe(open)
      }
    }
  })

  test('is walled all round but for the door, in the east wall beside the far corner room', () => {
    const [grid] = carveMaze(11, SEED)
    const border = grid.flatMap((row, y) => [...row].flatMap((c, x) => (x === 0 || y === 0 || x === 10 || y === 10 ? [c] : [])))

    expect(border.filter(c => c === EXIT)).toHaveLength(1)
    expect(border.filter(c => c !== WALL && c !== EXIT)).toEqual([])
    expect(grid[9]![10]).toBe(EXIT)
    expect(reachable(grid).has('9,9')).toBe(true)
  })

  test('the same seed carves the same maze; another seed, another one', () => {
    const mazes = [1, 2, 3, 4, 5].map(seed => carveMaze(9, { seed })[0].join(''))

    expect(carveMaze(9, { seed: 1 })[0]).toEqual(carveMaze(9, { seed: 1 })[0])
    expect(new Set(mazes).size).toBeGreaterThan(3)
  })

  test('grows two cells a side each level, with more time for a bigger maze', () => {
    expect([1, 2, 3].map(sizeOf)).toEqual([9, 11, 13])
    expect(fresh().grid).toHaveLength(9)
    expect(timeLimitOf(11)).toBeGreaterThan(timeLimitOf(9))
    expect(fresh().timeLeft).toBe(timeLimitOf(9))
  })

  test('the player starts in the top-left room looking down an open corridor', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = newMaze(80, 20, { seed })
      const ahead = g.heading === EAST ? g.grid[1]![2] : g.grid[2]![1]

      expect([g.x, g.y]).toEqual([1.5, 1.5])
      expect([EAST, SOUTH]).toContain(g.heading)
      expect(ahead).toBe(OPEN)
    }
  })
})

describe('labirinto: moving', () => {
  test('↑ (or w) walks a step ahead, ↓ (or s) a step back', () => {
    const g = inRoom(2.5, 2.5, EAST)

    expect(round(press(g, 'up').x)).toBe(round(2.5 + STEP))
    expect(round(press(g, 'w', 'w').x)).toBe(round(2.5 + 2 * STEP))
    expect(round(press(g, 'down').x)).toBe(round(2.5 - STEP))
    expect(round(press(g, 's').y)).toBe(round(2.5))
    expect(round(press(inRoom(2.5, 2.5, SOUTH), 'up').y)).toBe(round(2.5 + STEP))
  })

  test('a wall stops the player short of it, by its half width', () => {
    const g = press(inRoom(2.5, 2.5, EAST), ...Array<string>(20).fill('up'))

    expect(g.x).toBeLessThanOrEqual(6 - RADIUS)
    expect(g.x).toBeGreaterThan(6 - RADIUS - STEP)
    expect(round(g.y)).toBe(round(2.5))
    expect(press(inRoom(1.25, 2.5, EAST), 'down').x).toBe(1.25)
  })

  test('walking at a slant into a wall slides along it', () => {
    // 45° between east and south, against the east wall: x stays, y goes on.
    const atWall = { ...inRoom(5.7, 2.5, 3) }
    const slid = press(atWall, 'up')

    expect(slid.x).toBe(5.7)
    expect(slid.y).toBeGreaterThan(2.5)
  })

  test('← and → (or a and d) turn by a step, all the way round', () => {
    const g = inRoom(2.5, 2.5, EAST)

    expect(press(g, 'right').heading).toBe(1)
    expect(press(g, 'd', 'd').heading).toBe(2)
    expect(press(g, 'left').heading).toBe(HEADINGS - 1)
    expect(press(g, 'a').heading).toBe(HEADINGS - 1)
    expect(press(g, ...Array<string>(HEADINGS).fill('right')).heading).toBe(EAST)
  })

  test('cells walked into are marked as visited', () => {
    const g = inRoom(2.5, 2.5, EAST)
    const walked = press(g, 'up', 'up', 'up', 'up')

    expect(g.visited.filter(Boolean)).toHaveLength(0)
    expect([walked.visited[2 * 7 + 2], walked.visited[2 * 7 + 3]]).toEqual([true, true])
    expect(walked.visited.filter(Boolean)).toHaveLength(2)
  })

  test('m shows and hides the minimap; other keys do nothing', () => {
    const g = inRoom(2.5, 2.5, EAST)

    expect(press(g, 'm').showMap).toBe(!g.showMap)
    expect(press(g, 'm', 'm').showMap).toBe(g.showMap)
    expect(press(g, 'x', ' ', 'return')).toEqual(g)
  })
})

describe('labirinto: the exit and the clock', () => {
  test('walking into the door scores the level and the seconds left, and celebrates', () => {
    const g = { ...inRoom(5.5, 5.5, EAST), timeLeft: 12_345 }
    const out = press(g, 'up', 'up', 'up')

    expect(out.cleared).toEqual({ points: LEVEL_POINTS + SECOND_POINTS * 12, ms: CLEARED_MS })
    expect(out.score).toBe(pointsFor(1, 12_345))
    expect(pointsFor(3, 12_345)).toBe(3 * LEVEL_POINTS + 12 * SECOND_POINTS)
  })

  test('while it celebrates, the clock stops and moves are ignored; then comes the next, bigger maze', () => {
    const out = press({ ...inRoom(5.5, 5.5, EAST), score: 40 }, 'up', 'up', 'up')
    const during = run(out, CLEARED_MS - 100)
    const next = run(out, CLEARED_MS)

    expect(during.timeLeft).toBe(out.timeLeft)
    expect(press(during, 'left', 'up')).toEqual(during)
    expect(next.level).toBe(2)
    expect(next.grid).toHaveLength(11)
    expect([next.x, next.y, next.cleared]).toEqual([1.5, 1.5, null])
    expect(next.timeLeft).toBe(timeLimitOf(11))
    expect(next.score).toBe(out.score)
    expect(next.isOver).toBe(false)
  })

  test('the clock runs down; at zero the game is over and nothing moves any more', () => {
    const g = fresh()
    const later = run(g, 1_000)
    const over = run(g, g.timeLimit)

    expect(later.timeLeft).toBe(g.timeLimit - 1_000)
    expect(over.isOver).toBe(true)
    expect(MAZE.isOver(over)).toBe(true)
    expect(press(over, 'up', 'left', 'm')).toBe(over)
    expect(tickMaze(over, 50)).toBe(over)
    expect(MAZE.status?.(later)).toBe(`livello 1 · ${Math.ceil(later.timeLeft / 1000)} s`)
  })
})

describe('labirinto: the view', () => {
  test('a ray stops at the first wall, its distance measured along the view', () => {
    const hit = castRay(ROOM, 1.5, 2.5, 1, 0)
    const door = castRay(ROOM, 3.5, 5.5, 1, 0)
    const slant = castRay(ROOM, 3.5, 3.5, 1, 0.5)

    expect(hit).toMatchObject({ side: 'x', isExit: false })
    expect(round(hit.dist)).toBe(round(4.5))
    expect(door.isExit).toBe(true)
    expect(round(door.dist)).toBe(round(2.5))
    expect(round(slant.dist)).toBe(round(2.5))
  })

  test('nearer walls stand taller', () => {
    const [nearTop, nearBottom] = wallSpan(36, 1)
    const [farTop, farBottom] = wallSpan(36, 3)

    expect(nearBottom - nearTop).toBeGreaterThan(farBottom - farTop)
    expect(wallRows(inRoom(4.5, 3.5, EAST))).toBeGreaterThan(wallRows(inRoom(1.5, 3.5, EAST)))
  })

  test('walls fade with distance: solid and bright near, thin and dark far; the two faces in two tones', () => {
    const near = shadeOf({ dist: 1, side: 'x', along: 0.5, isExit: false })
    const far = shadeOf({ dist: 9, side: 'x', along: 0.5, isExit: false })
    const other = shadeOf({ dist: 1, side: 'y', along: 0.5, isExit: false })

    expect([near.ch, shadeOf({ dist: 2, side: 'x', along: 0.5, isExit: false }).ch, shadeOf({ dist: 4, side: 'x', along: 0.5, isExit: false }).ch, far.ch]).toEqual(['█', '▓', '▒', '░'])
    expect(brightness(near.fg)).toBeGreaterThan(brightness(far.fg))
    expect(other.fg).not.toBe(near.fg)
    const view = viewOf({ ...inRoom(1.5, 3.5, EAST), showMap: false })
    const mid = Math.floor(view[0]!.length / 2)
    expect(view[Math.floor(view.length / 2)]![mid]!.ch).toBe('▒')
  })

  test('the door glows green, brighter every other beat', () => {
    const g = inRoom(3.5, 5.5, EAST)
    const middle = (m: Maze) => {
      const view = viewOf({ ...m, showMap: false })
      return view[Math.floor(view.length / 2)]![Math.floor(view[0]!.length / 2)]!
    }

    expect(isGreen(middle(g).fg!)).toBe(true)
    expect(isGreen(middle({ ...g, heading: SOUTH * 3 }).fg!)).toBe(false)
    expect(middle({ ...g, playedMs: 10_400 }).fg).not.toBe(middle(g).fg)
  })

  test('a dark ceiling over a floor lit nearer, with dots fixed in the maze that slide past as you walk', () => {
    const g = { ...inRoom(1.5, 3.5, EAST), showMap: false }
    const view = viewOf(g)
    const dots = (v: Cell[][]) => v.flatMap((row, r) => row.flatMap((c, x) => (c.ch === '·' ? [`${x},${r}`] : [])))
    /** Each row's ceiling or floor colour, where the row shows any. */
    const surface = (rows: Cell[][]) => rows.flatMap(row => row.filter(c => c.ch === ' ' || c.ch === '·').slice(0, 1).map(c => c.bg!))
    const ceiling = surface(view.slice(0, view.length / 2))
    const floor = surface(view.slice(view.length / 2))

    expect(brightness(ceiling[0]!)).toBeGreaterThan(brightness(ceiling[ceiling.length - 1]!))
    expect(brightness(floor[floor.length - 1]!)).toBeGreaterThan(brightness(floor[0]!))
    expect(dots(view).length).toBeGreaterThan(3)
    expect(dots(viewOf(press(g, 'up')))).not.toEqual(dots(view))
  })

  test('the meeting of two wall cells shows as a thin seam', () => {
    const view = viewOf({ ...inRoom(1.5, 3.5, EAST), showMap: false })

    expect(view.some(row => row.some(c => c.ch === '▏'))).toBe(true)
  })

  test('the minimap, top right: the player as an arrow where it looks, the walked cells, the door', () => {
    const g = press(fresh(), 'up', 'up', 'up', 'up')
    const cells = viewOf(g).flat()
    const arrow = (heading: number) => viewOf({ ...g, heading }).flat().find(c => '▶▼◀▲'.includes(c.ch))?.ch

    expect([arrow(0), arrow(SOUTH), arrow(2 * SOUTH), arrow(3 * SOUTH)]).toEqual(['▶', '▼', '◀', '▲'])
    expect(cells.some(c => c.ch === '▀' && (c.fg === MAP.seen || c.bg === MAP.seen))).toBe(true)
    expect(cells.some(c => c.ch === '▀' && (c.fg === PALETTE.good || c.bg === PALETTE.good))).toBe(true)
    const row = viewOf(g).find(r => r.some(c => '▶▼◀▲'.includes(c.ch)))!
    expect(row.findIndex(c => '▶▼◀▲'.includes(c.ch))).toBeGreaterThan(row.length / 2)
    expect(viewOf(press(g, 'm')).flat().some(c => '▶▼◀▲'.includes(c.ch))).toBe(false)
  })

  test('a big maze in a small view: the minimap shows the part around the player', () => {
    const small = newMaze(40, 12, SEED)
    // In the far corner room of a 17×17 maze, looking west, away from the door.
    const g = { ...small, ...carveInto(small, 17), x: 15.5, y: 15.5, heading: 2 * SOUTH }
    const view = viewOf(g)
    const arrowRow = view.findIndex(row => row.some(c => '▶▼◀▲'.includes(c.ch)))

    expect(arrowRow).toBeGreaterThanOrEqual(0)
    expect(view.flat().some(c => c.fg === PALETTE.good || c.bg === PALETTE.good)).toBe(true)
  })

  test('the title has the level; the bottom edge the clock and a compass', () => {
    const rows = textOf(MAZE.draw(fresh()))
    const turned = textOf(MAZE.draw(press(fresh(), 'right', 'right', 'right')))

    expect(rows[0]).toMatch(/^╭─ livello 1 ─+╮$/)
    expect(rows[rows.length - 1]).toMatch(/^╰─ ▰+ \d+ s ─+ (E|S) ─╯$/)
    expect(textOf(MAZE.draw({ ...fresh(), heading: 0 })).slice(-1)[0]).toMatch(/ E ─╯$/)
    expect(textOf(MAZE.draw({ ...fresh(), heading: 18 })).slice(-1)[0]).toMatch(/ N ─╯$/)
    expect(textOf(MAZE.draw({ ...fresh(), heading: 9 })).slice(-1)[0]).toMatch(/ SO ─╯$/)
    expect(turned.slice(-1)[0]).toMatch(/ (SE|SO) ─╯$/)
  })

  test('the clock turns the frame amber, then red, as time runs out', () => {
    const g = fresh()
    const at = (share: number) => ({ ...g, timeLeft: g.timeLimit * share })
    const footColor = (m: Maze) => MAZE.draw(m).slice(-1)[0]!.find(s => s.text.includes('▰'))?.fg

    expect(frameColorOf(at(0.8))).toBe(PALETTE.frame)
    expect(frameColorOf(at(0.25))).toBe(PALETTE.hurry)
    expect(frameColorOf(at(0.1))).toBe(PALETTE.danger)
    expect(MAZE.draw(at(0.25))[0]![0]!.fg).toBe(PALETTE.hurry)
    expect(footColor(at(0.25))).toBe(PALETTE.hurry)
    expect(footColor(at(0.1))).toBe(PALETTE.danger)
  })

  test('at the exit the frame lights green with the points and the next level; at the end, red with the time out', () => {
    const out = press(inRoom(5.5, 5.5, EAST), 'up', 'up', 'up')
    const rows = textOf(MAZE.draw(out))
    const over = run(fresh(), fresh().timeLimit)

    expect(MAZE.draw(out)[0]![0]!.fg).toBe(PALETTE.good)
    expect(rows.slice(-1)[0]).toContain(`+${out.cleared!.points} uscita!`)
    expect(rows.some(r => r.includes('USCITA!'))).toBe(true)
    expect(rows.some(r => r.includes('prossimo: livello 2'))).toBe(true)
    expect(MAZE.draw(over)[0]![0]!.fg).toBe(PALETTE.danger)
    expect(textOf(MAZE.draw(over)).some(r => r.includes('tempo scaduto'))).toBe(true)
  })

  test('a new maze says what to look for, for a moment', () => {
    const hint = (g: Maze) => textOf(MAZE.draw(g)).some(r => r.includes('trova la porta verde'))

    expect(hint(fresh())).toBe(true)
    expect(hint(run(fresh(), 3_000))).toBe(false)
    expect(hint(fresh(30, 12))).toBe(true)
  })

  test('fits the room: every row as wide as the columns, as many rows as given', () => {
    for (const columns of [30, 40, 80, 100, 140]) {
      for (const rows of [12, 20, 30]) {
        const g = newMaze(columns, rows, SEED)
        for (const state of [g, press(g, 'up', 'right'), run(press(inRoom(5.5, 5.5, EAST), 'up', 'up', 'up'), 0), run(g, g.timeLimit)]) {
          const drawn = MAZE.draw({ ...state, columns, rows })
          expect(drawn).toHaveLength(rows)
          expect(drawn.every(r => widthOf(r) === columns)).toBe(true)
        }
      }
    }
  })
})

/** A maze `size` a side carved into the game, the visited cells sized to it. */
function carveInto(g: Maze, size: number): Pick<Maze, 'grid' | 'visited'> {
  const [grid] = carveMaze(size, g.rng)
  return { grid, visited: Array<boolean>(size * size).fill(true) }
}

const HEX = /^#[0-9a-f]{6}$/i
/** As in catalog.test.ts: wide or zero-width characters the terminal would draw out of step with the cells. */
const isOneColumn = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  const isWide = cp > 0xffff || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)
  const isZeroWidth = (cp >= 0x0300 && cp <= 0x036f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)
  return cp >= 0x20 && !isWide && !isZeroWidth
}

describe('labirinto in the catalog', () => {
  test('draws only one-column characters and hex colours while played', () => {
    const keys = ['up', 'up', 'left', 'up', 'right', 'right', 'down', 'm', 'w', 'a', 'd', 's', 'm', ' ']
    let g = MAZE.create({ columns: 100, rows: 30, rng: SEED, words: [] })
    const frames: Row[][] = [MAZE.draw(g)]
    for (let i = 0; i < 80 && !MAZE.isOver(g); i++) {
      g = MAZE.key(g, keys[i % keys.length]!)
      g = MAZE.tick!(g, 50)
      frames.push(MAZE.draw(g))
    }
    frames.push(MAZE.draw(press(inRoom(5.5, 5.5, EAST), 'up', 'up', 'up')), MAZE.draw(run(fresh(), fresh().timeLimit)))
    const spans: Span[] = frames.flat(2)
    const badChars = [...new Set(spans.flatMap(s => [...s.text].filter(ch => !isOneColumn(ch))))]
    const badColours = [...new Set(spans.flatMap(s => [s.fg, s.bg]).filter((c): c is string => c !== undefined && !HEX.test(c)))]

    expect(MAZE.id).toBe('maze')
    expect(MAZE.name).toBe('Labirinto 3D')
    expect(badChars).toEqual([])
    expect(badColours).toEqual([])
  })
})
