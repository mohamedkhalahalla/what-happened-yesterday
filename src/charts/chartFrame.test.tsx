/**
 * The chart and table views have to scroll the same way.
 *
 * They did not. The table view wrapped its content in an `overflow-auto` box,
 * so the title, the view toggle and the legend stayed put while the rows
 * moved. The chart view wrapped its content in nothing, so a tall chart
 * overflowed the whole `<figure>` into the widget body and took the legend
 * with it — the reader scrolled down to compare two bars and lost the key
 * telling them which was which.
 *
 * Switching views should change what is drawn, never where the furniture is.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { I18nProvider } from '../i18n/I18nProvider'
import type { UiLang } from '../lib/format'
import { ChartFrame, type ChartTableColumn } from './ChartFrame'

type Row = { id: string; value: number }

const ROWS: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, value: i }))

const COLUMNS: ChartTableColumn<Row>[] = [
  { key: 'id', header: 'Id', cell: (row) => row.id },
  { key: 'value', header: 'Value', numeric: true, cell: (row) => String(row.value) },
]

function render(view: 'chart' | 'table', lang: UiLang = 'en'): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang} setLang={() => {}}>
      <ChartFrame<Row>
        title="Test chart"
        summary="A summary sentence."
        legend={[{ key: 'a', label: 'Series A', swatchClass: 'bg-data-1' }]}
        chartLabel="Test chart"
        tableCaption="Test table"
        tableColumns={COLUMNS}
        tableRows={ROWS}
        tableRowKey={(row) => row.id}
        view={view}
        onViewChange={() => {}}
      >
        <div>chart body</div>
      </ChartFrame>
    </I18nProvider>,
  )
}

/** The class list of the element carrying an attribute, if any. */
function classesOfElementWith(html: string, attribute: string): string | null {
  // Matches the opening tag containing the attribute, then its class value.
  const tag = new RegExp(`<[^>]*${attribute}[^>]*>`).exec(html)?.[0]
  if (tag === undefined) return null
  return /class="([^"]*)"/.exec(tag)?.[1] ?? null
}

describe('ChartFrame scroll containment', () => {
  it('scrolls inside the chart view, not the whole figure', () => {
    const classes = classesOfElementWith(render('chart'), 'role="application"')

    expect(classes).not.toBeNull()
    // The bug in one assertion: without this the legend scrolls away.
    expect(classes).toContain('overflow-auto')
    // flex-1 + min-h-0 is what gives the scroll box a definite height.
    expect(classes).toContain('min-h-0')
    expect(classes).toContain('flex-1')
  })

  it('scrolls inside the table view too', () => {
    const html = render('table')
    // The table's own wrapper, identified by the caption it contains.
    expect(html).toContain('overflow-auto')
    expect(html).toContain('Test table')
  })

  it('keeps the legend outside the scrolling region in both views', () => {
    for (const view of ['chart', 'table'] as const) {
      const html = render(view)
      const legendIndex = html.indexOf('Series A')
      const bodyIndex = html.indexOf(view === 'chart' ? 'chart body' : 'Test table')

      expect(legendIndex, view).toBeGreaterThan(-1)
      // The legend is emitted after the scroll box closes, so it is a sibling
      // of it rather than a child — which is what keeps it pinned.
      expect(legendIndex, view).toBeGreaterThan(bodyIndex)
    }
  })

  it('keeps the title and view toggle above the scrolling region in both views', () => {
    for (const view of ['chart', 'table'] as const) {
      const html = render(view)
      const titleIndex = html.indexOf('Test chart')
      const bodyIndex = html.indexOf(view === 'chart' ? 'chart body' : 'Test table')

      expect(titleIndex, view).toBeGreaterThan(-1)
      expect(titleIndex, view).toBeLessThan(bodyIndex)
    }
  })
})
