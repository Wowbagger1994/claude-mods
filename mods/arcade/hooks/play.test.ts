import { describe, expect, test } from 'claude-code/testing'

import { drawDino, mascotRows } from './draw'
import type { SnakePlay } from './games/classics'
import type { Dino } from './games/dino'
import type { Snake } from './games/snake'
import type { BoardProps, Play, Step } from './play'
import { isMoving, newPlay, onKey, onProps, onTick, scoreOf } from './play'

const PROPS: BoardProps = { best: { snake: 30 }, isBusy: true, doneCount: 0, seed: 7, words: [] }

const snakeOf = (p: Play): Snake => (p.state as SnakePlay).snake
const dinoOf = (p: Play): Dino => p.state as Dino
const withSnake = (p: Play, snake: Snake): Play => ({ ...p, state: { snake, since: 0 } })
const SIZE = { columns: 80, rows: 24 }

const keys = (p: Play, ...pressed: string[]): Play => pressed.reduce((acc, k) => onKey(acc, k, PROPS, SIZE).play, p)
const ticks = (p: Play, ms: number): Step[] =>
  Array.from({ length: ms / 50 }).reduce<Step[]>(steps => {
    const last = steps[steps.length - 1]?.play ?? p
    return [...steps, onTick(last, 50, PROPS)]
  }, [])

describe('menu', () => {
  test('moves the cursor round the eleven games and starts the one picked, by number or letter', () => {
    const p = newPlay(PROPS)

    expect(keys(p, 'down', 'down').cursor).toBe(2)
    expect(keys(p, 'up').cursor).toBe(10)
    expect(keys(p, '8')).toMatchObject({ screen: 'playing', game: 'typing' })
    expect(keys(p, '9')).toMatchObject({ screen: 'playing', game: 'breakout' })
    expect(keys(p, 'b')).toMatchObject({ screen: 'playing', game: 'maze' })
    expect(keys(p, 'c').screen).toBe('menu')
    expect(keys(p, '0').screen).toBe('menu')
    expect(keys(p, 'down', 'return')).toMatchObject({ screen: 'playing', game: '2048' })
    expect(keys(p, '3')).toMatchObject({ screen: 'playing', game: 'dino' })
  })

  test('sizes the snake board to the region and seeds each game differently', () => {
    const first = keys(newPlay(PROPS), '1')
    const again = keys({ ...first, screen: 'menu' }, '1')

    expect([snakeOf(first).width, snakeOf(first).height]).toEqual([30, 16])
    expect(snakeOf(again).food).not.toEqual(snakeOf(first).food)
  })
})

describe('playing', () => {
  test('the snake moves on the clock and turns with arrows or WASD', () => {
    const p = keys(newPlay(PROPS), '1')
    const head = snakeOf(p).body[0]!
    const moved = ticks(p, 150).pop()!.play
    const turned = ticks(keys(p, 'w'), 150).pop()!.play

    expect(snakeOf(moved).body[0]).toEqual({ x: head.x + 1, y: head.y })
    expect(snakeOf(turned).body[0]).toEqual({ x: head.x, y: head.y - 1 })
  })

  test('2048 moves on keys only', () => {
    const p = keys(newPlay(PROPS), '2')

    expect(isMoving(p)).toBe(false)
    expect(onTick(p, 50, PROPS).play).toBe(p)
  })

  test('the dino jumps with space or up', () => {
    const p = keys(newPlay(PROPS), '3')

    expect(dinoOf(keys(p, ' ')).vy).toBeGreaterThan(0)
    expect(dinoOf(keys(p, 'up')).vy).toBeGreaterThan(0)
  })

  test('p pauses and the clock stops; Invio resumes, m goes to the menu', () => {
    const paused = keys(keys(newPlay(PROPS), '1'), 'p')

    expect(paused).toMatchObject({ screen: 'paused', pausedBy: 'you' })
    expect(onTick(paused, 500, PROPS).play).toBe(paused)
    expect(keys(paused, 'return').screen).toBe('playing')
    expect(keys(paused, 'm').screen).toBe('menu')
  })
})

describe('game over', () => {
  // A snake one cell from the right wall: the next step ends it with 40 points.
  const ending = (): Play => {
    const p = keys(newPlay(PROPS), '1')
    const snake = snakeOf(p)
    const y = snake.body[0]!.y
    return withSnake(p, { ...snake, score: 40, body: [{ x: snake.width - 1, y }, { x: snake.width - 2, y }], food: { x: 0, y: 0 } })
  }

  test('hands on the score once and flags a record', () => {
    const steps = ticks(ending(), 500)
    const scores = steps.flatMap(s => (s.score === null ? [] : [s.score]))

    expect(scores).toEqual([{ game: 'snake', score: 40 }])
    expect(steps.pop()!.play).toMatchObject({ screen: 'over', isRecord: true })
  })

  test('a score below the record is no record', () => {
    const over = ticks(withSnake(ending(), { ...snakeOf(ending()), score: 10 }), 200).pop()!.play

    expect(over.isRecord).toBe(false)
    expect(scoreOf(over)).toBe(10)
  })

  test('a key pressed right as it ends does not restart; one after a moment does', () => {
    const justOver = ticks(ending(), 200).pop()!.play
    const later = ticks(justOver, 600).pop()!.play

    expect(keys(justOver, 'return').screen).toBe('over')
    expect(keys(later, 'return').screen).toBe('playing')
    expect(isMoving(later)).toBe(false)
  })
})

describe('Claude finishing', () => {
  test('pauses a game in progress once, and leaves the menu alone', () => {
    const playing = keys(newPlay(PROPS), '1')
    const paused = onProps(playing, { ...PROPS, doneCount: 1 })

    expect(paused).toMatchObject({ screen: 'paused', pausedBy: 'claude', seenDone: 1 })
    expect(onProps(paused, { ...PROPS, doneCount: 1 })).toBe(paused)
    expect(onProps(newPlay(PROPS), { ...PROPS, doneCount: 1 })).toMatchObject({ screen: 'menu', seenDone: 1 })
  })
})

describe('mascot', () => {
  test('is drawn in Claude’s orange, three rows tall, and steps while it runs', () => {
    const p = keys(newPlay(PROPS), '3')
    const frames = ticks(p, 400).map(s => mascotRows(dinoOf(s.play))[2])
    const drawn = drawDino(dinoOf(p))
    const body = drawn.flat().filter(span => span.fg === '#d97757').map(span => span.text).join('')

    expect(mascotRows(dinoOf(p)).slice(0, 2)).toEqual([' ▐▛███▜▌ ', '▝▜█████▛▘'])
    expect(new Set(frames).size).toBe(2)
    expect(body).toContain('▐▛███▜▌')
    expect(mascotRows(dinoOf(keys(p, ' ')))[2]).toBe('  ▘▘ ▝▝  ')
  })
})
