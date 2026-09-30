# Answers

## 2.1 Review this pull request: “Peak hours”

### Review comments

**Overall**

Thanks for picking this up. The component is small and easy to follow, and memoizing the aggregation is the right instinct.

I am requesting changes before merging because the current version produces incorrect results outside Riyadh, uses the wrong denominator, and can show stale or reordered data. I ran into several of these problems while building the rest of the dashboard, so I am happy to work through them together.

### Blocking

1. **The hour is calculated in the viewer’s timezone**

   `getHours()` returns the hour in the browser’s local timezone, not Riyadh time. The chart may look correct on a machine in Riyadh, but the same calls will move to different bars when the dashboard is opened in London or Los Angeles.

   Riyadh is fixed at UTC+3, so the calculation should apply that offset and use `getUTCHours()`. I would also run the test under a different timezone:

   ```bash
   TZ=America/Los_Angeles npm test
   ```

   That gives us evidence that the result is independent of the developer’s machine.

2. **The percentage uses the wrong total**

   ```ts
   const total = calls.length
   ```

   This counts every call in the dataset, while the hourly buckets contain only calls in the selected range. If the user selects one week from a quarter, the shares become artificially small and will not add up to 100%.

   Increment `total` in the same loop that filters and counts the selected calls.

3. **Changing the date range can leave stale bars**

   ```ts
   useMemo(..., [calls])
   ```

   The calculation also depends on `from` and `to`, so both are missing from the dependency list. Changing the selected dates can therefore leave the previous result on screen.

   `react-hooks/exhaustive-deps` would catch this, so I would enable it. I would also pass epoch numbers rather than `Date` objects. Numbers give `useMemo` stable, value-based dependencies. If the parent creates new `Date` instances on each render, reference comparison means the memo will recompute even when the dates have not changed.

4. **Sorting mutates the chart data**

   ```ts
   data.sort(...)
   ```

   `sort()` changes the memoized array in place. After the first render, the chart data is ordered by percentage rather than by hour, which scrambles the x-axis.

   The hourly buckets should remain in chronological order. Use `reduce()` to find the busiest bucket without modifying the chart data.

5. **Rounding can change which hour appears busiest**

   ```ts
   Math.round((count / total) * 100)
   ```

   With 24 buckets, many exact shares will round to the same whole percentage. The code may then choose a winner from a tie that did not exist in the original counts.

   Keep the raw count and exact share in the data. Round only when formatting the value for display.

### Should fix

6. **An empty range looks like a real answer**

   With no matching calls, the calculation becomes `0 / 0`, which produces `NaN`. The heading still reports hour zero as the peak, even though no peak exists.

   Show a clear empty state such as **No calls in this period**.

7. **The upper date boundary can exclude the final day**

   ```ts
   startedAt <= to
   ```

   If `to` is midnight at the start of the final selected day, almost the entire day is excluded. The `Date` values may also have been constructed in the browser’s timezone.

   Use a half-open range based on Riyadh midnights:

   ```text
   [from, midnight after the final day)
   ```

   The condition then becomes:

   ```ts
   startedAt >= fromMs && startedAt < toMs
   ```

8. **The loop creates too many `Date` objects**

   The current chain can parse the same timestamp three times for every call. At 200,000 rows, that is roughly 600,000 date parses per aggregation, plus the intermediate array created by `filter()`.

   Parse each timestamp once and count it in a single loop. Longer term, the component should receive hourly counts rather than raw calls. The main dashboard already precomputes the Riyadh hour during generation and performs aggregation in the worker.

### Nits

9. `9:00` should be padded and localized. Also, `14:00` looks like a single moment rather than an hourly bucket. A range such as `14:00–15:00` is clearer.

10. Explain the denominator. The chart should say that the value is the **share of calls in the selected period** and include the selected call count.

11. The chart needs a text alternative. A short `figcaption` describing the busiest hour, share, and total is enough here.

