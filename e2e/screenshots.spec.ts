/**
 * Not a test: the way this project looks at itself.
 *
 * Tagged `@screenshots` and skipped by `npm run test:e2e`; run it with
 * `npm run test:e2e:shots`. It writes the four images the README uses into
 * `docs/screenshots/`, and it is also how any UI change here gets checked —
 * for most of this project's life nobody could see the app at all, because
 * jsdom has no layout and every test rendered into it.
 *
 * Both languages every time. RTL is not a translation, it is a different
 * layout, and it is the one nobody checks.
 *
 * 1440 wide on the default seed, so the images are the dashboard as it ships
 * and two runs produce the same pictures.
 *
 * The dashboard is captured **full page**: at a 900-pixel viewport the fold
 * lands just above the daily trend, so a cropped image of this app is an
 * image of its filter bar. The drill panel stays cropped to the viewport,
 * because it *is* a viewport-height sheet and a full-page capture of it would
 * be a screenshot of 200,000 rows.
 */

import { expect, test, type Page } from '@playwright/test'

import { WIDGET, openDashboard, pinLanguage, type Lang } from './helpers'

const OUT = process.env.SHOT_DIR ?? 'docs/screenshots'
const VIEWPORT = { width: 1440, height: 900 }

/** Let the charts finish their entry transitions before the shutter. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(2500)
}

for (const lang of ['en', 'ar'] as const satisfies readonly Lang[]) {
  test(`@screenshots dashboard in ${lang}`, async ({ page, context }) => {
    await pinLanguage(context, lang)
    await page.setViewportSize(VIEWPORT)
    await openDashboard(page, '', lang)
    await settle(page)

    await page.screenshot({ path: `${OUT}/dashboard-${lang}.png`, fullPage: true })
  })

  test(`@screenshots drill panel in ${lang}`, async ({ page, context }) => {
    await pinLanguage(context, lang)
    await page.setViewportSize(VIEWPORT)
    await openDashboard(page, '', lang)
    await settle(page)

    // The first finding's only button is its "Show calls", whose name is
    // translated — so it is reached by position within the finding.
    await page
      .getByRole('region', { name: WIDGET.fixFirst[lang] })
      .getByRole('listitem')
      .first()
      .getByRole('button')
      .first()
      .click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(1200)

    // Viewport, not full page: the panel is a sheet the height of the window.
    await page.screenshot({ path: `${OUT}/drill-${lang}.png` })
  })
}
