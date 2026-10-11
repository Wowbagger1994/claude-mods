import type { ClientModule, ClientSurface } from 'claude-code'

import { gameOf } from './games/catalog'
import type { Row } from './games/types'
import type { BoardProps, Play, Step } from './play'
import { CHROME_ROWS, drawOf, GAMES, isMoving, newPlay, onKey, onProps, onTick, pauseKeyOf, scoreOf, statusOf } from './play'

/** 20 frames a second: smooth enough for the dino, light on the terminal. */
const TICK_MS = 50
/** The least room a game gets, however small the pane. */
const MIN_GAME_ROWS = 12
const BUSY = '#f59e0b'
const DONE = '#22c55e'

type Surface = ClientSurface<Play>
type Elements = Surface['elements']

/** Applies a step: redraws, and hands a finished game's score to the hooks module for the record. */
const apply = (surface: Surface, step: Step) => {
  if (step.play !== surface.state) surface.setState(step.play)
  if (step.score !== null) surface.post({ kind: 'score', game: step.score.game, score: step.score.score })
}

const rows = (el: Elements, lines: Row[]) =>
  lines.map((line, r) => (
    <el.Text key={`r${r}`} wrap="truncate-end">
      {line.map((span, i) => (
        <el.Text key={`s${i}`} color={span.fg} backgroundColor={span.bg} bold={span.bold}>
          {span.text}
        </el.Text>
      ))}
    </el.Text>
  ))

const claudeLine = (el: Elements, props: BoardProps) =>
  props.isBusy ? (
    <el.Text color={BUSY}>● Claude sta lavorando…</el.Text>
  ) : (
    <el.Text color={DONE}>✓ Claude ha finito: Esc torna al prompt</el.Text>
  )

const menu = (el: Elements, p: Play, props: BoardProps) => (
  <el.Box flexDirection="column">
    <el.Text bold>Scegli un gioco</el.Text>
    {GAMES.map((g, i) => (
      <el.Text key={g.id} color={i === p.cursor ? 'claude' : undefined} bold={i === p.cursor}>
        {`${i === p.cursor ? '▶' : ' '} ${i + 1}. ${g.name.padEnd(18)} record ${props.best[g.id] ?? 0}`}
      </el.Text>
    ))}
    <el.Text dimColor>{`↑↓ scegli · Invio gioca · 1–${GAMES.length} per partire subito`}</el.Text>
  </el.Box>
)

const message = (el: Elements, p: Play) => {
  const def = gameOf(p.game)
  const pauseKey = pauseKeyOf(def) === 'tab' ? 'Tab' : 'p'
  if (p.screen === 'paused') {
    const why = p.pausedBy === 'claude' ? 'Claude ha finito: partita in pausa.' : 'In pausa.'
    return <el.Text color="warning">{`${why} Invio riprende · m menu`}</el.Text>
  }
  if (p.screen === 'over') {
    const record = p.isRecord ? ' Nuovo record!' : ''
    return <el.Text color={p.isRecord ? DONE : 'warning'} bold>{`Partita finita: ${scoreOf(p)} punti.${record} Invio rigioca · m menu`}</el.Text>
  }
  return <el.Text dimColor>{`${def.keys} · ${pauseKey} pausa · Esc torna al prompt`}</el.Text>
}

const game = (el: Elements, p: Play, props: BoardProps) => {
  const status = statusOf(p)
  return (
    <el.Box flexDirection="column">
      <el.Text>
        <el.Text bold>{gameOf(p.game).name}</el.Text>
        <el.Text>{`  punti ${scoreOf(p)}`}</el.Text>
        <el.Text dimColor>{`  record ${props.best[p.game] ?? 0}`}</el.Text>
        {status !== '' && <el.Text color="claude">{`  ${status}`}</el.Text>}
      </el.Text>
      {rows(el, drawOf(p))}
      {message(el, p)}
    </el.Box>
  )
}

/** The arcade: a menu, then the game picked, driven by the frame clock and the keys. */
const Board: ClientModule<BoardProps, Play> = (props, surface) => {
  const el = surface.elements
  const size = () => ({ columns: surface.columns, rows: Math.max(surface.rows, CHROME_ROWS + MIN_GAME_ROWS) })
  if (surface.state === undefined) {
    surface.every(TICK_MS, () => {
      const p = surface.state
      if (p !== undefined && isMoving(p)) apply(surface, onTick(p, TICK_MS, latest.props))
    })
    surface.onKey(k => {
      const p = surface.state
      if (p !== undefined) apply(surface, onKey(p, k.key, latest.props, size()))
    })
    surface.setState(newPlay(props))
  }
  latest.props = props
  const p = surface.state ?? newPlay(props)
  const seen = onProps(p, props)
  if (seen !== p) surface.setState(seen)

  return (
    <el.Box flexDirection="column">
      {claudeLine(el, props)}
      {seen.screen === 'menu' ? menu(el, seen, props) : game(el, seen, props)}
    </el.Box>
  )
}

/** The props of the last call: what the timer and the key handler, set up once, read. */
const latest: { props: BoardProps } = { props: { best: {}, isBusy: false, doneCount: 0, seed: 1, words: [] } }

export default Board
