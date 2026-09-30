/**
 * The brief's own test: change your operating system's time zone.
 *
 * Every date in this dashboard is Asia/Riyadh, a fixed UTC+3 offset, and the
 * whole time layer exists to make that true regardless of where the browser
 * thinks it is. A reader in Los Angeles opening a link from Riyadh has to see
 * the same numbers against the same dates, or "what happened yesterday" means
 * two different days depending on who is asking.
 *
 * `npm run test:tz` already runs the unit suite under three `TZ` values, but
 * that only proves the pure functions. This proves the *app*: three real
 * browser contexts, each convinced it lives somewhere else, reading the same
 * URLs and producing byte-identical text.
 *
 * The three are chosen to break things. Los Angeles is eleven hours behind
 * Riyadh, so a naive local-midnight boundary lands on the previous day.
 * Kiritimati is UTC+14, eleven hours *ahead*, so it lands on the next one —
 * and it is the case a UTC-based implementation still gets wrong.
 */

import { expect, test, type Browser, type Page } from '@playwright/test'

import { WIDGET, openDashboard, pinLanguage } from './helpers'

const ZONES = ['Asia/Riyadh', 'America/Los_Angeles', 'Pacific/Kiritimati'] as const

/** The deploy day, as a single-day range: the narrowest window there is. */
const ONE_DAY = '?from=2026-08-25&to=2026-08-25'

/**
 * Everything on screen that a time zone could plausibly move.
 *
 * The KPI values would shift if the day boundaries did; the comparison
 * sentence and the trend summary name dates outright; and the drill panel's
 * header and first row are the finest-grained timestamps in the app — a row
 * printed in local time would differ by eleven hours between two of these
 * zones and by a whole day between the other two.
 */
async function readEverything(page: Page): Promise<Record<string, string>> {
  const kpis = page.getByRole('region', { name: WIDGET.kpis.en })
  const trend = page.getByRole('region', { name: WIDGET.dailyTrend.en })

  const values = await kpis.getByRole('button').allInnerTexts()
  const comparison = await page.getByText(/^Comparing /).innerText()
  const summary = await trend.locator('figcaption p').first().innerText()

  // The drill panel, opened from the first finding: its header carries a date
  // range and a count, and its first row carries a timestamp.
  await page
    .getByRole('region', { name: WIDGET.fixFirst.en })
    .getByRole('listitem')
    .first()
    .getByRole('button')
    .first()
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const header = await dialog.getByRole('heading').innerText()
  const firstRow = await dialog.getByRole('row').nth(1).innerText()

  return {
    kpis: values.join(' | '),
    comparison,
    summary,
    drillHeader: header,
    drillFirstRow: firstRow.replace(/\s+/g, ' ').trim(),
  }
}

/** One browser context that believes it lives in `zone`. */
async function readIn(browser: Browser, zone: string, search: string) {
  const context = await browser.newContext({ timezoneId: zone })
  await pinLanguage(context, 'en')

  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDashboard(page, search)

  /*
   * The test is only worth anything if the browser actually believes it. A
   * `timezoneId` that silently failed to apply would make every assertion
   * below compare Riyadh with Riyadh and pass for no reason.
   */
  const believes = await page.evaluate(() => ({
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: new Date('2026-08-25T12:00:00Z').getTimezoneOffset(),
  }))
  expect(believes.zone, 'the context did not adopt the time zone').toBe(zone)

  const reading = await readEverything(page)
  await context.close()
  return { ...reading, offsetMinutes: String(believes.offsetMinutes) }
}

test('the same numbers in Riyadh, Los Angeles and Kiritimati', async ({ browser }) => {
  for (const search of ['', ONE_DAY]) {
    const label = search === '' ? 'the default view' : 'a single day'

    const [riyadh, ...elsewhere] = await Promise.all(
      ZONES.map((zone) => readIn(browser, zone, search)),
    )

    for (const [index, reading] of elsewhere.entries()) {
      const zone = ZONES[index + 1]!

      // Field by field, so a failure names what moved rather than printing
      // two walls of text and leaving the diff to the reader.
      for (const key of Object.keys(riyadh!)) {
        if (key === 'offsetMinutes') continue
        expect(reading[key], `${key} differs in ${zone}, viewing ${label}`).toBe(riyadh![key])
      }

      // The three contexts really are in different places: if they were not,
      // everything above would be comparing Riyadh with itself.
      expect(reading.offsetMinutes, `${zone} has Riyadh's offset`).not.toBe(riyadh!.offsetMinutes)
    }

    // And the readings are not empty, which would make the above vacuous.
    expect(riyadh!.kpis, `${label}: no KPI values read`).not.toBe('')
    expect(riyadh!.drillFirstRow, `${label}: no drill row read`).not.toBe('')
  }
})
