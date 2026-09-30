/**
 * What every spec in here needs before it can look at anything.
 *
 * Two things, both learned the hard way. The app opens in Arabic, so a spec
 * that wants to read English has to say so *before* the app boots — an
 * English locator against an Arabic page matches nothing and fails as though
 * the feature were broken. And the language has to be set on the **context**
 * rather than the page, because a test that opens a second tab gets a second
 * page, and an init script attached to the first one does not follow it.
 */

import { expect, type BrowserContext, type Page } from '@playwright/test'

export type Lang = 'en' | 'ar'

/** Widget titles, per language, for `getByRole('region', { name })`. */
export const WIDGET = {
  fixFirst: { en: 'Fix first', ar: 'ابدأ بإصلاح هذه' },
  dailyTrend: { en: 'Daily trend', ar: 'الاتجاه اليومي' },
  agents: { en: 'Agents', ar: 'الوكلاء' },
  intents: { en: 'Intents', ar: 'أنواع الطلبات' },
  kpis: { en: 'Headline numbers', ar: 'الأرقام الرئيسية' },
  failureReasons: { en: 'Failure reasons', ar: 'أسباب الإخفاق' },
} as const satisfies Record<string, Record<Lang, string>>

/**
 * Pin the language and the profile for every page in this context.
 *
 * Written into `localStorage` before the app boots, so the first paint is
 * already in the language the test reads.
 */
// Not `useLanguage`: the `use` prefix makes the React hooks lint rule treat
// it as a hook called from a plain function, which it then reports as an
// error in a file that has no React in it at all.
export async function pinLanguage(context: BrowserContext, lang: Lang): Promise<void> {
  await context.addInitScript((value) => {
    window.localStorage.setItem('wy.currentUser', 'abdullah')
    window.localStorage.setItem('wy.prefs.v1.abdullah', JSON.stringify({ uiLang: value }))
  }, lang)
}

/**
 * Wait until a dataset has been built and the widgets have rendered it.
 *
 * Fix first is the last thing to settle — it needs the aggregates — so its
 * findings being on screen means a full round trip has landed.
 */
export async function waitForData(page: Page, lang: Lang = 'en'): Promise<void> {
  const widget = page.getByRole('region', { name: WIDGET.fixFirst[lang] })

  await expect(widget).toBeVisible({ timeout: 45_000 })
  await expect(widget.getByRole('listitem').first()).toBeVisible({ timeout: 45_000 })
}

/** Open the dashboard and wait for it. */
export async function openDashboard(page: Page, search = '', lang: Lang = 'en'): Promise<void> {
  await page.goto(`/${search}`)
  await waitForData(page, lang)
}

/**
 * How far the document can be scrolled sideways. Zero is the only right answer.
 *
 * `documentElement` rather than `body`: an element whose containing block is
 * the viewport — anything positioned that escaped a scroll container — widens
 * one and not the other, and that was a real bug here.
 */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}
