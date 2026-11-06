import { useCallback, useEffect, useState } from 'react'
import type { AccountsState, LauncherState, ServerId, UpdateState } from '../../shared/types'

/**
 * The saved accounts and the active one's characters, read again when what they depend on changes: the server folder (found at startup, or
 * chosen) and MySQL coming up.
 */
const ONLINE_REFRESH_MS = 5000

export function useAccounts(state: LauncherState | null): { accounts: AccountsState | null; reload: () => Promise<void> } {
  const [accounts, setAccounts] = useState<AccountsState | null>(null)
  const reload = useCallback(async () => setAccounts(await window.launcher.getAccounts()), [])
  const ready = state !== null && state.activity !== 'detecting'
  const serverRoot = state?.install.serverRoot
  const mysql = state?.mysql.status
  useEffect(() => {
    if (ready) {
      void reload()
    }
  }, [ready, serverRoot, mysql, reload])
  // Who is in game changes as the client opens and closes: while the game server runs, the list is read again every few seconds.
  const gameRunning = state?.servers.game.status === 'ready'
  useEffect(() => {
    if (!gameRunning) {
      return
    }
    // One read at a time: a slow database must not pile requests up, nor let an old answer land over a newer one.
    let reading = false
    const timer = setInterval(() => {
      if (!reading) {
        reading = true
        void reload().finally(() => (reading = false))
      }
    }, ONLINE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [gameRunning, reload])
  return { accounts, reload }
}

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

/** The launcher's own update, as the main process last published it; null until the first answer. */
export function useUpdate(): UpdateState | null {
  const [update, setUpdate] = useState<UpdateState | null>(null)
  useEffect(() => {
    const unsubscribe = window.launcher.onUpdate(setUpdate)
    void window.launcher.getUpdate().then((initial) => setUpdate((current) => current ?? initial))
    return unsubscribe
  }, [])
  return update
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
