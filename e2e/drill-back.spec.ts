/**
 * Back means back — including everything the reader had set up.
 *
 * The drill panel is a view, so it lives in the URL and the browser's own
 * back button closes it. That is only true if three things survive the round
 * trip: the parameter leaves the URL, the dashboard is where it was on the
 * page, and focus returns to the control that opened the panel. The last one
 * is the one that gets forgotten, and it is the one a keyboard user notices
 * first — losing focus means starting again from the top of the document.
 *
 * jsdom cannot test any of this: there is no history stack, no scroll
 * position, and no focus that moves when you are not looking.
 */

import { expect, test, type Page } from '@playwright/test'

import { WIDGET, openDashboard, pinLanguage, waitForData } from './helpers'

/**
 * The accessible name of whatever has focus.
 *
 * Polled rather than read once: focus is restored on the next animation
 * frame, so a single read races the browser and fails about one run in three
 * on a busy machine.
 */
function focusedName(page: Page) {
  return expect.poll(
    () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''),
    {
      timeout: 5_000,
    },
  )
}

const DRILL_PARAM = 'drill'

test.beforeEach(async ({ context }) => {
  await pinLanguage(context, 'en')
})

function hasDrill(page: Page): boolean {
  return new URL(page.url()).searchParams.has(DRILL_PARAM)
}

/** The Majed row in the Agents widget — a bar that opens his transfers. */
function majedRow(page: Page) {
  return page
    .getByRole('region', { name: WIDGET.agents.en })
    .getByRole('button', { name: /Show calls transferred by Majed/ })
}

test.describe('opening a drill from the dashboard', () => {
  test('Back closes the panel and leaves the dashboard as it was', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await openDashboard(page)

    // Somewhere down the page, so "the dashboard is where it was" is a claim
    // with something to lose.
    await majedRow(page).scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 240)
    await page.waitForTimeout(300)

    const scrollBefore = await page.evaluate(() => window.scrollY)
    expect(scrollBefore, 'the test needs the page scrolled to mean anything').toBeGreaterThan(0)

    await majedRow(page).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading')).toContainText('Majed')
    expect(hasDrill(page), 'opening a drill must put it in the URL').toBe(true)

    await page.goBack()

    await expect(dialog).toHaveCount(0)
    expect(hasDrill(page), 'Back must take the drill out of the URL').toBe(false)
    await waitForData(page)

    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

    // Focus is back on the control that opened the panel, not on the body.
    await focusedName(page).toContain('Majed')
  })

  test('the dashboard is inert while the panel is open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await openDashboard(page)

    await majedRow(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // The dashboard keeps rendering — that is the point of `inert` rather
    // than unmounting — but nothing in it can be reached.
    const reachable = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('[aria-label*="transferred by"]')
      return { exists: row !== null, inert: row?.closest('[inert]') !== null }
    })
    expect(reachable.exists, 'the dashboard should still be mounted').toBe(true)
    expect(reachable.inert, 'the dashboard should be inert').toBe(true)
  })

  test('Escape closes it too, and also restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await openDashboard(page)

    await majedRow(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(hasDrill(page)).toBe(false)

    await focusedName(page).toContain('Majed')
  })
})

test.describe('arriving on a drill link', () => {
  /** What a colleague would paste: a drill, spelled out, with no history. */
  const LINK = '/?drill=agent:agent_06,outcome:transferred'

  test('opens the panel directly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto(LINK)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 45_000 })
    await expect(dialog.getByRole('heading')).toContainText('Majed')
    await expect(dialog.getByRole('row').nth(1)).toBeVisible()
  })

  test('closing it leaves the dashboard, not the site', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto(LINK)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 45_000 })

    await page.getByRole('button', { name: 'Back to dashboard' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(hasDrill(page)).toBe(false)
    await waitForData(page)

    /*
     * There was no history entry to consume — the panel was open on arrival —
     * so closing strips the parameter instead of going back, which would have
     * left the app entirely.
     */
    expect(page.url()).not.toContain(DRILL_PARAM)
    await expect(page.getByRole('region', { name: WIDGET.fixFirst.en })).toBeVisible()
  })
})
