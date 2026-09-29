/**
 * The seed, in a real browser.
 *
 * These are the first tests in this project that can see a Web Worker being
 * re-initialised, a back button being pressed, or the same URL opened in two
 * tabs — which is exactly where all three reported bugs live. The unit suite
 * was green throughout, because jsdom has none of those things.
 *
 * The load-bearing assertion is the **invariant**: the footer reports the seed
 * the worker actually generated from, read off the dataset itself, and it must
 * always equal the seed in the URL. Every one of the three symptoms is a
 * different way for those two to come apart, so when the invariant holds the
 * symptoms cannot happen; when it breaks, the numbers on screen are honestly
 * labelled with the wrong provenance and nothing looks amiss.
 */

import { expect, test, type Page } from '@playwright/test'

/**
 * The app opens in Arabic — the default preference for a Saudi contact centre.
 *
 * These tests read in English because the assertions are about seeds and
 * history rather than about translation, and an English locator that silently
 * matched nothing is how the first run of this suite failed eleven times for
 * the wrong reason. Written before the app boots, so the first paint is
 * already English and nothing has to be clicked.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('wy.currentUser', 'abdullah')
    window.localStorage.setItem('wy.prefs.v1.abdullah', JSON.stringify({ uiLang: 'en' }))
  })
})

/** The quarter the app ships with. */
const DEFAULT_SEED = 20260927

/** What the dashboard says about the planted default story. */
const DEFAULT_STORY = {
  agent: 'Majed',
  intent: 'Roaming',
  incident: '25 Aug',
}

/** The seed the worker says it built from. */
async function seedInUse(page: Page): Promise<number> {
  const text = await page.getByTestId('seed-in-use').innerText()
  const digits = text.replace(/\D+/g, '')

  expect(digits, `footer seed unreadable: "${text}"`).not.toBe('')
  return Number(digits)
}

/** The seed the URL asks for, or the default when it says nothing. */
function seedInUrl(page: Page): number {
  const value = new URL(page.url()).searchParams.get('seed')
  return value === null ? DEFAULT_SEED : Number(value)
}

/**
 * Wait until the dashboard has finished rendering a dataset.
 *
 * The Fix-first widget is the last thing to settle: it needs the aggregates,
 * so its presence means a full round trip has landed.
 */
function fixFirst(page: Page) {
  // SortableWidget labels each widget's <section>, so every widget is a region
  // with an accessible name — no test id needed.
  return page.getByRole('region', { name: 'Fix first' })
}

/** The Calls KPI, whose value is a button with an accessible name. */
function callsKpi(page: Page) {
  return page.getByRole('button', { name: 'Show the calls behind Calls' })
}

