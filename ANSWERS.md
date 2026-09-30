# Answers

## 2.1 PR review: “Peak hours” widget

### Review comments

**Overall**

Thanks for taking this on. The component is small and easy to follow, and using `useMemo` for the aggregation makes sense.

I am requesting changes before merging because the current version gives incorrect results when the browser is outside Riyadh, when the selected range does not include every call, and after the date range changes. I ran into several of these problems while building the rest of the dashboard, so I am happy to work through them together.

### Blocking

1. **The hour is calculated in the viewer’s timezone**

   `getHours()` returns the hour in the browser’s local timezone, not Riyadh time. The chart may look correct when tested in Riyadh, but the same calls will move to different bars for someone opening the dashboard in London or Los Angeles.

   Riyadh is fixed at UTC+3, so the calculation should apply that offset and then use `getUTCHours()`. Please also run this test under another timezone, for example:

   ```bash
   TZ=America/Los_Angeles npm test
   ```

   That gives us evidence that the result does not depend on the developer’s machine.

2. **The percentage uses the wrong total**

   ```ts
   const total = calls.length
   ```

   This counts every call in the dataset, while the buckets contain only calls in the selected period. If the user selects one week from a quarter, the percentages become very small and will not add up to 100%.

   Increment the total in the same loop that filters and counts the selected calls.

3. **Changing the date range can leave stale bars**

   ```ts
   useMemo(..., [calls])
   ```

   The result also depends on `from` and `to`, so both are missing from the dependency list. Changing the selected range can therefore leave the previous aggregation on screen.

   Enabling `react-hooks/exhaustive-deps` would catch this. I would also pass epoch numbers instead of `Date` objects. Numbers give `useMemo` stable value-based dependencies, while newly constructed `Date` instances are compared by reference and can make the memo recompute on every render.

4. **Sorting mutates the chart data**

   ```ts
   data.sort(...)
   ```

   `sort()` changes the memoized array in place. After the first render, the chart data is ordered by percentage rather than by hour, which scrambles the x-axis.

   The chart buckets should stay in chronological order. Use `reduce()` to find the busiest bucket without modifying the array.

5. **Rounding changes which hour appears busiest**

   ```ts
   Math.round((count / total) * 100)
   ```

   With 24 buckets, many exact shares will round to the same whole percentage. The code then chooses a winner from a tie that did not exist in the original counts.

   Keep the count and exact share in the data. Round only when displaying the percentage.

### Should fix

6. **The empty range looks like a real result**

   When there are no matching calls, the percentage calculation becomes `0 / 0`, which produces `NaN`. The heading still reports hour zero as the peak, even though there is no peak.

   Show a clear empty state such as **No calls in this period**.

7. **The upper date boundary can drop the final day**

   ```ts
   startedAt <= to
   ```

   If `to` represents midnight at the start of the final day, almost the entire final day is excluded. Those `Date` values may also have been constructed in the browser’s timezone.

   Use a half-open range based on Riyadh midnights:

   ```text
   [from, midnight after the final day)
   ```

   The condition then becomes:

   ```ts
   t >= fromMs && t < toMs
   ```

8. **The loop creates too many `Date` objects**

   The existing chain can parse the same timestamp three times per call. At 200,000 rows, that is roughly 600,000 date parses per aggregation, plus the intermediate array created by `filter()`.

   Parse each timestamp once and count it in a single loop. Longer term, this component should receive hourly counts rather than raw calls. The main dashboard already precomputes the Riyadh hour during generation and aggregates it in the worker.

### Nits

9. `9:00` should be padded and localized. Also, `14:00` looks like a single moment rather than an hourly bucket. A range such as `14:00–15:00` is clearer.

10. Explain the denominator. The chart should say that the value is the **share of calls in the selected period** and include the call count.

11. The chart needs a text alternative. A short `figcaption` describing the peak and total is enough for this widget.

### Tests I would add

I would like to see tests for:

- Running under a timezone other than Riyadh.
- A selected period with no calls.
- A range whose upper boundary is midnight.
- Two hours with the same count.
- A range containing only part of the dataset.
- Recalculation when `fromMs` or `toMs` changes.

