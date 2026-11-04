import { useEffect, useState } from 'react'
import type { LauncherState, ServerId } from '../../shared/types'

/** The launcher's state as the main process last published it; null until the first answer. */
export function useLauncherState(): LauncherState | null {
  const [state, setState] = useState<LauncherState | null>(null)
  useEffect(() => {
    const unsubscribe = window.launcher.onState(setState)
    void window.launcher.getState().then((initial) => setState((current) => current ?? initial))
    return unsubscribe
  }, [])
  return state
}

const LINES_SHOWN = 1000

/** The last lines of a server's console log, kept up to date. */
export function useServerLogs(server: ServerId): string[] {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    setLines([])
    void window.launcher.getLogs(server).then((initial) => {
      if (!cancelled) {
        setLines(initial.slice(-LINES_SHOWN))
      }
    })
    const unsubscribe = window.launcher.onLines((batch) => {
      if (batch.server === server) {
        setLines((current) => [...current, ...batch.lines].slice(-LINES_SHOWN))
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [server])
  return lines
}
