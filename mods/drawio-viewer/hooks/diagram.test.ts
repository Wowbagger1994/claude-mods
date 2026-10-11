import { describe, expect, test } from 'claude-code/testing'

import {
  EMPTY_DIAGRAM,
  exportArgv,
  fitImage,
  isCompressed,
  isDrawioPath,
  lastLine,
  pageCount,
  parseSips,
  previewName,
  upsert,
} from './diagram'

const TWO_PAGES =
  '<mxfile><diagram id="a" name="A"><mxGraphModel><root/></mxGraphModel></diagram><diagram id="b"><mxGraphModel/></diagram></mxfile>'
const COMPRESSED = '<mxfile><diagram id="a" name="A">7VhNb9swDP01PmaQ5Y85xzbptgLdUKCHtTtpthILkK1AUpqkv36UTclfSdMMw4AWuRgiRT1KJN8jFMeSV5uviq7KHzJnPCJBvonIt4iQj9MRfC3jUPWSGMMNlUZJxVlnz0cLn7NdUOhxNs7KN1q5Ki6VPVDOT03JVWCNbXRl0aYx3Dg/zF4bbLWqT+SBXj9eqjRg8KumC7NZiX9mF9ktUsnGNrkvK/LbFsnlx8zqbGr+VpL4aFt5c6j9PQ0/PJnx9tbOcW8SZWszH6bj3TeNpgMbplIy85Lm4Y+qgxZD9mNX+jyKxs5+uWR8VQDy1G/2FXiGVTJIcnXNg2Jr9iCSOaAbYJfEuQqoBVXa2ILqrPpm4sZQ3+sZMJ1LGpumMfuj/3evurNJVF6ZSMZZ0v/9uf0Ba</diagram></mxfile>'

describe('reading a diagram file', () => {
  test('counts its pages, at least one', async () => {
    expect(pageCount(TWO_PAGES)).toBe(2)
    expect(pageCount(EMPTY_DIAGRAM)).toBe(1)
    expect(pageCount('')).toBe(1)
  })

  test('tells a compressed file from an XML one', async () => {
    expect(isCompressed(COMPRESSED)).toBe(true)
    expect(isCompressed(TWO_PAGES)).toBe(false)
    expect(isCompressed(EMPTY_DIAGRAM)).toBe(false)
    expect(isCompressed('<mxfile><diagram id="a"><mxGraphModel/></diagram></mxfile>')).toBe(false)
  })

  test('previews only .drawio files', async () => {
    expect(isDrawioPath('/r/docs/architettura.drawio')).toBe(true)
    expect(isDrawioPath('/r/docs/architettura.drawio.svg')).toBe(false)
    expect(isDrawioPath('/r/app.js')).toBe(false)
  })
})

describe('exporting', () => {
  test('asks draw.io for one page as PNG at the given path', async () => {
    const argv = exportArgv('/r/a.drawio', 2, '/c/a-p2.png')

    expect(argv[0]).toBe('/Applications/draw.io.app/Contents/MacOS/draw.io')
    expect(argv.slice(1, 4)).toEqual(['--export', '--format', 'png'])
    expect(argv.slice(-5)).toEqual(['--page-index', '2', '--output', '/c/a-p2.png', '/r/a.drawio'])
  })

  test('names the preview after the path and page, with only safe characters', async () => {
    expect(previewName('/Users/me/Repos/x/my diagram.drawio', 3)).toBe('Users_me_Repos_x_my_diagram.drawio-p3.png')
  })

  test('reads the PNG size from sips', async () => {
    const out = '/c/a.png\n  pixelWidth: 1200\n  pixelHeight: 600\n'

    expect(parseSips(out)).toEqual({ width: 1200, height: 600 })
    expect(parseSips('Error')).toBe(null)
  })

  test('keeps the last line of an error, short', async () => {
    expect(lastLine('warning\nError: file not found\n')).toBe('Error: file not found')
    expect(lastLine('')).toBe('errore sconosciuto')
  })
})

describe('fitImage', () => {
  test('a wide picture fills the width, half as many rows as its shape says', async () => {
    // 1000x500 is 2:1; cells are twice as tall as wide, so 100 columns take 25 rows
    expect(fitImage(1000, 500, 100, 60)).toEqual({ columns: 100, rows: 25 })
  })

  test('a tall picture is held to the rows and narrowed to keep its shape', async () => {
    expect(fitImage(500, 1000, 100, 20)).toEqual({ columns: 20, rows: 20 })
  })

  test('never asks for more than 255 cells either way', async () => {
    const size = fitImage(10_000, 100, 400, 400)

    expect(size.columns).toBeLessThanOrEqual(255)
    expect(size.rows).toBeGreaterThanOrEqual(1)
  })
})

describe('upsert', () => {
  test('adds a new diagram ready to export, or changes the one there, never mutating', async () => {
    const one = upsert([], '/r/a.drawio', d => d)
    const two = upsert(one, '/r/a.drawio', d => ({ ...d, page: 2 }))

    expect(one[0]?.status).toBe('exporting')
    expect(two.length).toBe(1)
    expect(two[0]?.page).toBe(2)
    expect(one[0]?.page).toBe(1)
  })
})
