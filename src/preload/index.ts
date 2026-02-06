import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // Configuration
    getConfig: (key: string) => ipcRenderer.invoke('config:get', key),
    setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
    getAllConfig: () => ipcRenderer.invoke('config:getAll'),

    // Dialogs
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: (filters?: { name: string; extensions: string[] }[]) =>
        ipcRenderer.invoke('dialog:selectFile', filters),

    // Server control (to be implemented)
    startServer: () => ipcRenderer.invoke('server:start'),
    stopServer: () => ipcRenderer.invoke('server:stop'),
    sendCommand: (command: string) => ipcRenderer.invoke('server:sendCommand', command),
    getServerStatus: () => ipcRenderer.invoke('server:status'),

    // Sync control
    syncPull: () => ipcRenderer.invoke('sync:pull'),
    syncPush: () => ipcRenderer.invoke('sync:push'),
    forcePull: () => ipcRenderer.invoke('sync:forcePull'),
    checkLock: () => ipcRenderer.invoke('sync:checkLock'),
    acquireLock: () => ipcRenderer.invoke('sync:acquireLock'),
    releaseLock: () => ipcRenderer.invoke('sync:releaseLock'),

    // Auto-sync control
    startAutoSync: () => ipcRenderer.invoke('autoSync:start'),
    stopAutoSync: () => ipcRenderer.invoke('autoSync:stop'),
    syncNow: () => ipcRenderer.invoke('autoSync:syncNow'),

    // Server config
    getServerProperties: () => ipcRenderer.invoke('serverConfig:getProperties'),
    setServerProperties: (changes: Record<string, unknown>) => ipcRenderer.invoke('serverConfig:setProperties', changes),
    getOps: () => ipcRenderer.invoke('serverConfig:getOps'),
    addOp: (username: string) => ipcRenderer.invoke('serverConfig:addOp', username),
    removeOp: (uuid: string) => ipcRenderer.invoke('serverConfig:removeOp', uuid),
    getWhitelist: () => ipcRenderer.invoke('serverConfig:getWhitelist'),
    addToWhitelist: (username: string) => ipcRenderer.invoke('serverConfig:addToWhitelist', username),
    removeFromWhitelist: (uuid: string) => ipcRenderer.invoke('serverConfig:removeFromWhitelist', uuid),

    // Mod manager
    getMods: () => ipcRenderer.invoke('mods:getMods'),
    toggleMod: (filename: string, enable: boolean) => ipcRenderer.invoke('mods:toggleMod', filename, enable),
    getModLoader: () => ipcRenderer.invoke('mods:getModLoader'),

    // Event listeners (removes existing before adding to prevent duplicates)
    onServerLog: (callback: (log: string) => void) => {
        // Remove ALL existing listeners first to prevent duplicates
        ipcRenderer.removeAllListeners('server:log')
        const handler = (_event: Electron.IpcRendererEvent, log: string) => callback(log)
        ipcRenderer.on('server:log', handler)
        // Return cleanup function
        return () => ipcRenderer.removeAllListeners('server:log')
    },
    onSyncProgress: (callback: (progress: { current: number; total: number; file: string }) => void) => {
        ipcRenderer.removeAllListeners('sync:progress')
        const handler = (_event: Electron.IpcRendererEvent, progress: { current: number; total: number; file: string }) => callback(progress)
        ipcRenderer.on('sync:progress', handler)
        return () => ipcRenderer.removeAllListeners('sync:progress')
    }
})

// Type declarations for the exposed API
export interface ElectronAPI {
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    getConfig: (key: string) => Promise<unknown>
    setConfig: (key: string, value: unknown) => Promise<boolean>
    getAllConfig: () => Promise<Record<string, unknown>>
    selectFolder: () => Promise<string | null>
    selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    startServer: () => Promise<boolean>
    stopServer: () => Promise<boolean>
    sendCommand: (command: string) => Promise<boolean>
    getServerStatus: () => Promise<{ running: boolean; pid?: number }>
    syncPull: () => Promise<SyncResult>
    syncPush: () => Promise<SyncResult>
    forcePull: () => Promise<SyncResult>
    checkLock: () => Promise<{ locked: boolean; user?: string; timestamp?: number }>
    acquireLock: () => Promise<boolean>
    releaseLock: () => Promise<boolean>
    startAutoSync: () => Promise<boolean>
    stopAutoSync: () => Promise<boolean>
    syncNow: () => Promise<boolean>
    // Server config
    getServerProperties: () => Promise<Record<string, string | number | boolean>>
    setServerProperties: (changes: Record<string, unknown>) => Promise<boolean>
    getOps: () => Promise<PlayerEntry[]>
    addOp: (username: string) => Promise<{ success: boolean; error?: string; player?: PlayerEntry }>
    removeOp: (uuid: string) => Promise<boolean>
    getWhitelist: () => Promise<PlayerEntry[]>
    addToWhitelist: (username: string) => Promise<{ success: boolean; error?: string; player?: PlayerEntry }>
    removeFromWhitelist: (uuid: string) => Promise<boolean>
    // Mod manager
    getMods: () => Promise<ModInfo[]>
    toggleMod: (filename: string, enable: boolean) => Promise<boolean>
    getModLoader: () => Promise<'fabric' | 'forge' | 'unknown'>
    onServerLog: (callback: (log: string) => void) => () => void
    onSyncProgress: (callback: (progress: { current: number; total: number; file: string }) => void) => () => void
}

// Mod info from mod manager
export interface ModInfo {
    filename: string
    enabled: boolean
    size: number
}

// Player entry for ops/whitelist
export interface PlayerEntry {
    uuid: string
    name: string
    level?: number
}

// SyncResult type for conflict detection
export interface SyncResult {
    filesUploaded: number
    filesDownloaded: number
    errors: string[]
    conflicts: ConflictInfo[]
    hasConflicts: boolean
}

export interface ConflictInfo {
    relativePath: string
    localModifiedTime: number
    cloudModifiedTime: number
    reason: string
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}
