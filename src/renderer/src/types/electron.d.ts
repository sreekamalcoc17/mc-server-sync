// Electron API types exposed via preload script

export interface ElectronAPI {
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    getConfig: (key: string) => Promise<unknown>
    setConfig: (key: string, value: unknown) => Promise<boolean>
    getAllConfig: () => Promise<Record<string, unknown>>
    selectFolder: () => Promise<string | null>
    startServer: () => Promise<boolean>
    stopServer: () => Promise<boolean>
    getServerStatus: () => Promise<{ running: boolean; pid?: number }>
    syncPull: () => Promise<void>
    syncPush: () => Promise<void>
    checkLock: () => Promise<{ locked: boolean; user?: string; timestamp?: number }>
    acquireLock: () => Promise<boolean>
    releaseLock: () => Promise<boolean>
    onServerLog: (callback: (log: string) => void) => void
    onSyncProgress: (callback: (progress: { current: number; total: number; file: string }) => void) => void
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}
