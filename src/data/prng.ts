/**
 * The one source of randomness in the data layer.
 *
 * Everything is driven by a single seeded PRNG instance so a seed fully
 * determines the dataset — no `Math.random`, no time-dependent state. The
 * draws below all consume a fixed number of `rng()` calls, which is what keeps
 * the stream reproducible.
 */

/** A seeded, uniform `[0, 1)` generator. */
export type Rng = () => number

/**
 * Mulberry32: 32-bit state, one multiply-xorshift round per call.
 * Small, fast and good enough for synthetic data (it is not cryptographic).
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform real in `[min, max)`. */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Uniform integer in `[min, max]`, both ends included. */
export function uniformInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/**
 * One standard-normal-derived sample, via Box–Muller.
 * Consumes two `rng()` calls and discards the second normal — keeping no
 * cached value makes the consumption per call constant and easy to reason about.
 */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  // 1 - rng() is in (0, 1], so the log is always finite.
  const u1 = 1 - rng()
  const u2 = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** Lognormal sample with the given median (`e^mu`) and log-space spread. */
export function lognormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(normal(rng) * sigma)
}

/**
 * Index into `weights`, chosen proportionally. `total` is the sum of `weights`,
 * passed in because callers hold it as a constant rather than re-summing 200k times.
 */
export function pickWeighted(rng: Rng, weights: readonly number[], total: number): number {
  let r = rng() * total
  let i = 0
  for (const w of weights) {
    r -= w
    if (r < 0) return i
    i++
  }
  // Only reachable through floating-point slack at the very top of the range.
  return weights.length - 1
}

/** Sum of an array, used to precompute the `total` for {@link pickWeighted}. */
export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** Constrain `x` to `[lo, hi]`. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/** Linear interpolation from `a` at `t = 0` to `b` at `t = 1`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