### Tests I would add

I would like to see tests for:

- Running under a timezone other than Riyadh.
- A selected range with no calls.
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

The prompt should state the constraints before asking for an implementation: all hours are Riyadh hours, percentages use calls in the selected period as their denominator, date ranges are half-open, and an empty period must not produce a peak. I would also ask the tool to list its assumptions before writing code.

Then I would ask for the tests first, including one that runs under a different `TZ`. “It works on my machine” becomes a more useful claim when the test deliberately pretends to be another machine.

Most importantly, I would still review the result as carefully as a human-written pull request. The tool can produce code quickly, but it is not the reviewer.

## 2.2 Did the dashboard help?

### How the 45% was measured

The 45% came from a before-and-after comparison of how long the team took to reach an agreed action on recurring KPI questions.

The measurement started when a question was raised and ended when the team agreed what to do about it. Before the dashboard, apparently simple questions often led to a manual reporting exercise. Even the meaning of “call performance” varied between people, so time was spent agreeing on the metric before discussing the result.

The dashboard gave each KPI a clear definition and broke it down by day, agent, and call type. That changed the conversation from:

> What exactly does this number mean?

to:

> What should we do about it?

I would present the 45% carefully. It came from an observational before-and-after comparison, not a controlled experiment. The result shows that decision time fell after the dashboard was introduced, but it does not prove that the dashboard caused the entire improvement. The team may also have become more familiar with the KPIs, changed its meeting process, or improved its reporting in other ways.

### Why percentages alone can mislead

Part of making the KPIs easier to understand was showing the counts and baselines behind every percentage.

For example, **missed calls increased by 50%** sounds serious. If the count moved from 4 to 6 out of 2,000 calls, however, the increase may not be operationally important.

On the other hand, **average wait time increased by 5%** sounds small. If the average rose from 10 to 10.5 minutes across 10,000 calls, that represents thousands of additional customer-minutes.

A large percentage is not automatically important, and a small percentage is not automatically harmless. The meaning depends on the baseline, denominator, absolute volume, and what the team can act on.

For that reason, every percentage in the dashboard should appear with:

- Its raw count or denominator.
- The previous value or comparison baseline.
- Enough context to judge the operational impact.
- An indication of whether the change is outside normal variation.

### How I would test whether Abdullah’s dashboard changes decisions

Usage alone would not prove that the dashboard is useful. Abdullah could open a widget every week because it is the first item on the page, not because it changes an action.

I would combine product instrumentation with a lightweight decision log and short interviews.

#### What I would instrument

I would collect:

- Which widgets Abdullah opens.
- How often each widget is used and how long it remains visible.
- Filters and drill-downs used within each widget.
- The order in which Abdullah visits the widgets.
- Where Abdullah stops or leaves the dashboard.
- Exports or copied links associated with each widget.
- Whether Abdullah returns to another tool after viewing the dashboard.

I would avoid interpreting time on a widget by itself. A long duration might mean careful analysis, confusion, or that the dashboard was left open during a meeting.

#### The decision log

When Abdullah takes an operational action, such as reassigning staff, investigating an intent, or escalating an incident, the dashboard could ask for a lightweight tag indicating what informed the decision.

The log should remain optional and quick. If recording the decision takes longer than making it, Abdullah will stop using it.

The purpose is to connect dashboard use to a real action, not merely to count clicks.

#### What I would ask Abdullah

I would ask concrete questions about recent decisions:

- “What decisions did you make last week, and what did you look at before making them?”
- “Which widget do you check first, and why?”
- “Was there a point when the dashboard changed your mind or showed something you did not expect?”
- “What would you have done if the dashboard did not exist?”
- “What do you still check outside the dashboard?”
- “Which number do you trust least?”
- “Which widget takes the longest to understand?”

The question about outside tools matters most. If Abdullah still opens a spreadsheet, asks a colleague for a report, or checks another dashboard before acting, this dashboard is probably missing information or has not earned enough trust.

