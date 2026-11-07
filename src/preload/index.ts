import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { LAUNCHER_VERSION_ARG } from '../shared/types'
import type {
  AccountsState,
  BackupSummary,
  BotSample,
  BotSummary,
  DestinationSummary,
  FolderKind,
  HomeInfo,
  LauncherState,
  LogBatch,
  NewsState,
  Problem,
  QuitAnswer,
  ReportResult,
  ServerId,
  ServerSettings,
  ServerUpdateState,
  SystemOption,
  SystemOptions,
  UpdateState
} from '../shared/types'

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
  openLogFolder: (server: ServerId): Promise<void> => ipcRenderer.invoke('launcher:open-log-folder', server),
  setLanguage: (language: 'fr' | 'en'): Promise<void> => ipcRenderer.invoke('launcher:set-language', language),
  setStartServersOnLaunch: (on: boolean): Promise<void> => ipcRenderer.invoke('settings:set-start-servers', on),
  setAutoCleanup: (on: boolean): Promise<void> => ipcRenderer.invoke('settings:set-auto-cleanup', on),
  getSystemOptions: (): Promise<SystemOptions> => ipcRenderer.invoke('system:get-options'),
  setSystemOption: (option: SystemOption, on: boolean): Promise<SystemOptions> => ipcRenderer.invoke('system:set-option', option, on),
  createReport: (): Promise<ReportResult | null> => ipcRenderer.invoke('report:create'),
  showReport: (): Promise<void> => ipcRenderer.invoke('report:show'),
  openReportIssue: (): Promise<void> => ipcRenderer.invoke('report:open-issue'),
  getBotHistory: (): Promise<BotSample[]> => ipcRenderer.invoke('bots:history'),
  start: (): Promise<boolean> => ipcRenderer.invoke('launcher:start'),
  stop: (): Promise<boolean> => ipcRenderer.invoke('launcher:stop'),
  forceStop: (server: ServerId): Promise<boolean> => ipcRenderer.invoke('launcher:force-stop', server),
  restartServer: (server: ServerId): Promise<boolean> => ipcRenderer.invoke('launcher:restart-server', server),
  getNews: (): Promise<NewsState> => ipcRenderer.invoke('news:get-state'),
  refreshNews: (): Promise<void> => ipcRenderer.invoke('news:refresh'),
  onNews: (listener: (state: NewsState) => void): (() => void) => subscribe('news:state', listener),
  setDeveloperMode: (on: boolean): Promise<void> => ipcRenderer.invoke('settings:set-developer-mode', on),
  getHomeInfo: (): Promise<HomeInfo> => ipcRenderer.invoke('home:get-info'),
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
  onServerUpdate: (listener: (state: ServerUpdateState) => void): (() => void) => subscribe('server-update:state', listener),
  /** The launcher's own version, handed over on the window's command line. */
  version: process.argv.find((arg) => arg.startsWith(LAUNCHER_VERSION_ARG))?.slice(LAUNCHER_VERSION_ARG.length) ?? null
}

export type LauncherApi = typeof launcherApi

contextBridge.exposeInMainWorld('launcher', launcherApi)
