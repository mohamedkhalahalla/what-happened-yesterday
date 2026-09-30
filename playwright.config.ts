/**
 * The harness that finally looks at the app.
 *
 * Every test before this one ran against jsdom, which has no layout, no
 * worker, no history stack and no second tab. All three of the reported seed
 * bugs live in exactly those gaps: a Web Worker being re-initialised, the
 * browser's back button, and the same URL opened twice. They were unreachable
 * from the unit suite by construction, which is why the unit suite was green
 * while the feature was broken.
 *
 * Kept out of `npm test`: it builds nothing but it does start a dev server and
 * a browser, and a suite people run between edits has to stay quick.
 * `npm run test:e2e`.
 */

import { defineConfig, devices } from '@playwright/test'

/** Fixed, so the dev server and the tests cannot disagree about where it is. */
const PORT = 5199
/*
 * `localhost`, not `127.0.0.1`. Vite binds to the hostname, which resolves to
 * ::1 on this machine — a config pointed at the IPv4 literal cannot reach it,
 * and the failure looks like the dev server never starting.
 */
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  /*
   * Serial. The tests drive one dev server whose worker builds a 200,000-row
   * dataset per navigation; running them in parallel would mostly measure
   * contention, and a flaky e2e suite is one that gets ignored.
   */
  workers: 1,
  fullyParallel: false,
  // Locally a failure means "look at it", not "try again until it passes".
  retries: 0,
  /*
   * Generous, because every navigation costs a 200,000-row dataset built in a
   * worker. The default 30s is a budget for a page that only has to paint, and
   * the last test in a serial run was hitting it on a warm-but-busy machine.
   */
  timeout: 60_000,
  reporter: [['list']],
  /*
   * The screenshot spec is a tool, not a test — it drives the app into a few
   * states and writes PNGs, and it is skipped unless it was asked for.
   * `npm run test:e2e:shots` sets the flag; a CLI `--grep` cannot lift a
   * `grepInvert` from the config, so the switch has to live here.
   */
  grepInvert: process.env.SHOTS === '1' ? undefined : /@screenshots/,

  use: {
    baseURL: BASE_URL,
    /*
     * The installed Google Chrome rather than Playwright's bundled Chromium.
     * `npx playwright install chromium` cannot reach the download host from
     * this machine; `channel: 'chrome'` drives the same engine through the
     * browser that is already here. Anywhere the download works, dropping
     * this line is the better default, because a pinned build is reproducible
     * and whatever Chrome the machine happens to have is not.
     */
    channel: 'chrome',
    /*
     * Traces are opt-in: `cross-env PWTRACE=1 npm run test:e2e`.
     *
     * `retain-on-failure` records continuously and deletes on success, and on
     * Windows that recording races its own temp files — three tests in one
     * run failed with `browserContext.close: ENOENT ... recording2.network`,
     * having asserted nothing. A harness that reports failures the code did
     * not cause is worse than one with no traces, because the next real
     * failure gets waved through as "probably that flake again".
     */
    trace: process.env.PWTRACE === '1' ? 'retain-on-failure' : 'off',
    // A single image written once per failure, which does not have that problem.
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Reuse a server the developer already has open; start one in CI.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
