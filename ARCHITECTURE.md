# Architecture
This document explains how **What Happened Yesterday?** is built and why. The README covers setup, product decisions, scope cuts, and the decision log.

## 1. Context and constraints
Abdullah has ten minutes before the Sunday operations meeting. He needs three answers: are the AI agents resolving more calls than last week, where are they failing, and what should the team fix first? His VP wants the dashboard in Arabic.

Four constraints shaped the design:
1. There is no backend; the browser generates 200,000 calls.
2. Every date means Asia/Riyadh, regardless of browser timezone.
3. Filters must feel immediate at the full dataset size.
4. Arabic, RTL, keyboard use, and screen readers must work from the start.

The timezone rule had the widest effect. It moved calendar logic into one integer-based module, removed browser-local date behavior, and kept `Date` construction out of hot loops.

## 2. System overview
```text
URL (?from, to, agents, intents, language, compare, drill, seed)
  -> useFilterState / useSeed                 URL is the view state
  -> EngineClient                             latest response wins
  -> Web Worker: generate / aggregate         counts only
  -> main thread: rates / z-tests / detectors
  -> widgets render
  -> click -> openDrill -> URL drill parameter
  -> Web Worker: drill / sortRows             row indexes
  -> virtualized table: getCall(copy, row)    visible calls only
```

The worker handles generation, aggregation, drill-down, and sorting. It returns compact count arrays. Rates, z-tests in `stats.ts`, and detectors in `detect.ts` run as pure functions on the main thread, where the inputs are only a few thousand counts.

A production backend would mainly replace the worker's `init()` step. Once the columns are loaded, filtering, statistics, detectors, widgets, and drill-down can stay unchanged.

## 3. Data model and generation
Calls are stored by column instead of as 200,000 objects. Typed arrays hold timestamps, duration, coded dimensions, `handoff`, `sentStart`, `sentEnd`, `toolErrors`, `dayIdx`, and `hour`. The result is about 3 MB rather than roughly 40 MB of objects, with cheaper scans and structured cloning.

The public `Call` type remains unchanged. `getCall(ds, i)` reconstructs one call for the table or details view. Since virtualization displays about 30 rows, expanding the entire dataset would waste memory and time.

`dayIdx` and `hour` are computed during generation, so date filters use integer comparisons. This is the same idea as enriching CDRs at ingestion instead of query time, which I use in my telecom work: pay the conversion cost once and make every later query simpler. `dayStartRow` records each day's row range.

Generation is deterministic: Mulberry32, seed `20260927`, fixed today 2026-09-27, and 90 days from 2026-06-29 through 2026-09-26. It takes about 110 to 160 ms. Volume follows the Saudi workweek, with Friday at 45% and Saturday at 65% of a workday's volume, gentle quarterly growth, and slowly improving resolution. A simulated Ramadan-style period from 2026-07-24 to 2026-08-22 shifts the evening peak to 21:00 through 01:00; it is not Ramadan 1447.

For the default seed, anomaly placement is fixed by hand: Majed transfers too often while handling the same intent mix as his peers, so the cause is the agent and not harder calls; roaming resolution falls from about 69% to 47% between the first and last four weeks; and a bad deployment affects 2026-08-25 from 09:00 to 18:00. Other seeds use a separate random stream in `storyFor(seed)`, so placement does not alter the base call sequence.

`generateDataset(seed, { anomalies: false })` creates the same quarter without planted problems, which supports anomaly-free sweeps. The default dataset is hash-pinned so documented figures cannot drift. Ground truth is limited to generation and tests; linting prevents dashboard code from importing it.

## 4. Computation and performance
`aggregate()` scans all 200,000 rows once. Trends and sparklines require the full quarter, so limiting the scan to the selected dates would not remove the main work. It returns counts, not percentages: counts compose across periods, while rates do not.

`drill()` returns matching row numbers in a transferred `Uint32Array`. `sortRows()` sorts indexes rather than objects, using localized rank arrays. The worker keeps the dataset and hands the main thread a structured-clone copy, so visible rows can be rebuilt immediately during scrolling.

Requests carry the dataset generation they target. Responses from older generations are dropped, preventing stale results after seed changes. This guard fixed a bug where widgets queried before the replacement dataset had loaded because React child effects ran before the parent's effect.

| Operation | Median / p95 |
| --- | --- |
| Aggregate | 0.7 to 4.4 ms / under 8 ms |
| Object plus `new Date` baseline | 7 to 48 ms / up to 60 ms, 7 to 15 times slower |
| Drill-down | 0.2 to 0.9 ms / under 1.6 ms |
| Sort 200,000 rows | 34 to 52 ms / under 58 ms, in the worker |
| Last-week query in the browser (warm) | about 6 ms in the worker, 8 to 15 ms round trip; the first query after load is slower while the page starts up |

## 5. Riyadh time and URL state
Asia/Riyadh is fixed at UTC+3 with no daylight saving. `src/lib/time/riyadh.ts` represents dates as days since 1970-01-01 in Riyadh and never uses local `Date` getters. Weeks start on Sunday.