### The version I would merge

```tsx
import { useMemo } from 'react'
import { BarChart } from './charts'

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000

export type HourBucket = {
  hour: number
  label: string
  count: number
  share: number
}

const pad = (hour: number) => String(hour).padStart(2, '0')

export function peakHours(
  calls: Call[],
  fromMs: number,
  toMs: number,
) {
  const counts = new Array<number>(24).fill(0)
  let total = 0

  for (const call of calls) {
    const startedAt = Date.parse(call.startedAt)
    if (startedAt < fromMs || startedAt >= toMs) continue

    const riyadhHour = new Date(
      startedAt + RIYADH_OFFSET_MS,
    ).getUTCHours()

    counts[riyadhHour]++
    total++
  }

  const buckets: HourBucket[] = counts.map((count, hour) => ({
    hour,
    label: `${pad(hour)}:00`,
    count,
    share: total === 0 ? 0 : count / total,
  }))

  const busiest =
    total === 0
      ? null
      : buckets.reduce((best, bucket) =>
          bucket.count > best.count ? bucket : best,
        )

  return { buckets, busiest, total }
}

type Props = {
  calls: Call[]
  fromMs: number
  toMs: number
}

export function PeakHoursChart({
  calls,
  fromMs,
  toMs,
}: Props) {
  const result = useMemo(
    () => peakHours(calls, fromMs, toMs),
    [calls, fromMs, toMs],
  )

  if (!result.busiest) {
    return <p>No calls in this period.</p>
  }

  const { buckets, busiest, total } = result
  const nextHour = pad((busiest.hour + 1) % 24)
  const range = `${busiest.label}–${nextHour}:00`
  const share = `${(busiest.share * 100).toFixed(1)}%`

  return (
    <figure>
      <h3>Busiest hour, Riyadh time: {range}</h3>
      <BarChart data={buckets} x="label" y="share" />
      <figcaption>
        {share} of {total} calls in this period started
        between {range}.
      </figcaption>
    </figure>
  )
}
```

### Helping the teammate get more from AI tools

I would spend half an hour with the teammate rewriting the prompt rather than only correcting the generated code.

The prompt should state the constraints before asking for an implementation: all hours are Riyadh hours, percentages use calls in the selected period as their denominator, date ranges are half-open, and an empty period must not produce a peak. I would also ask the tool to list its assumptions before it starts coding.

Then I would ask for the tests first, including one that runs under a different `TZ`. “It works on my machine” becomes a more useful claim when the test deliberately pretends to be another machine.

Most importantly, I would still review the result as carefully as a human-written pull request. The tool can produce code quickly, but speed does not make it the reviewer.

## 2.3 Honest charts

The most misleading chart I remember is one I built during this assessment.

The headline KPIs originally compared the selected dates with the same number of days immediately before them. I selected 17 to 26 September, and the Calls KPI reported a drop of about 2,100 calls with a **Notable change** badge.

Every number in the chart was correct. The comparison was wrong.

The selected ten days contained two Fridays and two Saturdays. The previous ten days contained only one of each, and weekend traffic is roughly half the weekday volume. Abdullah could have entered the Sunday meeting worried about a major decline that was only caused by the calendar.

The significance test made the result look more convincing. The change really was statistically significant, but it was answering the wrong question.

I fixed the comparison by shifting it back by whole weeks, so the selected range is compared with the same weekdays. The larger lesson is that fixing this one chart is not enough. If another engineer can recreate the same misleading comparison with a single prop, the component API is still too easy to misuse.

I would put the following guardrails in the shared chart layer.

### Comparisons are domain objects, not arbitrary date ranges

A chart should receive a comparison produced by one shared function. That function aligns weekdays and reports whether comparison coverage is full, partial, or unavailable.

When there is no earlier data, the component should display **No comparison data** instead of calculating a negative 100% change.

### Rates include their denominator

A rate chart should receive a numerator and denominator rather than only a percentage. It should also show the relevant call count.

If the component cannot explain what the percentage is a share of, it
