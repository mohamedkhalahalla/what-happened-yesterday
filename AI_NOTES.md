# AI Notes

This project was built with AI assistance, but the architectural decisions, product judgment, visual review, and final verification remained mine. These notes explain which tools I used, where they helped, where I overruled them, and what I learned from the mistakes.

## Tools

I used two AI tools:

- **Claude on claude.ai** for discussing architecture options, choosing widgets, and working through the statistics behind the dashboard's verdicts. After I made the architectural decisions, it helped turn them into structured implementation prompts.
- **Claude Code** for implementation, tests, benchmarks, and, later in the project, the Playwright test harness.

No other AI tools were used.

## How I worked with them

Most tasks followed the same loop:

1. I made the design decision.
2. I wrote the implementation prompt.
3. The agent completed the task and reported what it changed.
4. I reviewed the code and tested the result in the browser.
5. I committed the work.

Claude Code could not inspect the running application until Playwright was introduced near the end of the build. Before that, every visual check was manual. Most of the UI problems described below were found during those browser reviews rather than by the agent or the automated tests.

Three rules were added to later prompts after earlier failures:

- **Never rewrite Git history.** I added this after the agent squashed two of my commits.
- **Report before changing detector thresholds.** I did not want a failing detector test to be made green by quietly tuning the expected behavior.
- **Check command exit codes, not grep output, before committing.** One commit was created after a failed test run because the agent treated matching output as success without checking the process result.

These rules would have been more useful in the first prompt than as lessons added halfway through the build.

## Where the tools helped most

### Test depth

AI assistance made it possible to build a deeper test suite within the available time.

The suite includes:

- Differential tests that compare the optimized engine with a slow reference implementation.
- A one-time mutation check using four deliberately planted bugs.
- Detector recall tests across 12 seeds.
- A false-alarm sweep across 50 anomaly-free quarters.
- Playwright checks across three browser timezones.

I would not have reached the same test depth within the project deadline without AI assistance.

### Checking source material instead of guessing

Before I replaced `react-grid-layout`, Claude Code checked its source and issue tracker to confirm that it did not provide the RTL and keyboard behavior the dashboard required.

It performed a similar check for Floating UI's RTL-aware start and end alignment. That was more reliable than making assumptions from package descriptions or examples.

### Honest reporting

The tools were most useful when they were explicit about uncertainty.

Claude Code reported when it could not verify a change in the browser. It also identified a contradiction in my specification: when today is Sunday, **Last week** and **Last 7 days** can describe the same dates.

It also stopped before changing detector thresholds when instructed to report first. That separation mattered because a failing test could otherwise have been made to pass by weakening the requirement instead of correcting the algorithm.

## Where I overrode the tools

### Ramadan label

Commit `ddc48c7` corrected a confident factual mistake.

The generated configuration described the July to August simulation as **Ramadan 1447 AH**. The brief asked for a Ramadan-style traffic pattern, not a historically accurate Ramadan period. Ramadan 1447 occurred in February and March 2026, so I removed the incorrect calendar claim and described the period as simulated.

### Arabic terminology

In commit `1e2b46e`, I manually corrected Arabic terminology that the AI repeatedly translated incorrectly.

That commit has the wrong message because it accidentally reused the Ramadan commit title. I left it unchanged rather than rewriting Git history.

### Git history

Claude Code squashed two of my fix commits even though the brief required committing as work progressed. I restored the original commits from a backup branch.

This is why later prompts explicitly prohibited rebasing, squashing, or rewriting existing history.

### Weekday-aligned comparisons

Commit `ad681f3` came from a problem I noticed in the browser.

The dashboard marked call volume as a notable decline for 17 to 26 September. The selected range contained two Fridays, while the immediately preceding comparison contained only one. The dashboard was detecting a calendar mismatch rather than an operational change.

I changed comparison periods to shift back by whole weeks, preserving the weekday composition of the selected range.

### Scrolling chart legend

In the Agents and Failure Reasons chart views, the legend scrolled away with the chart content.

The first proposed fix added labels to every bar. That addressed the visible symptom but introduced more visual noise and left the shared layout problem in place. I rejected that approach.

The actual cause was one missing CSS class in the shared chart frame. Fixing the frame kept the legend pinned without changing every chart.

### Badge noise

In commit `66b157b`, twelve intents were marked as **Improving**, while only one intent required attention.

I asked why a change of positive 1.9 points was highlighted in one row but not another. That investigation showed that statistical significance alone was producing too much noise.

I added materiality thresholds on top of the z-test. A change now needs to be statistically credible and operationally meaningful. The intent badges dropped from 13 to 1, leaving only the roaming issue.

### Detector thresholds

When detector tests failed for 3 of 12 seeds, the suggested options were to increase a threshold or remove the resolution rule. I chose neither.

The failures exposed problems in the method:

- The baseline ignored the quarter-wide trend.
- The spread estimate was overconfident.
- The comparison window behaved poorly near the edges.

The first correction introduced another problem. A symmetric window made the final two weeks, including yesterday, impossible to judge. During review, I replaced that approach with Theil-Sen detrending so every day could be evaluated consistently.

The final result detected 36 out of 36 planted anomalies across 12 seeds and produced no false alarms in 50 clean quarters. The clean-quarter result is evidence, not proof, and the detector still has documented limits.

### “Human or AI agents?”

The interface repeatedly used the word **agents**, but it was not always clear whether that meant human support agents or AI agents.

If I could not consistently tell from the interface, a VP reading the dashboard quickly might have the same problem. I changed the copy to use **AI agents** and **handed to a human** where the distinction mattered.

## One thing the tools got confidently wrong

The Ramadan label is the clearest example of a specific and confident factual error about the calendar context of the product.

The more important lesson, however, came from the tests. On two occasions, agent-written tests encoded a bug as the expected behavior.

One test asserted that an empty drill-down should “emit nothing.” That was the exact behavior that caused the Calls KPI to do nothing when clicked. The issue was corrected in commit `58ed2f8`.

Another test asserted that the detector should refuse to judge a day near the edge of the dataset. That behavior created the blind spot that prevented the system from evaluating yesterday.

The click tests also mocked `openDrill`, which meant they passed whether or not the real drill-down integration worked. The mock proved that a function was called, but not that clicking the KPI opened the correct view.

I now treat test names as claims that need review, not as proof that the behavior is correct. Where practical, I prefer tests that run against real data and real integration paths over tests that mock the behavior being verified.

The chat assistant also made several incorrect suggestions:

- It identified a correct downward arrow as a bug.
- It guessed the wrong cause of the Calls KPI issue.
- It suggested checking the seed in the footer, but that check passed even when the underlying seed behavior was broken.
- During the Git recovery, it assumed the backup branch contained different commits than it actually did, which caused a rebase conflict.

The seed problem was eventually caught by data-level tests, not by checking the displayed label.

## What I would do differently

If I repeated the project, I would change three things:

1. **Set up Playwright with the first UI feature.** This would let the implementation agent inspect the real page instead of relying only on code and my written reports.
2. **Put the Git, detector-threshold, and exit-code rules in the first prompt.** Each rule was added after a preventable mistake.
3. **Ask for tests against real data and integration paths from the beginning.** Mocks are useful for isolation, but they should not be the only evidence that an important user flow works.

AI assistance increased the amount of implementation and testing I could complete within the time available. It did not remove the need to inspect the application, challenge suggested fixes, verify facts, or decide what the correct behavior should be. The most valuable results came from treating the tools as fast collaborators whose work still required engineering review.