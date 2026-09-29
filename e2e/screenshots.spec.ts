/**
 * Not a test: a way to look at the app.
 *
 * Tagged `@screenshots` and excluded from `npm run test:e2e`, because it
 * asserts almost nothing — it drives the dashboard into a few states and
 * writes PNGs. `npm run test:e2e:shots`.
 *
 * It exists because for most of this project's life nobody could see it. The
 * unit suite renders into jsdom, which has no layout, so a column that
 * overflows its panel or a chart clipped by its widget is invisible to every
 * test in `src/`. Both languages, every time: RTL is not a translation, it is
 * a different layout, and it is the one nobody checks.
 */

import { expect, test, type Page } from '@playwright/test'

const OUT = process.env.SHOT_DIR ?? 'test-results/shots'

/**
 * The Fix-first widget's accessible name, per language.
 *
 * Spelled out rather than found by position: the first region on the page is
 * the filter bar, which is how the first version of this spec spent a minute
 * waiting for a button inside a date picker.
 */
const FIX_FIRST: Record<'en' | 'ar', string> = {
  en: 'Fix first',
  ar: 'ابدأ بإصلاح هذه',
}

async function useLanguage(page: Page, lang: 'en' | 'ar'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('wy.currentUser', 'abdullah')
    window.localStorage.setItem('wy.prefs.v1.abdullah', JSON.stringify({ uiLang: value }))
  }, lang)
}

/** Long enough for the worker to build a quarter and the widgets to settle. */
async function settle(page: Page, lang: 'en' | 'ar'): Promise<void> {
  await expect(page.getByRole('region', { name: FIX_FIRST[lang] })).toBeVisible({
    timeout: 30_000,
  })
  await page.waitForTimeout(2500)
}

for (const lang of ['en', 'ar'] as const) {
  test(`@screenshots dashboard in ${lang}`, async ({ page }) => {
    await useLanguage(page, lang)
    await page.setViewportSize({ width: 1280, height: 1600 })
    await page.goto('/')
    await settle(page, lang)

    await page.screenshot({ path: `${OUT}/dashboard-${lang}.png` })
    await page.locator('footer').screenshot({ path: `${OUT}/footer-${lang}.png` })
  })

  test(`@screenshots drill panel in ${lang}`, async ({ page }) => {
    await useLanguage(page, lang)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await settle(page, lang)

    // The first finding's only button is its "Show calls", whose name is
    // translated — so it is reached by position within the finding.
    await page
      .getByRole('region', { name: FIX_FIRST[lang] })
      .getByRole('listitem')
      .first()
      .getByRole('button')
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(1200)

    await page.screenshot({ path: `${OUT}/drill-${lang}.png` })
  })
}
