/**
 * What the reader actually sees.
 *
 * The data-driven tests assert the flags; this asserts the markup. They are
 * not the same claim: `quarterTrend.improving` is still true for seven intents
 * and must still produce no badge, which only rendering can prove.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import type { Dataset } from '../data/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { en } from '../i18n/messages.en'
import { ar } from '../i18n/messages.ar'
import type { UiLang } from '../lib/format'
import { boundsOf, comparisonRange, type DataBounds } from '../state/presets'
import { defaultFilterState } from '../state/url'
import { IntentTableWidget } from './IntentTableWidget'

let ds: Dataset
let bounds: DataBounds

beforeAll(() => {
  ds = generateDataset()
  bounds = boundsOf(ds)
})

function renderIntents(lang: UiLang): string {
  const range = { from: bounds.firstDay, to: bounds.lastDay }
  const data = aggregate(ds, {
    range,
    compare: comparisonRange(range),
    agents: [],
    intents: [],
    languages: [],
  })
  const filters = { ...defaultFilterState(bounds), range }

  return renderToStaticMarkup(
    <I18nProvider lang={lang} setLang={() => {}}>
      <IntentTableWidget data={data} filters={filters} showDelta coverage="full" bounds={bounds} />
    </I18nProvider>,
  )
}

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1

describe('intent badges over the whole quarter', () => {
  it('shows exactly one Declining badge, in both languages', () => {
    for (const [lang, dict] of [
      ['en', en],
      ['ar', ar],
    ] as [UiLang, Record<string, string>][]) {
      const html = renderIntents(lang)
      expect(occurrences(html, dict['intents.declining']!), lang).toBe(1)
    }
  })

  it('shows no Improving badge anywhere, even though seven intents improved', () => {
    // The flag is still true for those rows; the badge is what was removed.
    for (const [lang, dict] of [
      ['en', en],
      ['ar', ar],
    ] as [UiLang, Record<string, string>][]) {
      const html = renderIntents(lang)
      expect(occurrences(html, dict['intents.improving']!), lang).toBe(0)
    }
  })

  it('marks non-notable changes as within normal variation for screen readers', () => {
    const html = renderIntents('en')
    // Muting is a colour; this is the same fact in words, and there should be
    // plenty of them on a 25-row table.
    expect(occurrences(html, en['delta.withinNormal'])).toBeGreaterThan(10)
  })
})
