import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { FolderKind, LauncherState, LogBatch, QuitAnswer, ServerId, ServerSettings } from '../shared/types'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// The only bridge between the page and the system: everything the interface may ask goes through here.
const launcherApi = {
  platform: process.platform,
  getState: (): Promise<LauncherState> => ipcRenderer.invoke('launcher:get-state'),
  getLogs: (server: ServerId): Promise<string[]> => ipcRenderer.invoke('launcher:get-logs', server),
  start: (): Promise<boolean> => ipcRenderer.invoke('launcher:start'),
  stop: (): Promise<boolean> => ipcRenderer.invoke('launcher:stop'),
  forceStop: (server: ServerId): Promise<boolean> => ipcRenderer.invoke('launcher:force-stop', server),
  startMysql: (): Promise<boolean> => ipcRenderer.invoke('launcher:mysql-start'),
  stopMysql: (): Promise<boolean> => ipcRenderer.invoke('launcher:mysql-stop'),
  play: (): Promise<boolean> => ipcRenderer.invoke('launcher:play'),
  getServerSettings: (): Promise<ServerSettings | null> => ipcRenderer.invoke('launcher:get-server-settings'),
  saveServerSettings: (values: Record<string, number>): Promise<boolean> => ipcRenderer.invoke('launcher:save-server-settings', values),
  chooseFolder: (kind: FolderKind): Promise<void> => ipcRenderer.invoke('launcher:choose-folder', kind),
  answerQuit: (answer: QuitAnswer): Promise<void> => ipcRenderer.invoke('launcher:quit-answer', answer),
  onState: (listener: (state: LauncherState) => void): (() => void) => subscribe('launcher:state', listener),
  onLines: (listener: (batch: LogBatch) => void): (() => void) => subscribe('launcher:lines', listener)
}

export type LauncherApi = typeof launcherApi

contextBridge.exposeInMainWorld('launcher', launcherApi)
