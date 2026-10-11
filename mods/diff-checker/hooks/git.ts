import type { RepoInfo } from './diff'

/** The folder a file is in: what git is asked from. */
export const dirOf = (filePath: string): string => filePath.slice(0, filePath.lastIndexOf('/')) || '/'

/** The argv that asks git for a folder's worktree root and branch, one per line. */
export const revParseArgv = (dir: string): string[] => ['git', '-C', dir, 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD']

/** Reads `git rev-parse --show-toplevel --abbrev-ref HEAD`; a detached HEAD has no branch. */
export const parseRevParse = (exitCode: number, stdout: string): RepoInfo | null => {
  if (exitCode !== 0) return null
  const [root, branch] = stdout.trim().split('\n')
  if (root === undefined || root === '') return null

  return { root, branch: branch === undefined || branch === '' || branch === 'HEAD' ? null : branch }
}
