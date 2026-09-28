/**
 * Where the keyboard cursor goes next.
 *
 * Pure and separate from the chart because it is the one piece of keyboard
 * navigation that is genuinely easy to get backwards, and backwards is
 * invisible until someone who reads Arabic tries it.
 *
 * The rule: **arrow keys move in the visual direction, not the data
 * direction.** Under RTL time flows leftward, so ArrowLeft moves to a *later*
 * date. Anything else means the cursor walks away from the arrow the reader
 * pressed, which is disorienting in a way that "it is technically consistent
 * with the array order" does not excuse.
 *
 * Home and End are deliberately *not* mirrored: they mean first and last in
 * the data, which is how they behave in every list, table and text field the
 * reader has ever used.
 */

/** Keys this handles. Anything else returns `null` so the event can bubble. */
export type CursorKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * The next cursor index, or `null` if the key is not one we handle.
 *
 * @param key the `KeyboardEvent.key` value
 * @param current the current index, `0 .. count - 1`
 * @param count how many points there are
 * @param isRtl whether time runs right-to-left
 */
export function moveCursor(
  key: string,
  current: number,
  count: number,
  isRtl: boolean,
): number | null {
  if (count <= 0) return null

  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    // Rightward is forward in time under LTR and backward under RTL.
    const forward = key === 'ArrowRight' ? !isRtl : isRtl
    return clamp(current + (forward ? 1 : -1), 0, count - 1)
  }

  if (key === 'Home') return 0
  if (key === 'End') return count - 1

  return null
}
