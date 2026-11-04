export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Polls a condition until it holds or the time is up. `abort` ends the wait early, for a server whose process died while it was awaited.
 * Resolves to whether the condition held.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 500,
  abort: () => boolean = () => false
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await condition()) {
      return true
    }
    if (abort() || Date.now() >= deadline) {
      return false
    }
    await delay(intervalMs)
  }
}
