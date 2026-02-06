import { EventEmitter } from 'events'
import { processManager } from './ProcessManager'
import { LocalFolderSync } from './LocalFolderSync'

/**
 * AutoSyncManager - Periodically syncs server files to cloud while running
 * Uses save-all/save-off/save-on sequence for safe file copying
 */
export class AutoSyncManager extends EventEmitter {
    private timer: NodeJS.Timeout | null = null
    private intervalMs: number = 0
    private isSyncing: boolean = false
    private serverPath: string = ''
    private cloudPath: string = ''
    private userName: string = ''

    private log(message: string) {
        this.emit('log', `[AutoSync] ${message}`)
    }

    configure(options: {
        serverPath: string
        cloudPath: string
        userName: string
        intervalMinutes: number
    }) {
        this.serverPath = options.serverPath
        this.cloudPath = options.cloudPath
        this.userName = options.userName
        this.intervalMs = options.intervalMinutes * 60 * 1000
    }

    /**
     * Start the auto-sync timer
     */
    start() {
        if (this.intervalMs <= 0) {
            this.log('Auto-sync disabled (interval = 0)')
            return
        }

        if (this.timer) {
            this.stop()
        }

        this.log(`Starting auto-sync every ${this.intervalMs / 60000} minute(s)`)

        this.timer = setInterval(() => {
            this.syncNow()
        }, this.intervalMs)

        // Also do an initial sync after a short delay
        setTimeout(() => this.syncNow(), 30000) // 30 seconds after start
    }

    /**
     * Stop the auto-sync timer
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
            this.log('Auto-sync stopped')
        }
    }

    /**
     * Check if currently syncing
     */
    get syncing(): boolean {
        return this.isSyncing
    }

    /**
     * Trigger an immediate sync with save sequence
     */
    async syncNow(): Promise<boolean> {
        if (this.isSyncing) {
            this.log('Sync already in progress, skipping')
            return false
        }

        if (!processManager.isRunning) {
            this.log('Server not running, skipping auto-sync')
            return false
        }

        if (!this.serverPath || !this.cloudPath) {
            this.log('Paths not configured, skipping')
            return false
        }

        this.isSyncing = true
        this.emit('syncStart')

        try {
            // Step 1: Save all world data to disk
            this.log('Saving world data...')
            await processManager.saveAll()

            // Step 2: Disable auto-save temporarily
            processManager.saveOff()

            // Step 3: Push changes to cloud
            this.log('Pushing to cloud...')
            const sync = new LocalFolderSync(
                this.serverPath,
                this.cloudPath,
                (msg) => this.emit('log', msg)
            )
            const result = await sync.push(this.userName)

            // Step 4: Re-enable auto-save
            processManager.saveOn()

            if (result.errors.length > 0) {
                this.log(`Sync completed with errors: ${result.errors.join(', ')}`)
            } else {
                this.log(`Sync complete: ${result.filesUploaded} files uploaded`)
            }

            this.emit('syncComplete', result)
            return true

        } catch (error) {
            this.log(`Sync error: ${error}`)
            // Make sure save-on is called even on error
            processManager.saveOn()
            this.emit('syncError', error)
            return false

        } finally {
            this.isSyncing = false
        }
    }
}

// Singleton instance
export const autoSyncManager = new AutoSyncManager()
