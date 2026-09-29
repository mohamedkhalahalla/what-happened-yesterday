// @vitest-environment jsdom

/**
 * What the reader actually sees at the top of the page.
 *
 * `detect.test.ts` proves the findings are right. This proves they arrive on
 * screen with their evidence attached and a way to check them — which is a
 * separate claim, and the one that matters to somebody reading the dashboard
 * rather than the source.
 *
 * The empty case gets equal billing. It is what a reader sees whenever they
 * filter to a quiet corner of the data, and "nothing stands out" has to be
 * distinguishable from a widget that failed to render.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest'

import { AGENTS, INTENTS } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import type { Aggregates } from '../engine/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { boundsOf, comparisonRange, defaultRange, type DataBounds } from '../state/presets'
import { DrillContext, type DrillRequest } from '../state/drill'
import { defaultFilterState, type FilterState } from '../state/url'
import { FixFirstWidget } from './FixFirstWidget'
import type { WidgetProps } from './types'

let bounds: DataBounds
let filters: FilterState
let planted: Aggregates
let quiet: Aggregates

let container: HTMLDivElement
let root: Root
let openDrill: Mock<(request: DrillRequest) => void>

function aggregateFor(anomalies: boolean): { data: Aggregates; bounds: DataBounds } {
  const ds = generateDataset(undefined, { anomalies })
  const dsBounds = boundsOf(ds)
  const range = defaultRange(dsBounds)

  return {
    data: aggregate(ds, {
      range,
      compare: comparisonRange(range),
      agents: [],
      intents: [],
      languages: [],
    }),
    bounds: dsBounds,
  }
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const withStories = aggregateFor(true)
  bounds = withStories.bounds
  planted = withStories.data
  filters = defaultFilterState(bounds)

  quiet = aggregateFor(false).data
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(data: Aggregates | null): void {
  openDrill = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const props: WidgetProps = { data, filters, showDelta: true, coverage: 'full', bounds }

  act(() => {
    root.render(
      <I18nProvider lang="en" setLang={() => {}}>
        <DrillContext.Provider value={{ openDrill }}>
          <FixFirstWidget {...props} />
        </DrillContext.Provider>
      </I18nProvider>,
    )
  })
}

const buttons = (): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button) => button.textContent === 'Show calls',
  )

describe('Fix first', () => {
  it('lists the findings under headed sections', () => {
    render(planted)

    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent)
    expect(headings).toEqual(['Ongoing', 'Incidents'])

    // Ranked, so an ordered list; dated, so not.
    expect(container.querySelector('ol')).not.toBeNull()
    expect(container.querySelector('ul')).not.toBeNull()
  })

  it('states the evidence next to the claim, and the cost as an estimate', () => {
    render(planted)
    const text = container.textContent ?? ''

    expect(text).toContain(`${AGENTS[5]!.nameEn} transfers 2.7× the median`)
    expect(text).toContain('47.5% vs 17.4% median')
    // Two significant figures and a "roughly" sign: this is a projection.
    expect(text).toContain('≈ 590 extra transfers a week')

    expect(text).toContain(`${INTENTS.find((i) => i.id === 'roaming')!.labelEn} has been getting`)
    expect(text).toContain('46.9% in the last four weeks, 68.7% in the first four')

    /*
     * 4.6x, not the 4.7x this said when incident baselines came from a window
     * of neighbouring weeks. The baseline is now the fitted quarter trend plus
     * the median residual of that weekday, which moves the "normal Tuesday" it
     * is measured against by a tenth of a point.
     */
    expect(text).toContain('tool errors 4.6× normal')
    expect(text).toContain('No similar day in the 32 days since.')
  })

  it('names the finding in each button, not just "Show calls"', () => {
    render(planted)

    const labels = buttons().map((button) => button.getAttribute('aria-label'))
    expect(labels).toHaveLength(3)
    expect(labels[0]).toBe(`Show the calls behind: ${AGENTS[5]!.nameEn} transfers 2.7× the median`)
    // Eight identical "Show calls" names down a list is a list a screen
    // reader cannot navigate.
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('opens the calls behind a finding', () => {
    render(planted)

    act(() => {
      buttons()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(openDrill).toHaveBeenCalledTimes(1)
    const request = openDrill.mock.calls[0]![0]
    expect(request.constraints).toEqual({ agent: 5, outcome: 'transferred' })
    expect(request.range).toEqual(filters.range)
  })

  it('says so when nothing stands out, and still says where that came from', () => {
    render(quiet)

    expect(container.textContent).toContain('Nothing stands out in this view.')
    expect(buttons()).toHaveLength(0)
    // The footer stays: the absence of findings is also an automatic result.
    expect(container.textContent).toContain('Detected automatically from this data.')
  })

  it('renders nothing but a note before the first aggregates arrive', () => {
    render(null)

    expect(buttons()).toHaveLength(0)
    expect(container.querySelector('h3')).toBeNull()
  })
})
