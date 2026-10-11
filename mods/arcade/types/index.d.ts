/** The games of the arcade. */
export type GameId = 'snake' | '2048' | 'dino' | 'bugs' | 'flappy' | 'typing' | 'tetris' | 'mines'

declare module 'claude-code' {
  interface PluginState {
    arcade: {
      /** The best score of each game played. */
      best: Partial<Record<GameId, number>>
      /** Claude is working on a turn of the main conversation. */
      isBusy: boolean
      /** Turns ended so far: the board pauses a game when it grows. */
      doneCount: number
      /** Names from the files Claude edited lately, newest first: the typing game's words. */
      words: string[]
    }
  }
}
