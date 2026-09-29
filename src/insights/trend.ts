/**
 * The quarter's drift, fitted robustly.
 *
 * Resolution in this business rises about three and a half points from the
 * first week to the last. Any day compared against the whole quarter is
 * therefore compared against a different business, and the earlier it is the
 * worse the mismatch — which is what made an ordinary July Tuesday look like
 * an incident.
 *
 * The previous answer was to compare each day only with its near neighbours,
 * symmetrically so the drift cancelled. That worked and was wrong: a symmetric
 * window cannot exist at the edges of the data, so the first and last fortnight
 * went unjudged — including the last week, which is the dashboard's default
 * view and the product's entire question. A detector blind to yesterday is
 * blind where it matters most.
 *
 * So the drift is measured and removed instead, and then every day in the
 * quarter is judged the same way.
 *
 * ## Why Theil–Sen
 *
 * Least squares would fit the anomalies as well as the trend: one broken
 * Tuesday pulls the line toward itself, flattening the very residual that
 * should have stood out. Theil–Sen takes the **median of the pairwise
 * slopes**, so it ignores up to about a third of the points being wrong — and
 * the thing being looked for is precisely a handful of wrong points.
 *
 * It is fitted on **weekly** rates rather than daily ones. The weekly rhythm
 * is large (Friday is half the volume of a Tuesday), and a fit over days would
 * spend its robustness on the weekday pattern instead of the drift.
 */

/** A straight line through the quarter: `y = intercept + slope · x`. */
export type LinearTrend = {
  /** Change per unit of x. X is a day offset, so this is per day. */
  slope: number
  intercept: number
}

export type TrendPoint = { x: number; y: number }

/** Middle value, averaging the two middles on an even count. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * Fit a line by the median of all pairwise slopes.
 *
 * `null` when there are fewer than two points, which is the honest answer:
 * one observation has no trend, and pretending otherwise would subtract a
 * made-up drift from every day.
 *
 * O(n²) in the number of points, which is thirteen weeks — a hundred-odd
 * slopes, computed once per metric per pass.
 */
export function theilSen(points: readonly TrendPoint[]): LinearTrend | null {
  if (points.length < 2) return null

  const slopes: number[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!
      const b = points[j]!
      // Two observations at the same x say nothing about a slope.
      if (a.x === b.x) continue
      slopes.push((b.y - a.y) / (b.x - a.x))
    }
  }
  if (slopes.length === 0) return null

  const slope = median(slopes)
  // The intercept that leaves the residuals centred on zero, taken as a
  // median for the same reason the slope is.
  const intercept = median(points.map((point) => point.y - slope * point.x))

  return { slope, intercept }
}

/** Where the fitted line sits at `x`. A missing trend is a flat one. */
export function trendAt(trend: LinearTrend | null, x: number): number {
  return trend === null ? 0 : trend.intercept + trend.slope * x
}
