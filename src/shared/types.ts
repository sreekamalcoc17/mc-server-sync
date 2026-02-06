// Shared type definitions for MineSync

export interface ServerConfig {
    serverPath: string
    ramMin: number
    ramMax: number
    javaPath: string
    javaArgs: string
    cloudProvider: 'google-drive' | 'onedrive'
    cloudFolderId: string
}

export interface LockInfo {
    locked: boolean
    user?: string
    timestamp?: number
    machineId?: string
}

export interface SyncProgress {
    current: number
    total: number
    file: string
    type: 'upload' | 'download'
}

export interface ServerStatus {
    running: boolean
    pid?: number
    startTime?: number
}

export interface FileMetadata {
    path: string
    size: number
    modifiedTime: number
    hash?: string
}
