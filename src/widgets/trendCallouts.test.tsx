// @vitest-environment jsdom

/**
 * The incident, annotated on the chart that shows it happening.
 *
 * Three claims are tested here, and the third is the one that breaks silently:
 *
 * 1. The callout comes from the **same detector** the Fix-first widget reads.
 *    A second, local calculation would eventually disagree with the first, and
 *    the reader would have no way to tell which to believe.
 * 2. It survives into the table view and the keyboard announcement. The table
 *    is a peer of the chart, not a fallback, so anything the chart marks has
 *    to be readable without seeing it.
 * 3. The label stays **inside the plot**, which is tested as arithmetic at
 *    the bottom of this file. An unclamped label runs over the value axis at
 *    one end of the chart and off the widget at the other, and in Arabic
 *    those two ends swap — exactly the kind of bug that only shows up in the
 *    language nobody checked.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CALLOUT_CHAR_WIDTH, clampCalloutX } from '../charts/callout'
import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import { I18nProvider } from '../i18n/I18nProvider'
import type { UiLang } from '../lib/format'
import { isoToDayIndex } from '../lib/time/riyadh'
import { boundsOf, comparisonRange, defaultRange } from '../state/presets'
import { DrillContext } from '../state/drill'
import { defaultFilterState } from '../state/url'
import { DailyTrendWidget } from './DailyTrendWidget'
import type { WidgetProps } from './types'

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

const CHART_WIDTH = 900

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  // jsdom has no layout, and the chart refuses to draw at zero width.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => CHART_WIDTH,
  })
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(props: WidgetProps, lang: UiLang = 'en'): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root.render(
      <I18nProvider lang={lang} setLang={() => {}}>
        <DrillContext.Provider value={{ openDrill: () => {} }}>
          <DailyTrendWidget {...props} />
        </DrillContext.Provider>
      </I18nProvider>,
    )
  })
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/*
 * The callouts are found by their own attribute, not by their words. Matching
 * on text matched the Arabic tool-error *panel title* as well, and the edge
 * test then measured the title's position and passed while the label it was
 * meant to check sat off the plot.
 */
const calloutTexts = (): SVGTextElement[] =>
  Array.from(container.querySelectorAll<SVGTextElement>('text[data-callout]'))

const calloutLabels = (): string[] => calloutTexts().map((node) => node.textContent ?? '')

// --- the planted quarter ----------------------------------------------------

describe('callouts on the real quarter', () => {
  let props: WidgetProps

  beforeAll(() => {
    const ds = generateDataset()
    const bounds = boundsOf(ds)
    const range = defaultRange(bounds)
    const data = aggregate(ds, {
      range,
      compare: comparisonRange(range),
      agents: [],
      intents: [],
      languages: [],
    })

    props = {
      data,
      filters: { ...defaultFilterState(bounds), range },
      showDelta: true,
      coverage: 'full',
      bounds,
    }
  })

  it('marks the deploy day on the chart with what happened', () => {
    render(props)

    expect(calloutLabels()).toEqual(['Tool errors 4.6× normal'])

    // A rule through both panels, one per day the incident covers.
    const markers = Array.from(container.querySelectorAll('line[stroke-dasharray]'))
    expect(markers).toHaveLength(1)
  })

  it('says so in the summary, which is also the accessible description', () => {
    render(props)

    expect(container.textContent).toContain('1 day flagged as an incident: 25 Aug')
  })

  it('carries the note into the table view', () => {
    render(props)

    const toTable = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Table',
    )
    click(toTable!)

    const headers = Array.from(container.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toContain('Note')
    expect(container.textContent).toContain('Tool errors 4.6× normal')
  })

  it('includes the note in the keyboard announcement for that day', () => {
    render(props)

    const plot = container.querySelector('[tabindex="0"]')
    // `focusin`, not `focus`: React listens for the bubbling one, and a
    // `focus` event here would leave the cursor unset and the test green for
    // the wrong reason.
    act(() => {
      plot!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })

    // Focus lands on the last day; walk back to the deploy day.
    const lastDay = props.bounds.lastDay
    const steps = lastDay - isoToDayIndex('2026-08-25')
    for (let step = 0; step < steps; step++) {
      act(() => {
        plot!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
        )
      })
    }

    const live = container.querySelector('[aria-live]')
    expect(live?.textContent).toContain('25 Aug')
    expect(live?.textContent).toContain('Tool errors 4.6× normal')
  })
})

// --- the clamp itself -------------------------------------------------------

/**
 * Tested as arithmetic rather than through a fixture.
 *
 * It used to be provoked by planting an incident on the last day of a series,
 * which stopped working the moment the detector started refusing to judge
 * days at the edge of the data — correctly, but it left the clamp untested
 * and the test asserting that nothing rendered. The placement rule and the
 * label geometry are unrelated concerns, and coupling them hid both.
 */
describe('keeping a callout inside the plot', () => {
  const WIDTH = 858 // 900 less the value-axis gutter
  const label = 'Tool errors 4.6× normal'
  const half = (label.length * CALLOUT_CHAR_WIDTH) / 2

  it('leaves a label in the middle where it is', () => {
    expect(clampCalloutX(400, label, WIDTH)).toBe(400)
  })

  it('pulls a label back from either end', () => {
    // x = 0 is the inline start, which is the left in English and the right
    // in Arabic: the chart mirrors its scale, so one rule covers both.
    expect(clampCalloutX(0, label, WIDTH)).toBeCloseTo(half, 5)
    expect(clampCalloutX(WIDTH, label, WIDTH)).toBeCloseTo(WIDTH - half, 5)
  })

  it('never lets the text cross the plot edge', () => {
    for (let x = -50; x <= WIDTH + 50; x += 7) {
      const clamped = clampCalloutX(x, label, WIDTH)
      expect(clamped - half).toBeGreaterThanOrEqual(0)
      expect(clamped + half).toBeLessThanOrEqual(WIDTH)
    }
  })

  it('centres a label too wide to fit rather than clipping one end', () => {
    const narrow = 40
    expect(clampCalloutX(0, label, narrow)).toBe(narrow / 2)
    expect(clampCalloutX(narrow, label, narrow)).toBe(narrow / 2)
  })
})
