/**
 * How many times must a keyboard user press Tab to get past this table?
 *
 * The deltas were briefly focusable so their tooltips could be opened without
 * a pointer. That put a tab stop on every Change and Quarter-trend cell —
 * fifty extra stops in one widget, each showing a sentence — so reaching the
 * next row meant tabbing past two numbers that did nothing. A keyboard user
 * was paying for a convenience built for mouse users.
 *
 * This counts what is left, and checks the explanation did not go with it.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { Dataset } from '../data/types'
import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import { I18nProvider } from '../i18n/I18nProvider'
import { en } from '../i18n/messages.en'
import { boundsOf, comparisonRange, type DataBounds } from '../state/presets'
import { defaultFilterState } from '../state/url'
import { IntentTableWidget } from './IntentTableWidget'

/*
 * Generous timeouts throughout this file.
 *
 * Every test here builds at least one 200,000-row quarter, which is a couple
 * of hundred milliseconds on a quiet machine and several seconds on one busy
 * running a browser. Vitest's five-second default is a budget for a unit
 * test; these are datasets. A suite that goes red because something else was
 * compiling is a suite people learn to re-run rather than read.
 */
const DATASET_TIMEOUT_MS = 120_000
vi.setConfig({ testTimeout: DATASET_TIMEOUT_MS, hookTimeout: DATASET_TIMEOUT_MS })

let ds: Dataset
let bounds: DataBounds
let html: string
let rowCount: number

beforeAll(() => {
  ds = generateDataset()
  bounds = boundsOf(ds)

  // Last week, so the comparison period exists and every delta is a real one.
  const range = defaultFilterState(bounds).range
  const data = aggregate(ds, {
    range,
    compare: comparisonRange(range),
    agents: [],
    intents: [],
    languages: [],
  })

  rowCount = data.intents.filter((intent) => intent.current.calls > 0).length

  html = renderToStaticMarkup(
    <I18nProvider lang="en" setLang={() => {}}>
      <IntentTableWidget
        data={data}
        filters={{ ...defaultFilterState(bounds), range }}
        showDelta
        coverage="full"
        bounds={bounds}
      />
    </I18nProvider>,
  )
})

const count = (pattern: RegExp): number => (html.match(pattern) ?? []).length

describe('Intents table tab stops', () => {
  it('has no focusable delta cells', () => {
    // The fifty stops that prompted this. A tabindex in the table body now
    // means someone reintroduced them.
    expect(count(/tabindex="0"/g)).toBe(0)
  })

  it('has exactly one row control per row plus a fixed set of header controls', () => {
    /*
     * Expected: 6 sortable column headers, 2 column ⓘ buttons, and exactly one
     * control per row — the intent name. The unresolved count used to be a
     * second button; that narrowing is a chip inside the drill panel now, so a
     * reader tabs through 25 rows rather than 50 controls.
     */
    const headerControls = 6 + 2
    const perRow = 1

    expect(count(/<button/g)).toBe(headerControls + rowCount * perRow)
  })

  it('stays under a third of the stops it had before', () => {
    // Was 106 (56 buttons + 50 delta spans) on the same data.
    expect(count(/<button/g) + count(/tabindex="0"/g)).toBeLessThan(106 / 3)
  })

  it('keeps an explanation in the DOM for every delta', () => {
    // Two deltas per row, each carrying its noise floor as hidden text —
    // which is strictly more than the tooltip gave, since it is read in
    // document order beside the number rather than needing to be found.
    const explanations =
      count(/Normal variation here/g) + count(new RegExp(en['delta.tooltipInsufficient'], 'g'))

    expect(explanations).toBe(rowCount * 2)
  })

  it('still says "within normal variation" for muted changes', () => {
    expect(count(/within normal variation/g)).toBeGreaterThan(0)
  })

  it('explains the rule once per judged column', () => {
    // One ⓘ on Change, one on Quarter trend.
    expect(count(/About the /g)).toBe(2)
  })
})
