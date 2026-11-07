import { describe, expect, it, vi } from 'vitest'
import type { LauncherState, ServerState, ServerStatus, ServerUpdateState } from '../../src/shared/types'

vi.mock('electron', () => ({ Menu: {}, nativeImage: {}, Tray: class {} }))

const { dotPixels, taskbarStatus } = await import('../../src/main/taskbar')

function server(id: ServerState['id'], status: ServerStatus): ServerState {
  return { id, status, external: false, port: null }
}

function stateWith(statuses: [ServerStatus, ServerStatus, ServerStatus], activity: LauncherState['activity'] = 'idle'): LauncherState {
  return {
    install: { serverRoot: 'D:/server', serverFound: true, clientRoot: null, clientFound: false, javaVersion: 25, clientMissing: [], clientPacks: [], clientLanguage: null },
    mysql: { status: 'ready', serviceName: null, optionsFile: null, port: 3306 },
    servers: { chat: server('chat', statuses[0]), login: server('login', statuses[1]), game: server('game', statuses[2]) },
    activity,
    quitRequested: false,
    restartNeeded: false,
    serverVersion: null,
    developerMode: false,
    startServersOnLaunch: false,
    autoCleanup: true,
    lastCleanup: null
  }
}

describe('taskbarStatus', () => {
  it('shows no mark while everything is stopped, green once one can play, red when a server failed', () => {
    expect(taskbarStatus(stateWith(['stopped', 'stopped', 'stopped']), null)).toEqual({ phase: 'stopped', mark: null, progress: null })
    expect(taskbarStatus(stateWith(['ready', 'ready', 'ready']), null).mark).toBe('ready')
    expect(taskbarStatus(stateWith(['ready', 'ready', 'failed']), null).mark).toBe('failed')
  })

  it('shows amber for anything between: a start, a stop, servers partly up', () => {
    expect(taskbarStatus(stateWith(['ready', 'starting', 'stopped'], 'starting'), null)).toMatchObject({ phase: 'starting', mark: 'busy' })
    expect(taskbarStatus(stateWith(['ready', 'ready', 'stopping'], 'stopping'), null)).toMatchObject({ phase: 'stopping', mark: 'busy' })
    expect(taskbarStatus(stateWith(['ready', 'stopped', 'stopped']), null)).toMatchObject({ phase: 'partial', mark: 'busy' })
  })

  it('fills the progress bar with a server update, and moves it without a share for a backup or a restore', () => {
    const update: ServerUpdateState = { status: 'preparing', installed: 'v0.1.0', step: 'download', percent: 42 }
    expect(taskbarStatus(stateWith(['stopped', 'stopped', 'stopped']), update).progress).toBe(0.42)
    expect(taskbarStatus(stateWith(['stopped', 'stopped', 'stopped']), { ...update, percent: undefined }).progress).toBe('indeterminate')
    expect(taskbarStatus(stateWith(['ready', 'ready', 'ready'], 'backup'), null).progress).toBe('indeterminate')
    expect(taskbarStatus(stateWith(['stopped', 'stopped', 'stopped'], 'restore'), null).progress).toBe('indeterminate')
    expect(taskbarStatus(stateWith(['ready', 'ready', 'ready']), { ...update, status: 'current' }).progress).toBeNull()
  })
})

describe('dotPixels', () => {
  it('draws a round dot: coloured in its middle, a dark ring at its edge, nothing in its corners', () => {
    const size = 32
    const pixels = dotPixels([0x5f, 0xdc, 0xb0], size)
    const at = (x: number, y: number): number[] => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)]
    expect(pixels.length).toBe(size * size * 4)
    // BGRA
    expect(at(16, 16)).toEqual([0xb0, 0xdc, 0x5f, 255])
    expect(at(16, 1).slice(0, 3)).toEqual([26, 12, 8])
    expect(at(0, 0)[3]).toBe(0)
  })
})