async function waitForData(page: Page): Promise<void> {
  await expect(fixFirst(page)).toBeVisible({ timeout: 30_000 })
  await expect(callsKpi(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Generating data...')).toHaveCount(0)
  await expect(fixFirst(page).getByRole('heading', { name: 'Ongoing' })).toBeVisible({
    timeout: 30_000,
  })
}

/**
 * What is on screen, as a comparable string.
 *
 * The Fix-first findings plus the headline call count: between them they name
 * the agent, the intent, the incident day and a number that differs between
 * any two quarters.
 */
async function fingerprint(page: Page): Promise<string> {
  const findings = await fixFirst(page).getByRole('listitem').allInnerTexts()
  const calls = await callsKpi(page).innerText()

  return [`calls=${calls.replace(/\s+/g, ' ')}`, ...findings.map((t) => t.replace(/\s+/g, ' '))]
    .join('\n')
    .trim()
}

async function openDashboard(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`)
  await waitForData(page)
}

test.describe('the seed the data was built from', () => {
  test('matches the URL on a fresh load with no seed', async ({ page }) => {
    await openDashboard(page)

    expect(await seedInUse(page)).toBe(DEFAULT_SEED)
    expect(seedInUrl(page)).toBe(DEFAULT_SEED)
  })

  test('matches the URL on a fresh load with a seed', async ({ page }) => {
    await openDashboard(page, '?seed=12345')

    expect(await seedInUse(page)).toBe(12345)
    expect(seedInUrl(page)).toBe(12345)
  })

  test('still matches after a shuffle', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)

    // The whole bug, in one assertion: the URL says one quarter and the
    // numbers came from another.
    expect(await seedInUse(page)).toBe(seedInUrl(page))
  })

  test('still matches after two shuffles and a Back', async ({ page }) => {
    await openDashboard(page)

    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)

    await page.goBack()
    await waitForData(page)

    expect(await seedInUse(page)).toBe(seedInUrl(page))
  })

  test('still matches after a reset', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)

    await page.getByRole('button', { name: 'Reset to default' }).click()
    await waitForData(page)

    expect(await seedInUse(page)).toBe(DEFAULT_SEED)
    expect(seedInUrl(page)).toBe(DEFAULT_SEED)
  })
})

test.describe('a link reproduces the data', () => {
  test('the same URL gives the same numbers in a second tab', async ({ page, context }) => {
    await openDashboard(page, '?seed=12345')
    const first = await fingerprint(page)

    const other = await context.newPage()
    await other.goto('/?seed=12345')
    await waitForData(other)

    expect(await fingerprint(other)).toBe(first)
    await other.close()
  })

  test('the URL after a shuffle reproduces what it is showing', async ({ page, context }) => {
    await openDashboard(page)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)

    const url = page.url()
    expect(url, 'shuffle must write the seed into the URL').toContain('seed=')
    const shown = await fingerprint(page)

    const other = await context.newPage()
    await other.goto(url)
    await waitForData(other)

    expect(
      await fingerprint(other),
      'the link shows different data from the tab it came from',
    ).toBe(shown)
    await other.close()
  })

  test('a reload shows what was on screen before it', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)
    const before = await fingerprint(page)

    await page.reload()
    await waitForData(page)

    expect(await fingerprint(page)).toBe(before)
  })
})

test.describe('history', () => {
  test('Back walks the quarters in the order they were visited', async ({ page }) => {
    await openDashboard(page)
    const defaultView = await fingerprint(page)
    expect(defaultView).toContain(DEFAULT_STORY.agent)

    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)
    const urlA = page.url()
    const viewA = await fingerprint(page)

    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)
    const viewB = await fingerprint(page)
    expect(viewB, 'two shuffles must reach two different quarters').not.toBe(viewA)

    await page.goBack()
    await waitForData(page)
    expect(page.url()).toBe(urlA)
    expect(await fingerprint(page), 'Back did not return to the previous quarter').toBe(viewA)

    await page.goBack()
    await waitForData(page)
    expect(seedInUrl(page)).toBe(DEFAULT_SEED)
    expect(await fingerprint(page)).toBe(defaultView)
  })
})

test.describe('reset', () => {
  test('brings back the default quarter exactly', async ({ page }) => {
    await openDashboard(page)
    const fresh = await fingerprint(page)

    await page.getByRole('button', { name: 'Shuffle' }).click()
    await waitForData(page)

    await page.getByRole('button', { name: 'Reset to default' }).click()
    await waitForData(page)

    expect(new URL(page.url()).searchParams.has('seed')).toBe(false)
    expect(await fingerprint(page)).toBe(fresh)

    // And the planted story is back by name, not merely by fingerprint.
    const panel = fixFirst(page)
    await expect(panel).toContainText(DEFAULT_STORY.agent)
    await expect(panel).toContainText(DEFAULT_STORY.intent)
    await expect(panel).toContainText(DEFAULT_STORY.incident)
  })
})

test.describe('the worker and the main thread agree', () => {
  test('the drill panel opens the same agent the finding named', async ({ page }) => {
    await openDashboard(page)

    // The agent finding, and the transfer count the Agents widget shows for it.
    const finding = fixFirst(page).getByRole('listitem').first()
    await expect(finding).toContainText(DEFAULT_STORY.agent)

    await finding.getByRole('button', { name: /Show the calls behind/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading')).toContainText(DEFAULT_STORY.agent)

    // The count in the header is the drill's own row count: if the worker and
    // the main-thread copy were built from different datasets, the panel would
    // describe one and list the other.
    const header = await dialog.getByRole('heading').innerText()
    const count = Number((header.match(/([\d,]+)\s+calls/)?.[1] ?? '0').replace(/,/g, ''))
    expect(count).toBeGreaterThan(0)

    const rows = dialog.getByRole('row')
    await expect(rows.nth(1)).toBeVisible()
    expect(await dialog.getByRole('table').getAttribute('aria-rowcount')).toBe(String(count + 1))
  })
})
