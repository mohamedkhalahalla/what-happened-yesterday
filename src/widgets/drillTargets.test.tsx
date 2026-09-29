// @vitest-environment jsdom

/**
 * Every number opens *its own* calls.
 *
 * A drill-down that opens the wrong list is worse than no drill-down: the
 * reader clicks "Abandonment rate", gets 15,000 calls, and now believes
 * something false about the business. The wiring is also the easiest thing in
 * the app to get subtly wrong, because every widget builds its own request and
 * nothing type-checks the *meaning* of a constraint — `{ agent }` and
 * `{ agent, outcome: 'transferred' }` are equally valid and answer different
 * questions.
 *
 * So this clicks the real controls, captures what `openDrill` received, and
 * asserts the request against what the number on screen claimed to be.
 *
 * jsdom measures nothing, so the chart host needs a width and a
 * `ResizeObserver` before any SVG renders at all — see `beforeAll`.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest'
import type { ReactNode } from 'react'

import { generateDataset } from '../data/generate'
import { AGENTS, HANDOFF_REASONS, INTENTS } from '../data/dictionaries'
import type { Dataset } from '../data/types'
import { aggregate } from '../engine/aggregate'
import type { Aggregates } from '../engine/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { formatInt, formatPercent } from '../lib/format'
import { boundsOf, comparisonRange, type DataBounds } from '../state/presets'
import { DrillContext, type DrillRequest } from '../state/drill'
import { defaultFilterState, type FilterState } from '../state/url'
import type { WidgetProps } from './types'
import { AgentComparisonWidget } from './AgentComparisonWidget'
import { DailyTrendWidget } from './DailyTrendWidget'
import { FailureReasonsWidget } from './FailureReasonsWidget'
import { IntentTableWidget } from './IntentTableWidget'
import { KpisWidget } from './KpisWidget'

const CHART_WIDTH = 900

let ds: Dataset
let bounds: DataBounds
let filters: FilterState
let data: Aggregates
let props: WidgetProps

let container: HTMLDivElement
let root: Root
let openDrill: Mock<(request: DrillRequest) => void>

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  // The charts refuse to draw below a minimum width, and jsdom reports zero
  // for every element. This is the browser's layout, stubbed.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => CHART_WIDTH,
  })
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver

  ds = generateDataset()
  bounds = boundsOf(ds)
  filters = defaultFilterState(bounds)
  data = aggregate(ds, {
    range: filters.range,
    compare: comparisonRange(filters.range),
    agents: [],
    intents: [],
    languages: [],
  })

  props = { data, filters, showDelta: true, coverage: 'full', bounds }
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(widget: ReactNode): void {
  openDrill = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root.render(
      <I18nProvider lang="en" setLang={() => {}}>
        <DrillContext.Provider value={{ openDrill }}>{widget}</DrillContext.Provider>
      </I18nProvider>,
    )
  })
}

/** The first element matching `selector`, or a failure saying what was there. */
function find(selector: string, match?: (el: Element) => boolean): Element {
  const candidates = Array.from(container.querySelectorAll(selector))
  const target = match === undefined ? candidates[0] : candidates.find(match)

  if (target === undefined) {
    const labels = candidates.map((el) => el.getAttribute('aria-label') ?? el.textContent)
    throw new Error(`No match for ${selector}. Candidates: ${JSON.stringify(labels)}`)
  }
  return target
}

