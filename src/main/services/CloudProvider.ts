import { FileMetadata, LockInfo, SyncProgress } from '../../shared/types'

/**
 * Abstract interface for cloud storage providers.
 * This allows swapping between Google Drive, OneDrive, etc.
 */
export interface CloudProvider {
    /** Provider name for display */
    readonly name: string

    /** Check if authenticated */
    isAuthenticated(): Promise<boolean>

    /** Initiate OAuth flow */
    authenticate(): Promise<boolean>

    /** List files in a remote folder */
    listFiles(folderId: string): Promise<FileMetadata[]>

    /** Download a file to local path */
    downloadFile(
        fileId: string,
        localPath: string,
        onProgress?: (progress: SyncProgress) => void
    ): Promise<void>

    /** Upload a file from local path */
    uploadFile(
        localPath: string,
        remoteFolderId: string,
        fileName: string,
        onProgress?: (progress: SyncProgress) => void
    ): Promise<string> // Returns file ID

    /** Delete a remote file */
    deleteFile(fileId: string): Promise<void>

    /** Read a small text file (for lock files) */
    readTextFile(fileId: string): Promise<string>

    /** Write/update a small text file (for lock files) */
    writeTextFile(
        folderId: string,
        fileName: string,
        content: string
    ): Promise<string> // Returns file ID

    /** Find file by name in folder */
    findFileByName(folderId: string, fileName: string): Promise<string | null>

    /** Create a folder */
    createFolder(parentId: string, name: string): Promise<string>

    /** Get file metadata */
    getFileMetadata(fileId: string): Promise<FileMetadata | null>
}

/**
 * Lock Manager - Handles distributed locking via cloud storage
 */
export class LockManager {
    private provider: CloudProvider
    private folderId: string
    private lockFileName = 'server_lock.json'
    private heartbeatInterval: NodeJS.Timeout | null = null
    private readonly STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

    constructor(provider: CloudProvider, folderId: string) {
        this.provider = provider
        this.folderId = folderId
    }

    async checkLock(): Promise<LockInfo> {
        try {
            const lockFileId = await this.provider.findFileByName(this.folderId, this.lockFileName)

            if (!lockFileId) {
                return { locked: false }
            }

            const content = await this.provider.readTextFile(lockFileId)
            const lockData = JSON.parse(content) as LockInfo

            // Check if lock is stale
            if (lockData.timestamp) {
                const age = Date.now() - lockData.timestamp
                if (age > this.STALE_THRESHOLD_MS) {
                    return {
                        locked: true,
                        user: lockData.user,
                        timestamp: lockData.timestamp,
                        // Mark as stale for UI to show "Force Unlock" option
                    }
                }
            }

            return lockData
        } catch (error) {
            console.error('Error checking lock:', error)
            return { locked: false }
        }
    }

    async acquireLock(userName: string, machineId: string): Promise<boolean> {
        try {
            const existingLock = await this.checkLock()

            if (existingLock.locked && existingLock.user !== userName) {
                return false
            }

            const lockData: LockInfo = {
                locked: true,
                user: userName,
                timestamp: Date.now(),
                machineId
            }

            await this.provider.writeTextFile(
                this.folderId,
                this.lockFileName,
                JSON.stringify(lockData, null, 2)
            )

            // Start heartbeat
            this.startHeartbeat(userName, machineId)

            return true
        } catch (error) {
            console.error('Error acquiring lock:', error)
            return false
        }
    }

    async releaseLock(): Promise<boolean> {
        try {
            this.stopHeartbeat()

            const lockFileId = await this.provider.findFileByName(this.folderId, this.lockFileName)

            if (lockFileId) {
                await this.provider.deleteFile(lockFileId)
            }

            return true
        } catch (error) {
            console.error('Error releasing lock:', error)
            return false
        }
    }

    async forceUnlock(): Promise<boolean> {
        // Same as release, but intended for stale locks
        return this.releaseLock()
    }

    private startHeartbeat(userName: string, machineId: string) {
        this.stopHeartbeat()

        this.heartbeatInterval = setInterval(async () => {
            try {
                const lockData: LockInfo = {
                    locked: true,
                    user: userName,
                    timestamp: Date.now(),
                    machineId
                }

                await this.provider.writeTextFile(
                    this.folderId,
                    this.lockFileName,
                    JSON.stringify(lockData, null, 2)
                )
            } catch (error) {
                console.error('Heartbeat failed:', error)
            }
        }, 60000) // Every minute
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
            this.heartbeatInterval = null
        }
    }
}