### What would make me remove a widget

I would consider removing or redesigning a widget when it is:

- Not viewed for four to six weeks.
- Viewed regularly but never connected to a decision.
- Duplicating information that another widget communicates more clearly.
- Frequently misunderstood or used to reach the wrong conclusion.
- Missing the context needed to support an action.
- Unable to answer a question Abdullah actually asks.
- Something Abdullah cannot connect to a possible response.

I would not delete a widget from analytics alone. Some widgets support rare but important incidents and may go unused during a normal month. Before removing one, I would ask Abdullah when the widget would matter and what would replace it.

The core test is straightforward:

> If this widget changed tomorrow, would anyone make a different decision?

If the honest answer is no, the widget is probably decoration rather than decision support.


## 2.4 200,000 rows and a disagreement

**Decision: push back and propose an alternative.**

Hi [name],

Thanks for thinking through where the aggregation should live. You are right that the frontend is fast today. In my take-home implementation, a Web Worker can aggregate 200,000 calls in roughly 1 to 5 ms.

I still would not make 200,000 raw call rows the normal contract between the backend and the dashboard. The concern is not whether JavaScript can run the aggregation loop. The larger costs are network transfer, parsing, memory, data exposure, and keeping metric definitions consistent.

### Payload size

At roughly 200 bytes per row, 200,000 calls would produce around 40 MB of JSON before the dashboard rendered anything. The actual payload could be larger depending on field names, timestamps, string values, and transport overhead.

That creates a slow initial load and transfers far more data than most charts need. It will also become more expensive as tenants and date ranges grow.

### Memory and responsiveness

The browser needs more memory than the downloaded JSON size. It must retain the response text, parse it, allocate objects and strings, and then hold whatever derived data the UI creates.

On an older laptop, tablet, phone, or already busy browser tab, parsing and storing 200,000 objects can cause pauses even if the later aggregation loop is fast. A Web Worker protects the main thread from computation, but it does not remove the network and memory costs.

### Data exposure

Raw call rows may contain caller information, agent identifiers, timestamps, and other record-level fields that most dashboard users do not need.

Anything delivered to the browser can be inspected through developer tools, regardless of whether it is visible in the interface. Sending record-level data for an aggregate chart increases exposure without adding product value.

That is likely to become a concern for banking and government customers during access-control and PDPL reviews.

### One source of truth

Metrics such as resolution rate and average handle time should have one shared definition.

If the browser calculates them independently, the dashboard, exports, alerts, and public API can gradually develop different rules for exclusions, missing values, and edge cases. The numbers may then disagree even when every individual implementation seems reasonable.

The backend should own metric definitions. The frontend should receive defined counts or metrics and concentrate on interaction, comparison, and presentation.

### Scalability

Two hundred thousand rows are manageable in a prototype. Two million rows are a different contract.

Making raw rows the default means that payload size and browser memory grow directly with call volume. That puts a hard ceiling on the design and makes the experience depend on the user’s device.

### What I would propose instead

I would split the contract into aggregate and drill-down APIs.

#### Aggregation endpoint

The backend would provide an endpoint such as:

```text
GET /calls/stats
  ?from=...
  &to=...
  &groupBy=day,agent
```

It would return only the counts required by the charts, grouped by dimensions such as:

- Day.
- Hour.
- Agent.
- Intent.
- Language.
- Outcome.

The response should use a compact representation, ideally columnar for larger result sets. The database performs the expensive reduction close to the data, and common requests can be cached.

The browser can still sort, filter, compare, and switch chart series interactively because it is working with a few hundred or thousand aggregate rows rather than every call.

#### Paginated drill-down

When a user asks to inspect individual calls, the frontend would request matching rows on demand.

The drill-down endpoint should use cursor-based pagination, with perhaps 100 to 500 rows per page, and enforce permissions on the server.

This limits record-level data to the users and moments that actually require it.

