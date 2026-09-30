/**
 * Both panels and the axis fit, at every height the widget can be given.
 *
 * The defect this replaces was invisible to every test in the repo: the chart
 * was drawn at a fixed 286 pixels into whatever box the widget had, which at
 * the default height was 128. The bottom half — the tool-error panel, the
 * time axis, and the deploy-day spike the widget exists to show — was simply
 * below the fold. Nothing rendered it wrong; it rendered correctly into a
 * space that was never looked at.
 *
 * So the question "does it fit?" is arithmetic now, and arithmetic can be
 * asserted without a browser.
 */

import { describe, expect, it } from 'vitest'

import { panelLayout, tickCountFor } from './DailyTrendWidget'

/** The heights the widget actually gets at S, M and L, measured in Chrome. */
const REAL_HEIGHTS = [128, 269]

describe('panelLayout', () => {
  it.each([...REAL_HEIGHTS, 60, 100, 150, 200, 400, 900])(
    'fits both panels and the axis into %ipx',
    (height) => {
      const layout = panelLayout(height)

      expect(layout.resolutionHeight).toBeGreaterThan(0)
      expect(layout.toolErrorHeight).toBeGreaterThan(0)
      // The axis sits below both panels, and the panels do not overlap.
      expect(layout.toolErrorTitleTop).toBeGreaterThanOrEqual(
        layout.resolutionTop + layout.resolutionHeight,
      )
      expect(layout.toolErrorTop).toBeGreaterThanOrEqual(layout.toolErrorTitleTop)
      expect(layout.axisTop).toBe(layout.toolErrorTop + layout.toolErrorHeight)
    },
  )

  it('uses exactly the height it is given, once it is big enough', () => {
    for (const height of REAL_HEIGHTS) {
      const layout = panelLayout(height)
      // The axis is the last thing drawn, so its foot is the chart's foot.
      expect(layout.axisTop, `at ${height}px`).toBeLessThanOrEqual(height)
      expect(layout.axisTop, `at ${height}px`).toBeGreaterThan(height - 20)
    }
  })

  it('stops shrinking at its floor rather than drawing nothing', () => {
    // Below the minimum the chart keeps its size and the frame scrolls — a
    // visibly too-small widget beats two panels four pixels tall.
    const tiny = panelLayout(10)
    const floor = panelLayout(0)

    expect(tiny).toEqual(floor)
    expect(tiny.resolutionHeight).toBeGreaterThanOrEqual(44)
    expect(tiny.toolErrorHeight).toBeGreaterThanOrEqual(28)
  })

  it('gives the resolution panel the larger share when there is room', () => {
    const layout = panelLayout(400)
    expect(layout.resolutionHeight).toBeGreaterThan(layout.toolErrorHeight)
  })

  it('grows both panels as the widget grows', () => {
    const small = panelLayout(150)
    const large = panelLayout(400)

    expect(large.resolutionHeight).toBeGreaterThan(small.resolutionHeight)
    expect(large.toolErrorHeight).toBeGreaterThan(small.toolErrorHeight)
  })
})

describe('tickCountFor', () => {
  it('never asks for more labels than the panel has room for', () => {
    // Ten-pixel text, so roughly one label per 26px of panel.
    expect(tickCountFor(30)).toBe(2)
    expect(tickCountFor(44)).toBe(2)
    expect(tickCountFor(130)).toBe(5)
  })

  it('always asks for at least two, so an axis has a top and a bottom', () => {
    expect(tickCountFor(0)).toBe(2)
    expect(tickCountFor(5)).toBe(2)
  })

  it('never asks for more than five, however tall the panel', () => {
    expect(tickCountFor(2000)).toBe(5)
  })
})
