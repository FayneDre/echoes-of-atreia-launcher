import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AccountsState, BackupSummary, BotSummary, DestinationSummary, FolderKind, LauncherState, LogBatch, Problem, QuitAnswer, ServerId, ServerSettings, ServerUpdateState, UpdateState } from '../shared/types'

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
  restartServer: (server: ServerId): Promise<boolean> => ipcRenderer.invoke('launcher:restart-server', server),
  startMysql: (): Promise<boolean> => ipcRenderer.invoke('launcher:mysql-start'),
  stopMysql: (): Promise<boolean> => ipcRenderer.invoke('launcher:mysql-stop'),
  chooseMysqlOptions: (): Promise<void> => ipcRenderer.invoke('launcher:choose-mysql-options'),
  useMysqlService: (): Promise<boolean> => ipcRenderer.invoke('launcher:use-mysql-service'),
  play: (): Promise<boolean> => ipcRenderer.invoke('launcher:play'),
  getAccounts: (): Promise<AccountsState> => ipcRenderer.invoke('accounts:get-state'),
  signIn: (name: string, password: string): Promise<Problem | null> => ipcRenderer.invoke('accounts:sign-in', name, password),
  switchAccount: (name: string): Promise<void> => ipcRenderer.invoke('accounts:switch', name),
  forgetAccount: (name: string): Promise<void> => ipcRenderer.invoke('accounts:forget', name),
  selectCharacter: (id: number): Promise<void> => ipcRenderer.invoke('accounts:select-character', id),
  listBackups: (): Promise<BackupSummary[]> => ipcRenderer.invoke('backups:list'),
  createBackup: (): Promise<Problem | null> => ipcRenderer.invoke('backups:create'),
  restoreBackup: (id: string): Promise<Problem | null> => ipcRenderer.invoke('backups:restore', id),
  removeBackup: (id: string): Promise<void> => ipcRenderer.invoke('backups:remove', id),
  openBackupFolder: (): Promise<void> => ipcRenderer.invoke('backups:open-folder'),
  listBots: (): Promise<BotSummary[] | Problem> => ipcRenderer.invoke('bots:list'),
  getDestinations: (): Promise<DestinationSummary[] | Problem> => ipcRenderer.invoke('game:destinations'),
  teleport: (destinationId: number): Promise<Problem | null> => ipcRenderer.invoke('game:teleport', destinationId),
  getServerSettings: (): Promise<ServerSettings | null> => ipcRenderer.invoke('launcher:get-server-settings'),
  saveServerSettings: (values: Record<string, number>): Promise<boolean> => ipcRenderer.invoke('launcher:save-server-settings', values),
  chooseFolder: (kind: FolderKind): Promise<void> => ipcRenderer.invoke('launcher:choose-folder', kind),
  answerQuit: (answer: QuitAnswer): Promise<void> => ipcRenderer.invoke('launcher:quit-answer', answer),
  onState: (listener: (state: LauncherState) => void): (() => void) => subscribe('launcher:state', listener),
  onLines: (listener: (batch: LogBatch) => void): (() => void) => subscribe('launcher:lines', listener),
  getUpdate: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
  onUpdate: (listener: (state: UpdateState) => void): (() => void) => subscribe('update:state', listener),
  getServerUpdate: (): Promise<ServerUpdateState> => ipcRenderer.invoke('server-update:get-state'),
  prepareServerUpdate: (): Promise<void> => ipcRenderer.invoke('server-update:prepare'),
  installServerUpdate: (): Promise<Problem | null> => ipcRenderer.invoke('server-update:install'),
  cancelServerUpdate: (): Promise<void> => ipcRenderer.invoke('server-update:cancel'),
  undoServerUpdate: (): Promise<Problem | null> => ipcRenderer.invoke('server-update:undo'),
  onServerUpdate: (listener: (state: ServerUpdateState) => void): (() => void) => subscribe('server-update:state', listener)
}

export type LauncherApi = typeof launcherApi

contextBridge.exposeInMainWorld('launcher', launcherApi)
