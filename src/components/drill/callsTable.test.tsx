// @vitest-environment jsdom

/**
 * The claim virtualization actually makes.
 *
 * Every other test in this project runs headless because the logic is pure.
 * This one cannot: the point of `CallsTable` is what is *absent* from the DOM,
 * and "absent" is only meaningful once a real DOM exists. Rendering to a string
 * would prove nothing — `renderToStaticMarkup` has no scroll container, no
 * measurement and no effects.
 *
 * So: 200,000 rows in, and two assertions out.
 *
 * 1. `aria-rowcount` is 200,001 — every row plus the header. This is the
 *    number a screen reader announces, and it must describe the data, not the
 *    rendering.
 * 2. Fewer than 60 row elements exist. A 600-pixel viewport over 36-pixel rows
 *    is about 17 rows, plus 12 of overscan at each end; 60 is a ceiling with
 *    room for the virtualizer to change its mind about rounding, and still two
 *    thousand times smaller than the data.
 *
 * jsdom has no layout engine: every element reports `offsetHeight` 0 and has
 * no scroll methods at all. Both are stubbed below so the virtualizer can see
 * a viewport to fill. Those stubs stand in for the browser, not for anything
 * in `CallsTable`.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { generateDataset } from '../../data/generate'
import type { Dataset } from '../../data/types'
import { I18nProvider } from '../../i18n/I18nProvider'
import { CallsTable } from './CallsTable'

const VIEWPORT = { width: 900, height: 600 }

let ds: Dataset
let container: HTMLDivElement
let root: Root

beforeAll(() => {
  // React only allows `act` when the environment says it is a test one.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  ds = generateDataset()

  /*
   * The virtualizer measures its scroll element with `offsetHeight`, which
   * jsdom hard-codes to 0 — so without this it would decide nothing is
   * visible and render no rows, and the "fewer than 60" assertion would pass
   * for entirely the wrong reason. Hence the lower bound in the test below.
   */
  for (const [prop, value] of [
    ['offsetWidth', VIEWPORT.width],
    ['offsetHeight', VIEWPORT.height],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value })
  }

  // jsdom implements neither, and the component legitimately calls scrollTo
  // when the row list changes.
  Element.prototype.scrollTo = () => {}
  Element.prototype.scrollBy = () => {}
})

afterAll(() => {
  for (const prop of ['offsetWidth', 'offsetHeight'] as const) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
  }
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(rows: Uint32Array): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root.render(
      <I18nProvider lang="en" setLang={() => {}}>
        <CallsTable ds={ds} rows={rows} sortKey="time" sortDirection="desc" onSort={() => {}} />
      </I18nProvider>,
    )
  })
}

describe('CallsTable', () => {
  it('reports 200,001 rows to assistive tech while rendering under 60', () => {
    // Every call in the dataset, which is the worst case a drill can produce:
    // "all calls, all time".
    const rows = new Uint32Array(ds.n)
    for (let i = 0; i < ds.n; i++) rows[i] = i

    expect(rows.length).toBe(200_000)

    render(rows)

    const table = container.querySelector('[role="table"]')
    expect(table?.getAttribute('aria-rowcount')).toBe('200001')

    const rendered = container.querySelectorAll('[role="row"]')
    expect(rendered.length).toBeLessThan(60)
    // And not zero: a component that renders nothing would pass the ceiling.
    expect(rendered.length).toBeGreaterThan(1)
  })

  it('numbers rows by their place in the full list, not the rendered window', () => {
    const rows = new Uint32Array(ds.n)
    for (let i = 0; i < ds.n; i++) rows[i] = i

    render(rows)

    const indexes = Array.from(container.querySelectorAll('[role="row"]')).map((row) =>
      Number(row.getAttribute('aria-rowindex')),
    )

    // Header is row 1, so the first body row is row 2 and they run unbroken.
    expect(indexes[0]).toBe(1)
    expect(indexes[1]).toBe(2)
    expect(indexes).toEqual(indexes.map((_, i) => i + 1))
  })

  it('shows an empty state rather than an empty table', () => {
    render(new Uint32Array(0))

    expect(container.textContent).toContain('No calls match this selection.')
    expect(container.querySelector('[role="table"]')?.getAttribute('aria-rowcount')).toBe('1')
    expect(container.querySelectorAll('[role="row"]').length).toBe(1)
  })
})
