/**
 * Nothing may make the page wider than the screen.
 *
 * A dashboard that slides sideways under your thumb is broken, and the ways
 * it happens are all invisible until someone looks: a table whose columns
 * refuse to shrink, a popover that opens past the edge, visually-hidden text
 * that escaped the scroll container it was supposed to be inside. Every one
 * of those was real in this codebase, and none of them was visible to a test
 * that renders into jsdom, which has no layout at all.
 *
 * So this opens everything that opens — every widget menu, every ⓘ, every
 * filter popover — and after each one asks the document a single question.
 *
 * Both languages, because RTL is not a translation: a popover that fits on
 * the right in English opens off the left edge in Arabic. And both a desktop
 * width and a phone, because the failure mode is entirely about how much room
 * there is.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'

import { horizontalOverflow, openDashboard, pinLanguage, type Lang } from './helpers'

const WIDTHS = [1440, 390] as const

/** Close whatever is open, so the next thing is measured on its own. */
async function dismiss(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
}

/**
 * Open each control in turn and measure after every one.
 *
 * Sequential rather than all at once: two popovers open together is not a
 * state the app can reach, so a failure there would be a bug in the test.
 */
async function eachOpens(page: Page, controls: Locator, label: string): Promise<number> {
  const count = await controls.count()

  for (let i = 0; i < count; i++) {
    const control = controls.nth(i)
    if (!(await control.isVisible())) continue

    await control.scrollIntoViewIfNeeded()
    await control.click()
    await page.waitForTimeout(150)

    const overflow = await horizontalOverflow(page)
    expect(overflow, `${label} #${i} made the page ${overflow}px too wide`).toBeLessThanOrEqual(0)

    await dismiss(page)
  }
  return count
}

for (const lang of ['en', 'ar'] as const satisfies readonly Lang[]) {
  for (const width of WIDTHS) {
    test(`nothing overflows in ${lang} at ${width}px`, async ({ page, context }) => {
      await pinLanguage(context, lang)
      await page.setViewportSize({ width, height: 900 })
      await openDashboard(page, '', lang)

      expect(
        await horizontalOverflow(page),
        'the dashboard overflows before anything is even opened',
      ).toBeLessThanOrEqual(0)

      // Every widget's ⋮ menu. Identified by the glyph rather than by an
      // accessible name, which is translated.
      const menus = page.getByRole('button', { name: /⋮|More|خيارات|المزيد/ })
      const menuCount = await eachOpens(page, menus, 'widget menu')

      // Every ⓘ: the widget glossaries and the column explanations.
      const infos = page.locator('button:has-text("ⓘ")')
      const infoCount = await eachOpens(page, infos, 'info popover')

      // The filter popovers: agents, intents, languages.
      const filters = page.getByRole('region', { name: /Date range|النطاق الزمني/ }).getByRole('button')
      const filterCount = await eachOpens(page, filters, 'filter control')

      // A count, so a locator that silently stops matching fails loudly
      // instead of passing by testing nothing.
      expect(menuCount + infoCount + filterCount, 'no controls were found to open').toBeGreaterThan(
        8,
      )
    })
  }
}

test.describe('the drill panel', () => {
  for (const lang of ['en', 'ar'] as const satisfies readonly Lang[]) {
    for (const width of WIDTHS) {
      test(`stays inside the page in ${lang} at ${width}px`, async ({ page, context }) => {
        await pinLanguage(context, lang)
        await page.setViewportSize({ width, height: 900 })
        await openDashboard(page, '', lang)

        await page
          .getByRole('region')
          .filter({ has: page.getByRole('listitem') })
          .first()
          .getByRole('listitem')
          .first()
          .getByRole('button')
          .first()
          .click()

        await expect(page.getByRole('dialog')).toBeVisible()
        await page.waitForTimeout(400)

        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

        /*
         * The table itself may be wider than the panel — that is what its own
         * horizontal scroll is for — but it has to be *its* scroll, not the
         * page's.
         */
        const scroller = page.getByRole('dialog').locator('[tabindex="0"]').first()
        const inner = await scroller.evaluate((el) => ({
          client: el.clientWidth,
          scroll: el.scrollWidth,
        }))
        expect(inner.scroll).toBeGreaterThanOrEqual(inner.client)
      })
    }
  }
})