#### Shared metric definitions

The backend should own the definitions of metrics such as resolution rate, transfer rate, average handle time, and tool-error rate.

The frontend can calculate presentational values from returned counts where appropriate, but it should not invent a separate business definition.

### How I would resolve the disagreement

I would offer to have the frontend team document the exact queries, groupings, and drill-downs the product needs, so the backend team is not forced to guess at the API.

If we still disagreed, I would suggest a one-day spike using a realistic tenant dataset. We could compare both approaches on:

- Compressed payload size.
- Time to first useful render.
- Peak browser memory.
- Main-thread blocking.
- Filter latency.
- Server query time.
- Behavior on a mid-range laptop and constrained connection.

If the measurements show that raw rows are acceptable for smaller tenants or short date ranges, I would be open to supporting both modes. I would not, however, make record-level data the default for every tenant and every chart.

Could we schedule 30 minutes to agree on the API shape and define the spike?

Thanks,  
Mohamed

## 3.1 Beyond the bar chart

### Language-switch recovery

[Figma prototype: Language Switch KPI](https://www.figma.com/design/boRkeVVq3PtOk6kpnSUsTv/Language-Switch-KPI?node-id=0-1&t=sTk7wId5I0EyNnEu-1)

The chart follows what happens when a caller changes language during a conversation with the AI. Instead of showing only how many calls contained a language switch, it shows the AI’s behavior around the moment of the switch: whether the AI detected the new language, how long it took to respond correctly, and whether the call recovered or was handed to a human.

The question it answers is:

> When a caller changes language, does the AI recover quickly enough to keep the conversation going?

A single success-rate KPI would hide the sequence. A call might eventually be resolved but still force the caller to repeat the question several times. Another call might be handed to a human immediately even though the language was detected correctly. The chart separates detection from recovery, making it easier to see where the failure occurred.

This matters in a bilingual Arabic and English product. A caller may begin with a greeting in one language, switch while explaining the issue, or use English terms inside an Arabic sentence. I would not treat every detected language change as a clean switch.

The chart could still mislead if it includes only failed calls or treats automatic language detection as ground truth. Short phrases, names, and technical terms may be classified as language changes even when the caller did not intend to switch.

I would compare resolved and unresolved calls, show the number of calls behind each result, and let the reviewer inspect examples where the detection confidence was low. I would also separate three outcomes:

- The AI detected the switch and continued successfully.
- The AI detected the switch but failed to recover.
- The AI did not detect the switch.

The view would require turn-level data: detected language, detection confidence, response language, timestamps, repeated utterances, handoffs, and the final call outcome. Without those events, the dashboard could count language changes but could not explain how the AI behaved after them.

## 3.2 My corner of the web

Before this assessment, I built a small conversation-analytics dashboard for myself in Arabic and English.

When I returned to it and properly reviewed the Arabic version, the page looked mirrored at first glance. The parts that mattered were not.

Numbers and dates were formatted using the browser’s locale rather than the language selected in the application. The Arabic view therefore changed depending on the machine opening it.

The main line chart did not mirror. Time still moved from left to right, and the value axis stayed on the left.

The date picker used physical CSS classes such as `text-left` and `left-0`. Its popover opened on the wrong side, and its arrows followed the English layout.

What stayed with me was how easy these problems were to miss. Every feature passed in English. The Arabic interface was not completely broken either. It was just inconsistent enough that an Arabic-speaking user might accept it as another half-mirrored product.

I did not want to rely on remembering every RTL detail during review, so each mistake became a guardrail in this project:

- One formatting module owns every locale-sensitive operation.
- Linting rejects physical left and right CSS.
- Charts receive direction from one shared source.
- Keyboard movement follows visual direction.
- Time axes and popovers mirror with the interface.

I would like to turn those lessons into a small open-source checklist for RTL dashboards. Not a general internationalization guide, but a practical list of failures that still pass unnoticed when a team tests only in English.