import { contextBridge } from 'electron'

// The only bridge between the page and Node: everything the interface may ask of the system goes through here.
const launcherApi = {
  platform: process.platform
}

export type LauncherApi = typeof launcherApi

contextBridge.exposeInMainWorld('launcher', launcherApi)
