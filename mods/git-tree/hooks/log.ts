import type { Commit, FileChange, HeadState, Ref } from '../types'

const FIELD = '\x1f'
/** Control characters but the newline: a label holding one is refused, and the pane goes blank. */
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/g

/** Text from the repository as it may be drawn: control characters as spaces. */
export const drawable = (text: string) => text.replace(CONTROL, ' ')

/** What `git log` prints per commit, fields apart by the unit separator. */
export const LOG_FORMAT = ['%H', '%P', '%an', '%at', '%D', '%s'].join('%x1f')

/** `git log` over every local and remote branch and tag, newest first, branches kept together. */
export const logArgs = (limit: number) => ['log', '--exclude=refs/stash', '--all', '--topo-order', '--decorate=full', `--format=${LOG_FORMAT}`, '-n', String(limit)]

/** A decoration with full names: `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1`. */
export const parseRefs = (decoration: string): Ref[] =>
  decoration
    .split(', ')
    .map(d => d.trim())
    .filter(d => d !== '')
    .flatMap((d): Ref[] => {
      if (d === 'HEAD') return [{ kind: 'head', name: '' }]
      if (d.startsWith('HEAD -> refs/heads/')) return [{ kind: 'head', name: d.slice('HEAD -> refs/heads/'.length) }]
      if (d.startsWith('tag: refs/tags/')) return [{ kind: 'tag', name: d.slice('tag: refs/tags/'.length) }]
      if (d.startsWith('refs/heads/')) return [{ kind: 'local', name: d.slice('refs/heads/'.length) }]
      // A remote's HEAD only names its default branch, already shown.
      if (d.startsWith('refs/remotes/') && !d.endsWith('/HEAD')) return [{ kind: 'remote', name: d.slice('refs/remotes/'.length) }]
      return []
    })

export const parseLog = (text: string): Commit[] =>
  text
    .split('\n')
    .filter(line => line.includes(FIELD))
    .flatMap(line => {
      const [sha = '', parents = '', author = '', at = '', decoration = '', ...subject] = line.split(FIELD)
      if (!/^[0-9a-f]{40,64}$/.test(sha)) return []
      return [{ sha, parents: parents.split(' ').filter(p => p !== ''), author: drawable(author), at: Number(at) || 0, subject: drawable(subject.join(FIELD)), refs: parseRefs(decoration) }]
    })

/** `git diff-tree --numstat` lines: `12\t3\tpath`, `-\t-\tpath` for a binary file, renames as git writes them. */
export const parseNumstat = (text: string): FileChange[] =>
  text
    .split('\n')
    .map(line => line.split('\t'))
    .filter(parts => parts.length >= 3)
    .map(([added = '', removed = '', ...path]) => ({
      path: drawable(path.join('\t')),
      added: added === '-' ? null : Number(added),
      removed: removed === '-' ? null : Number(removed),
    }))

/** `git rev-list --left-right --count @{upstream}...HEAD`: behind, then ahead. */
export const parseAheadBehind = (text: string): Pick<HeadState, 'ahead' | 'behind'> => {
  const [behind, ahead] = text.trim().split(/\s+/).map(Number)
  return behind === undefined || ahead === undefined || Number.isNaN(behind) || Number.isNaN(ahead) ? { ahead: null, behind: null } : { ahead, behind }
}

/** The files `git status --porcelain` lists. */
export const changedCount = (porcelain: string) => porcelain.split('\n').filter(l => l.trim() !== '').length