function click(selector: string, match?: (el: Element) => boolean): void {
  const target = find(selector, match)

  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** The single request the click produced. */
function lastRequest(): DrillRequest {
  expect(openDrill).toHaveBeenCalledTimes(1)
  return openDrill.mock.calls[0]![0]
}

const byLabel =
  (text: string) =>
  (el: Element): boolean =>
    (el.getAttribute('aria-label') ?? '').includes(text)

describe('KPIs', () => {
  /**
   * Every KPI, including the one that narrows to nothing.
   *
   * The Calls card was the one that broke: with no outcome to name, its drill
   * serialized to the empty string, the URL dropped the parameter, and the
   * panel never opened — so the number looked like plain text while the three
   * rates beside it worked. Hence `{}` being an expectation in its own right
   * here, and `drill.test.ts` asserting the value the URL now carries.
   */
  const cases = [
    { label: 'Resolution rate', constraints: { outcome: 'resolved' }, pick: 'resolved' },
    { label: 'Transfer rate', constraints: { outcome: 'transferred' }, pick: 'transferred' },
    { label: 'Abandonment rate', constraints: { outcome: 'abandoned' }, pick: 'abandoned' },
    { label: 'Calls', constraints: {}, pick: 'calls' },
  ] as const

  /** What the card should be showing, formatted exactly as the widget does. */
  const expectedValue = (pick: (typeof cases)[number]['pick']): string =>
    pick === 'calls'
      ? formatInt('en', data.current.calls)
      : formatPercent('en', data.current[pick] / data.current.calls)

  it.each(cases)('$label: the value itself is the button', ({ label, pick }) => {
    render(<KpisWidget {...props} />)

    const control = find('*', byLabel(`the calls behind ${label}`))

    // Not a separate "show calls" link beside the figure: the figure.
    expect(control.tagName).toBe('BUTTON')
    expect(control.textContent).toBe(expectedValue(pick))
  })

  it.each(cases)('$label: opens the calls behind it', ({ label, constraints }) => {
    render(<KpisWidget {...props} />)
    click('button', byLabel(`the calls behind ${label}`))

    expect(lastRequest()).toEqual({
      range: filters.range,
      constraints,
      source: 'kpis',
    })
  })

  it('each breakdown segment opens that slice', () => {
    render(<KpisWidget {...props} />)
    click('button', byLabel('the calls behind Transferred'))

    expect(lastRequest().constraints).toEqual({ outcome: 'transferred' })
  })
})

describe('Intents table', () => {
  it('an intent name opens that intent', () => {
    render(<IntentTableWidget {...props} />)
    click('button', byLabel(' calls'))

    const request = lastRequest()
    expect(request.source).toBe('intentTable')
    expect(request.range).toEqual(filters.range)
    // Whichever row sorted first, the constraint must name a real intent and
    // nothing else — an intent row says nothing about outcomes.
    expect(Object.keys(request.constraints)).toEqual(['intent'])
    expect(INTENTS[request.constraints.intent!]).toBeDefined()
  })
})

describe('Agent comparison', () => {
  it('an agent bar opens the calls that agent handed over', () => {
    render(<AgentComparisonWidget {...props} />)
    click('button', byLabel('transferred by'))

    const request = lastRequest()
    expect(request.source).toBe('agentComparison')
    expect(request.range).toEqual(filters.range)
    // Both halves matter: the agent alone would be every call he took, and the
    // bar is a transfer rate.
    expect(request.constraints.outcome).toBe('transferred')
    expect(AGENTS[request.constraints.agent!]).toBeDefined()
  })
})

describe('Failure reasons', () => {
  it('this period opens the selected range', () => {
    render(<FailureReasonsWidget {...props} />)
    click('button', byLabel('This period'))

    const request = lastRequest()
    expect(request.source).toBe('failureReasons')
    expect(request.range).toEqual(filters.range)

    // A handoff reason, or abandonment — which is not a handoff at all.
    const { handoff, outcome } = request.constraints
    expect(handoff === undefined ? outcome : HANDOFF_REASONS[handoff]).toBeDefined()
  })

  it('the comparison bar opens the comparison range, not this one', () => {
    render(<FailureReasonsWidget {...props} />)
    click('button', byLabel('Comparison period'))

    const request = lastRequest()
    expect(request.range).toEqual(comparisonRange(filters.range))
    expect(request.range).not.toEqual(filters.range)
  })
})

describe('Daily trend', () => {
  it('a day opens that one day', () => {
    render(<DailyTrendWidget {...props} />)
    // The invisible per-day hit targets, in day order — not the bars and
    // bands, which are drawn with the same element.
    click('rect.fill-transparent')

    const request = lastRequest()
    expect(request.source).toBe('dailyTrend')
    // One day, not the whole range: that is the number that was clicked.
    expect(request.range.from).toBe(request.range.to)
    /*
     * Inside the *dataset*, not inside the filter range: the trend draws the
     * whole ninety days with the selection highlighted, so the days on either
     * side of the selection are real points a reader can click, and opening
     * them is the point of drawing them.
     */
    expect(request.range.from).toBeGreaterThanOrEqual(bounds.firstDay)
    expect(request.range.to).toBeLessThanOrEqual(bounds.lastDay)
    expect(request.constraints).toEqual({})
  })
})
