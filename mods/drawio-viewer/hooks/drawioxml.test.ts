import { describe, expect, test } from 'claude-code/testing'

import { labelText, pagesOf, parseModel, parseStyle } from './drawioxml'
import { drawDiagram } from './textview'

const PAGE = [
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>',
  '<mxCell id="g" value="" style="group" vertex="1" parent="1"><mxGeometry x="100" y="50" width="300" height="200" as="geometry"/></mxCell>',
  '<mxCell id="a" value="cart.js&lt;br&gt;&lt;i&gt;carrello&lt;/i&gt;" style="rounded=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="g"><mxGeometry x="10" y="20" width="120" height="60" as="geometry"/></mxCell>',
  '<UserObject label="Utente" id="u"><mxCell style="ellipse;" vertex="1" parent="1"><mxGeometry x="0" y="400" width="80" height="80" as="geometry"/></mxCell></UserObject>',
  '<mxCell id="e" style="dashed=1;endArrow=none;" edge="1" parent="1" source="a" target="u"><mxGeometry relative="1" as="geometry"/></mxCell>',
  '<mxCell id="el" value="usa" style="edgeLabel;" vertex="1" connectable="0" parent="e"><mxGeometry x="0" y="0" relative="1" as="geometry"/></mxCell>',
  '</root></mxGraphModel>',
].join('')

describe('parseModel', () => {
  test('reads shapes with absolute positions, a group moving its children', async () => {
    const cart = parseModel(PAGE).vertices.find(v => v.id === 'a')

    expect([cart?.x, cart?.y, cart?.width, cart?.height]).toEqual([110, 70, 120, 60])
    expect(cart?.label).toBe('cart.js\ncarrello')
    expect([cart?.fill, cart?.stroke, cart?.isRounded]).toEqual(['#d5e8d4', '#82b366', true])
  })

  test('takes a UserObject’s id and label, and the shape from the style', async () => {
    const user = parseModel(PAGE).vertices.find(v => v.id === 'u')

    expect([user?.label, user?.shape]).toEqual(['Utente', 'ellipse'])
  })

  test('folds an edge’s label child into the edge and keeps it out of the shapes', async () => {
    const model = parseModel(PAGE)
    const edge = model.edges[0]

    expect(model.vertices.map(v => v.id).sort()).toEqual(['a', 'g', 'u'])
    expect([edge?.label, edge?.source, edge?.target, edge?.isDashed, edge?.hasArrow]).toEqual(['usa', 'a', 'u', true, false])
  })
})

describe('helpers', () => {
  test('labels drop HTML but keep line breaks', async () => {
    expect(labelText('<b>A</b>&nbsp;b<br/><div>c</div>')).toBe('A b\nc')
  })

  test('styles read flags and values', async () => {
    expect(parseStyle('ellipse;whiteSpace=wrap;fillColor=#fff;')).toEqual({ ellipse: '1', whiteSpace: 'wrap', fillColor: '#fff' })
  })

  test('pages are split per <diagram>', async () => {
    expect(pagesOf('<mxfile><diagram id="1">A</diagram><diagram id="2">B</diagram></mxfile>')).toEqual(['A', 'B'])
  })
})

describe('drawDiagram', () => {
  const two = parseModel(
    [
      '<root><mxCell id="1" parent="0"/>',
      '<mxCell id="a" value="Alto" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="60" as="geometry"/></mxCell>',
      '<mxCell id="b" value="Basso" vertex="1" parent="1"><mxGeometry x="0" y="200" width="100" height="60" as="geometry"/></mxCell>',
      '<mxCell id="e" value="chiama" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
      '</root>',
    ].join(''),
  )
  const lines = (columns: number) => drawDiagram(two, columns).map(row => row.map(s => s.text).join(''))

  test('draws both boxes, their labels and a downward arrow with its label between them', async () => {
    const text = lines(40)
    const top = text.findIndex(l => l.includes('Alto'))
    const label = text.findIndex(l => l.includes('chiama'))
    const arrow = text.findIndex(l => l.includes('▼'))
    const bottom = text.findIndex(l => l.includes('Basso'))

    expect(top).toBeGreaterThanOrEqual(0)
    expect(top < label && label < arrow && arrow < bottom).toBe(true)
    expect(text[0]).toContain('┌')
  })

  test('never draws wider than the columns it is given', async () => {
    expect(Math.max(...lines(30).map(l => l.length))).toBeLessThanOrEqual(30)
  })

  test('an empty page draws nothing', async () => {
    expect(drawDiagram({ vertices: [], edges: [] }, 80)).toEqual([])
  })
})
