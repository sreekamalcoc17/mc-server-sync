import fs from 'fs/promises'
import { existsSync, createReadStream, createWriteStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'

interface FileInfo {
    relativePath: string
    size: number
    modifiedTime: number
    hash: string
}

interface Manifest {
    files: Record<string, FileInfo>
    lastUpdated: number
    lastHost: string
}

export interface ConflictInfo {
    relativePath: string
    localModifiedTime: number
    cloudModifiedTime: number
    reason: string
}

export interface SyncResult {
    filesUploaded: number
    filesDownloaded: number
    errors: string[]
    conflicts: ConflictInfo[]  // Files where local is newer than cloud
    hasConflicts: boolean
}

/**
 * LocalFolderSync - Syncs between server folder and Google Drive Desktop folder
 * Uses manifest.json to track file hashes for precise change detection
 */
export class LocalFolderSync {
    private serverPath: string
    private cloudPath: string
    private manifestPath: string
    private lockPath: string
    private onLog?: (message: string) => void

    // Ignore patterns
    private ignorePatterns = [
        'logs',
        'crash-reports',
        '*.log',
        'session.lock',
        '.git',
        'node_modules'
    ]

    constructor(
        serverPath: string,
        cloudPath: string,
        onLog?: (message: string) => void
    ) {
        this.serverPath = serverPath
        this.cloudPath = cloudPath
        this.manifestPath = path.join(cloudPath, 'minesync_manifest.json')
        this.lockPath = path.join(cloudPath, 'server_lock.json')
        this.onLog = onLog
    }

    private log(message: string) {
        this.onLog?.(`[Sync] ${message}`)
    }

    /**
     * Check if cloud folder is properly set up
     */
    async validatePaths(): Promise<{ valid: boolean; error?: string }> {
        if (!existsSync(this.serverPath)) {
            return { valid: false, error: `Server path does not exist: ${this.serverPath}` }
        }
        if (!existsSync(this.cloudPath)) {
            return { valid: false, error: `Cloud sync folder does not exist: ${this.cloudPath}` }
        }
        return { valid: true }
    }

    /**
     * Check lock status
     */
    async checkLock(): Promise<{ locked: boolean; user?: string; timestamp?: number }> {
        try {
            if (!existsSync(this.lockPath)) {
                return { locked: false }
            }
            const content = await fs.readFile(this.lockPath, 'utf-8')
            const lock = JSON.parse(content)

            // Check if lock is stale (> 5 minutes)
            const STALE_THRESHOLD = 5 * 60 * 1000
            if (lock.timestamp && Date.now() - lock.timestamp > STALE_THRESHOLD) {
                this.log('Lock is stale (> 5 minutes old)')
                return { locked: true, user: lock.user, timestamp: lock.timestamp }
            }

            return { locked: lock.locked, user: lock.user, timestamp: lock.timestamp }
        } catch {
            return { locked: false }
        }
    }

    /**
     * Acquire lock
     */
    async acquireLock(userName: string): Promise<boolean> {
        try {
            const existing = await this.checkLock()
            if (existing.locked && existing.user !== userName) {
                this.log(`Cannot acquire lock - held by ${existing.user}`)
                return false
            }

            const lockData = {
                locked: true,
                user: userName,
                timestamp: Date.now(),
                machineId: require('os').hostname()
            }

            await fs.writeFile(this.lockPath, JSON.stringify(lockData, null, 2))
            this.log(`Lock acquired by ${userName}`)
            return true
        } catch (error) {
            this.log(`Error acquiring lock: ${error}`)
            return false
        }
    }

    /**
     * Release lock
     */
    async releaseLock(): Promise<boolean> {
        try {
            if (existsSync(this.lockPath)) {
                await fs.unlink(this.lockPath)
                this.log('Lock released')
            }
            return true
        } catch (error) {
            this.log(`Error releasing lock: ${error}`)
            return false
        }
    }

    /**
     * Calculate MD5 hash of a file
     */
    private async calculateHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5')
            const stream = createReadStream(filePath)
            stream.on('data', (data) => hash.update(data))
            stream.on('end', () => resolve(hash.digest('hex')))
            stream.on('error', reject)
        })
    }

    /**
     * Load manifest from cloud folder
     */
    private async loadManifest(): Promise<Manifest> {
        try {
            if (existsSync(this.manifestPath)) {
                const content = await fs.readFile(this.manifestPath, 'utf-8')
                return JSON.parse(content)
            }
        } catch {
            // Ignore parse errors, return empty manifest
        }
        return { files: {}, lastUpdated: 0, lastHost: '' }
    }

    /**
     * Save manifest to cloud folder
     */
    private async saveManifest(manifest: Manifest): Promise<void> {
        await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2))
    }

    /**
     * Scan a folder and return file info with hashes
     * Uses cached hashes from manifest when size+mtime match (performance optimization)
     */
    private async scanFolder(
        folderPath: string,
        cachedFiles?: Record<string, FileInfo>
    ): Promise<Map<string, FileInfo>> {
        const files = new Map<string, FileInfo>()
        let hashesReused = 0
        let hashesComputed = 0

        const scan = async (dir: string) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true })

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name)
                    const relativePath = path.relative(folderPath, fullPath).replace(/\\/g, '/')

                    if (this.shouldIgnore(entry.name, relativePath)) {
                        continue
                    }

                    if (entry.isDirectory()) {
                        await scan(fullPath)
                    } else if (entry.isFile()) {
                        const stats = await fs.stat(fullPath)
                        const cached = cachedFiles?.[relativePath]

                        let hash: string

                        // Optimization: If size AND mtime match cached values, trust the cached hash
                        if (cached &&
                            cached.size === stats.size &&
                            Math.abs(cached.modifiedTime - stats.mtimeMs) < 1000) { // 1 second tolerance
                            hash = cached.hash
                            hashesReused++
                        } else {
                            // File changed or not in cache - compute new hash
                            hash = await this.calculateHash(fullPath)
                            hashesComputed++
                        }

                        files.set(relativePath, {
                            relativePath,
                            size: stats.size,
                            modifiedTime: stats.mtimeMs,
                            hash
                        })
                    }
                }
            } catch (error) {
                this.log(`Error scanning ${dir}: ${error}`)
            }
        }

        await scan(folderPath)

        if (cachedFiles) {
            this.log(`Scan complete: ${hashesReused} hashes reused, ${hashesComputed} computed`)
        }

        return files
    }

    /**
     * Copy a file with progress (streaming for large files)
     */
    private async copyFile(src: string, dest: string): Promise<void> {
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await pipeline(
            createReadStream(src),
            createWriteStream(dest)
        )
    }

    /**
     * Pull changes from cloud to server (before starting)
     * Detects conflicts where local files are newer than cloud files
     */
    async pull(userName: string, forcePull: boolean = false): Promise<SyncResult> {
        const result: SyncResult = {
            filesUploaded: 0,
            filesDownloaded: 0,
            errors: [],
            conflicts: [],
            hasConflicts: false
        }

        const validation = await this.validatePaths()
        if (!validation.valid) {
            result.errors.push(validation.error!)
            return result
        }

        this.log('Starting pull from cloud...')

        // Load manifest for cache lookup
        const manifest = await this.loadManifest()

        // Scan cloud folder with cached hashes (cloud files stored in manifest)
        const cloudFiles = await this.scanFolder(this.cloudPath, manifest.files)

        // Build a cache for server files from what we know
        // For server, we need to scan without cache first time, but can use manifest as hint
        const serverFiles = await this.scanFolder(this.serverPath, manifest.files)

        let downloaded = 0
        const MTIME_TOLERANCE = 60 * 1000 // 1 minute tolerance

        // Compare and copy newer/different files from cloud to server
        for (const [relativePath, cloudFile] of cloudFiles) {
            // Skip manifest and lock files
            if (relativePath === 'minesync_manifest.json' || relativePath === 'server_lock.json') {
                continue
            }

            const serverFile = serverFiles.get(relativePath)

            // If file doesn't exist locally, download it
            if (!serverFile) {
                try {
                    const src = path.join(this.cloudPath, relativePath)
                    const dest = path.join(this.serverPath, relativePath)
                    this.log(`Downloading: ${relativePath}`)
                    await this.copyFile(src, dest)
                    downloaded++
                } catch (error) {
                    result.errors.push(`Failed to download ${relativePath}: ${error}`)
                }
                continue
            }

            // If files are the same, skip
            if (serverFile.hash === cloudFile.hash) {
                continue
            }

            // Files are different - check if local is newer (potential crash recovery)
            const localIsNewer = serverFile.modifiedTime > cloudFile.modifiedTime + MTIME_TOLERANCE

            if (localIsNewer && !forcePull) {
                // This is a conflict - local file is newer than cloud
                this.log(`CONFLICT: ${relativePath} - Local is ${Math.round((serverFile.modifiedTime - cloudFile.modifiedTime) / 1000)}s newer`)
                result.conflicts.push({
                    relativePath,
                    localModifiedTime: serverFile.modifiedTime,
                    cloudModifiedTime: cloudFile.modifiedTime,
                    reason: 'Local file is newer than cloud (possible crash recovery)'
                })
            } else {
                // Cloud is newer or same age, safe to download
                try {
                    const src = path.join(this.cloudPath, relativePath)
                    const dest = path.join(this.serverPath, relativePath)
                    this.log(`Downloading: ${relativePath}`)
                    await this.copyFile(src, dest)
                    downloaded++
                } catch (error) {
                    result.errors.push(`Failed to download ${relativePath}: ${error}`)
                }
            }
        }

        result.filesDownloaded = downloaded
        result.hasConflicts = result.conflicts.length > 0

        if (result.hasConflicts) {
            this.log(`Pull found ${result.conflicts.length} conflict(s) - local files are newer`)
        } else {
            this.log(`Pull complete: ${downloaded} files downloaded`)
        }

        // Update manifest with file info for future cache lookups
        // Cloud files are our source of truth after pull
        for (const [relativePath, file] of cloudFiles) {
            if (relativePath !== 'minesync_manifest.json' && relativePath !== 'server_lock.json') {
                manifest.files[relativePath] = file
            }
        }

        manifest.lastUpdated = Date.now()
        manifest.lastHost = userName
        await this.saveManifest(manifest)

        return result
    }

    /**
     * Push changes from server to cloud (after stopping)
     */
    async push(userName: string): Promise<SyncResult> {
        const result: SyncResult = {
            filesUploaded: 0,
            filesDownloaded: 0,
            errors: [],
            conflicts: [],
            hasConflicts: false
        }

        const validation = await this.validatePaths()
        if (!validation.valid) {
            result.errors.push(validation.error!)
            return result
        }

        this.log('Starting push to cloud...')

        // Load existing manifest for cache lookup
        const existingManifest = await this.loadManifest()

        // Scan both folders with cached hashes
        const serverFiles = await this.scanFolder(this.serverPath, existingManifest.files)
        const cloudFiles = await this.scanFolder(this.cloudPath, existingManifest.files)

        let uploaded = 0

        // Copy changed files from server to cloud
        for (const [relativePath, serverFile] of serverFiles) {
            const cloudFile = cloudFiles.get(relativePath)

            // If file doesn't exist in cloud or server version is different
            if (!cloudFile || cloudFile.hash !== serverFile.hash) {
                try {
                    const src = path.join(this.serverPath, relativePath)
                    const dest = path.join(this.cloudPath, relativePath)
                    this.log(`Uploading: ${relativePath}`)
                    await this.copyFile(src, dest)
                    uploaded++
                } catch (error) {
                    result.errors.push(`Failed to upload ${relativePath}: ${error}`)
                }
            }
        }

        // Update manifest with server file info (since server is source of truth after push)
        const manifest: Manifest = {
            files: {},
            lastUpdated: Date.now(),
            lastHost: userName
        }

        // Store server file info in manifest (these are now synced to cloud)
        for (const [relativePath, file] of serverFiles) {
            manifest.files[relativePath] = file
        }

        // Also update entries for cloud-only files that weren't changed
        for (const [relativePath, file] of cloudFiles) {
            if (!manifest.files[relativePath]) {
                manifest.files[relativePath] = file
            }
        }

        await this.saveManifest(manifest)

        result.filesUploaded = uploaded
        this.log(`Push complete: ${uploaded} files uploaded`)

        return result
    }

    private shouldIgnore(name: string, relativePath: string): boolean {
        for (const pattern of this.ignorePatterns) {
            if (pattern.startsWith('*')) {
                const ext = pattern.slice(1)
                if (name.endsWith(ext)) return true
            } else if (name === pattern || relativePath.startsWith(pattern + '/')) {
                return true
            }
        }
        return false
    }
}