Comparisons are weekday-aligned. Seven days shift back 7, 10 shift back 14, and 30 shift back 35. My first version used the immediately preceding dates. For 17 to 26 September, it reported a false notable volume drop because one range contained two Fridays and the other only one. Moving by whole weeks fixed the comparison. Coverage is `full`, `partial`, or `none`; missing history produces "No comparison data," not negative 100%.

ESLint bans local `Date` getters and restricts `Intl` and `toLocale*` to `src/lib/format.ts`. Unit tests run under UTC, Los Angeles, and Kiritimati; Playwright repeats the same-number check in three browser timezones.

The URL stores `from`, `to`, `agents`, `intents`, `language`, `compare`, `drill`, and `seed`. Explicit Riyadh dates make shared views reproducible. Filters replace history entries, while drill-down and seed actions push entries, so Back closes a drill-down instead of replaying every filter click. Invalid dates, IDs, or ranges are repaired with a notice rather than throwing. UI language is a per-user preference, not part of the URL, so a shared link shares the view, not the reader's language. Layouts are stored per user, versioned, validated, and migrated.

## 6. Layout, statistics, and insights
I initially planned to use `react-grid-layout`, then replaced it before writing the layout layer. Its positions are left-based, it lacks proper RTL behavior, and it has no keyboard drag or resize. The replacement uses the `dnd-kit` library with a 12-column CSS grid, which mirrors naturally. Widths are limited to 4, 6, 8, or 12 columns; heights are S, M, or L. Menus provide resizing and **Move earlier / Move later**, the non-drag alternative WCAG 2.2 requires, while DOM order always matches visual order.

Rate changes use a two-proportion z-test; counts use a Poisson approximation. Statistical significance asks whether a change is likely real. Materiality asks whether it is worth acting on: 1 point for headline KPIs, 3 points for an intent, agent, or reason, and 5% for volume. Both must pass. Across the quarter, that reduced 13 intent badges to one useful warning: roaming.

Charts start at zero, show the whole quarter with the selected period highlighted, avoid dual axes, share a 0 to 100% sparkline scale, and normalize failure reasons per 100 calls.

**Fix first** runs three detectors over aggregate counts:
- An outlier agent must have at least 1.5 times the median transfer rate and differ notably from pooled peers.
- A declining intent compares the first four full weeks with the last four and requires at least a 3-point decline.
- An incident day uses Theil-Sen detrending and same-weekday residuals. It requires 200 calls, robust z of at least 4, and either 5 additional tool-error points or a 3-point resolution loss.

Ongoing issues are ranked by extra failures per week; past incidents are listed by date. For the default seed, Majed adds about 594 transfers per week, roaming about 147 unresolved calls, and 25 August has tool errors 4.6 times a normal Tuesday.

Tests detected all 36 planted anomalies across 12 seeds. Fifty anomaly-free quarters produced no false alarms against a budget of at most 0.1 per quarter. This is evidence, not proof. The model still assumes a linear trend, does not handle step changes, and has no measured minimum intent volume.

## 7. Arabic, RTL, and accessibility
Arabic is the default, and typed dictionaries make missing translations a TypeScript error. Numbers use Western digits through `ar-SA-u-nu-latn`. Saudi business and telecom dashboards commonly use them, and they scan faster in dense charts. All formatting goes through `Intl` in one module, so switching to Arabic-Indic digits is a one-line change. In RTL, time moves right to left, the value axis moves to the right, and arrow keys follow visual direction. Legends follow the reading direction and always carry text labels, never color alone. Unicode isolates and `<bdi>` protect mixed-direction values.

Linting bans physical CSS such as `left`, `marginLeft`, and `text-left`; bars use `inline-size`, and Floating UI mirrors start and end placement. These rules came from an earlier dashboard I built. It formatted numbers from the browser locale, left a line chart unmirrored, and used physical classes in its date picker. Each failure became a guardrail here.

Charts use the Okabe-Ito palette and avoid red-versus-green-only meaning. Each chart has a short description, a table view, keyboard navigation, and live announcements. Drill-down is a dialog; the mounted dashboard becomes `inert`, and focus returns to the trigger. The virtualized table exposes `aria-rowcount`, while its scroll container, not every row, receives focus.

## 8. Testing and known limits
Unit tests cover pure logic under three timezones. Differential tests require the optimized engine to match a slow reference. During development, they were mutation-checked once: four deliberately planted engine bugs each failed 20 to 24 tests. There is no claim of continuous mutation testing or CI.

Detector tests cover recall and false alarms. jsdom checks markup, focus counts, and chart structure. Serial Playwright tests cover URL history, three timezones, drill-down and Back, and horizontal overflow in Arabic and English at 1440 px and 390 px.

Not yet covered are a keyboard-only phone-width pass, screenshot freshness, pinned Chromium, and step-change trends. Hijri dates, dark mode, export, the peak-hours heatmap widget, and an ARIA grid for the intent table were deliberately left out.