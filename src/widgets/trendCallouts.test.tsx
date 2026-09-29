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
 * 3. The label stays **inside the plot**. An incident on the last day of the
 *    quarter sits at the edge of the chart in English and at the opposite edge
 *    in Arabic, and an unclamped label runs over the value axis in one of
 *    them — which is exactly the kind of bug that only shows up in the
 *    language nobody checked.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { AGENTS, INTENTS } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import type { Aggregates, Counts } from '../engine/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { ar } from '../i18n/messages.ar'
import { en } from '../i18n/messages.en'
import type { UiLang } from '../lib/format'
import { isoToDayIndex, weekday } from '../lib/time/riyadh'
import { boundsOf, comparisonRange, defaultRange, type DataBounds } from '../state/presets'
import { DrillContext } from '../state/drill'
import { defaultFilterState, type FilterState } from '../state/url'
import { DailyTrendWidget } from './DailyTrendWidget'
import type { WidgetProps } from './types'

const CHART_WIDTH = 900
/** Room for the value-axis labels; the plot starts after it. See the widget. */
const GUTTER = 42

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

/** The same wording the widget uses, per language, without its numbers. */
const NOTE_PREFIX: Record<UiLang, string> = {
  en: en['trend.noteIncident'].split('{')[0]!.trim(),
  ar: ar['trend.noteIncident'].split('{')[0]!.trim(),
}

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

    expect(calloutLabels()).toEqual(['Tool errors 4.7× normal'])

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
    expect(container.textContent).toContain('Tool errors 4.7× normal')
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
    expect(live?.textContent).toContain('Tool errors 4.7× normal')
  })
})

// --- an incident at the very edge -------------------------------------------

const ZERO: Counts = {
  calls: 0,
  resolved: 0,
  transferred: 0,
  abandoned: 0,
  toolErrorCalls: 0,
  toolErrorsSum: 0,
}

/** A day at a given resolution and tool-error rate. */
function day(calls: number, resolution: number, toolErrors: number): Counts {
  const resolved = Math.round(calls * resolution)
  return {
    ...ZERO,
    calls,
    resolved,
    transferred: calls - resolved,
    toolErrorCalls: Math.round(calls * toolErrors),
    toolErrorsSum: Math.round(calls * toolErrors),
  }
}

/**
 * Nine weeks of ordinary days with the last one broken.
 *
 * The last day is the hard case for the label: it sits at the inline-end edge
 * of the plot, which is the right in English and the left in Arabic.
 */
function edgeIncident(): { props: WidgetProps; bounds: DataBounds } {
  const firstDay = isoToDayIndex('2026-06-28')
  const length = 63

  const daily = Array.from({ length }, (_, offset) => {
    const isWeekend = weekday(firstDay + offset) >= 5
    return day(isWeekend ? 900 : 2200, isWeekend ? 0.62 : 0.72, 0.06)
  })
  daily[length - 1] = day(2200, 0.6, 0.3)

  const weekStarts = Array.from({ length: Math.ceil(length / 7) }, (_, w) => firstDay + w * 7)
  const bounds = boundsOf({ firstDay, days: length })

  const data: Aggregates = {
    current: ZERO,
    previous: ZERO,
    daily,
    intents: INTENTS.map(() => ({ current: ZERO, previous: ZERO, weekly: [] })),
    agents: AGENTS.map(() => ({ current: ZERO, previous: ZERO })),
    reasons: { current: [0, 0, 0, 0], previous: [0, 0, 0, 0] },
    heatmap: new Array<number>(7 * 24).fill(0),
    weekStarts,
  }

  const filters: FilterState = {
    ...defaultFilterState(bounds),
    range: { from: bounds.lastDay - 6, to: bounds.lastDay },
  }

  return {
    props: { data, filters, showDelta: true, coverage: 'full', bounds },
    bounds,
  }
}

describe('a callout at the edge of the plot', () => {
  const innerWidth = CHART_WIDTH - GUTTER

  it.each([['en'], ['ar']] as const)('stays inside the plot in %s', (lang) => {
    const { props } = edgeIncident()
    render(props, lang)

    const label = calloutTexts()[0]
    expect(label).toBeDefined()
    expect(label!.textContent).toContain(NOTE_PREFIX[lang])

    const x = Number(label!.getAttribute('x'))
    // The widget's own estimate: 5.4px a character, halved.
    const halfLabel = ((label!.textContent ?? '').length * 5.4) / 2

    /*
     * Measured in the plot's own coordinates, which start after the gutter in
     * English and end before it in Arabic. Staying inside [0, innerWidth]
     * here is what keeps the text off the value axis either way.
     */
    expect(x).toBeGreaterThanOrEqual(halfLabel)
    expect(x).toBeLessThanOrEqual(innerWidth - halfLabel)
  })
})
