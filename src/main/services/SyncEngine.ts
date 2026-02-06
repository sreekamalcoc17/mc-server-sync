import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { createReadStream, createWriteStream, Stats } from 'fs'
import { CloudProvider } from './CloudProvider'
import { FileMetadata, SyncProgress } from '../../shared/types'

interface LocalFileInfo {
    relativePath: string
    absolutePath: string
    size: number
    modifiedTime: number
    hash?: string
}

interface SyncDiff {
    toUpload: LocalFileInfo[]
    toDownload: FileMetadata[]
    toDelete: string[] // Remote file IDs to delete
}

/**
 * SyncEngine - Handles efficient file synchronization between local and cloud
 */
export class SyncEngine {
    private provider: CloudProvider
    private localPath: string
    private remoteFolderId: string
    private onProgress?: (progress: SyncProgress) => void

    // Ignore patterns - files/folders to skip
    private ignorePatterns = [
        'logs',
        'crash-reports',
        '*.log',
        'session.lock',
        '.git',
        'node_modules'
    ]

    constructor(
        provider: CloudProvider,
        localPath: string,
        remoteFolderId: string,
        onProgress?: (progress: SyncProgress) => void
    ) {
        this.provider = provider
        this.localPath = localPath
        this.remoteFolderId = remoteFolderId
        this.onProgress = onProgress
    }

    /**
     * Scan local directory and collect file metadata
     */
    async scanLocalFiles(): Promise<LocalFileInfo[]> {
        const files: LocalFileInfo[] = []

        const scan = async (dir: string) => {
            const entries = await fs.readdir(dir, { withFileTypes: true })

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)
                const relativePath = path.relative(this.localPath, fullPath)

                // Check ignore patterns
                if (this.shouldIgnore(entry.name, relativePath)) {
                    continue
                }

                if (entry.isDirectory()) {
                    await scan(fullPath)
                } else if (entry.isFile()) {
                    const stats = await fs.stat(fullPath)
                    files.push({
                        relativePath: relativePath.replace(/\\/g, '/'), // Normalize path separators
                        absolutePath: fullPath,
                        size: stats.size,
                        modifiedTime: stats.mtimeMs
                    })
                }
            }
        }

        await scan(this.localPath)
        return files
    }

    /**
     * Calculate MD5 hash of a file using streams (memory efficient)
     */
    async calculateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5')
            const stream = createReadStream(filePath)

            stream.on('data', (data) => hash.update(data))
            stream.on('end', () => resolve(hash.digest('hex')))
            stream.on('error', reject)
        })
    }

    /**
     * Compare local files with remote and determine what needs syncing
     */
    async calculateDiff(): Promise<SyncDiff> {
        const localFiles = await this.scanLocalFiles()
        const remoteFiles = await this.provider.listFiles(this.remoteFolderId)

        const diff: SyncDiff = {
            toUpload: [],
            toDownload: [],
            toDelete: []
        }

        // Create a map of remote files by path
        const remoteMap = new Map<string, FileMetadata>()
        for (const file of remoteFiles) {
            remoteMap.set(file.path, file)
        }

        // Check each local file
        for (const localFile of localFiles) {
            const remoteFile = remoteMap.get(localFile.relativePath)

            if (!remoteFile) {
                // File doesn't exist remotely - needs upload
                diff.toUpload.push(localFile)
            } else if (localFile.modifiedTime > remoteFile.modifiedTime) {
                // Local is newer - needs upload
                diff.toUpload.push(localFile)
                remoteMap.delete(localFile.relativePath) // Remove from map
            } else if (localFile.modifiedTime < remoteFile.modifiedTime) {
                // Remote is newer - needs download
                diff.toDownload.push(remoteFile)
                remoteMap.delete(localFile.relativePath)
            } else {
                // Same time - compare sizes, if different use hash
                if (localFile.size !== remoteFile.size) {
                    // Size mismatch - prefer remote for safety
                    diff.toDownload.push(remoteFile)
                }
                remoteMap.delete(localFile.relativePath)
            }
        }

        // Remaining remote files don't exist locally - download them
        for (const [, remoteFile] of remoteMap) {
            diff.toDownload.push(remoteFile)
        }

        return diff
    }

    /**
     * Pull changes from cloud (download)
     */
    async pull(): Promise<void> {
        const diff = await this.calculateDiff()
        const total = diff.toDownload.length
        let current = 0

        for (const file of diff.toDownload) {
            current++
            this.onProgress?.({
                current,
                total,
                file: file.path,
                type: 'download'
            })

            const localPath = path.join(this.localPath, file.path)

            // Ensure directory exists
            await fs.mkdir(path.dirname(localPath), { recursive: true })

            // Download file
            if (file.hash) { // Using hash as fileId placeholder
                await this.provider.downloadFile(file.hash, localPath, this.onProgress)
            }
        }
    }

    /**
     * Push changes to cloud (upload)
     */
    async push(): Promise<void> {
        const diff = await this.calculateDiff()
        const total = diff.toUpload.length
        let current = 0

        for (const file of diff.toUpload) {
            current++
            this.onProgress?.({
                current,
                total,
                file: file.relativePath,
                type: 'upload'
            })

            // Upload file
            await this.provider.uploadFile(
                file.absolutePath,
                this.remoteFolderId,
                file.relativePath,
                this.onProgress
            )
        }
    }

    /**
     * Full sync - pull then push
     */
    async sync(): Promise<void> {
        await this.pull()
        await this.push()
    }

    private shouldIgnore(name: string, relativePath: string): boolean {
        for (const pattern of this.ignorePatterns) {
            if (pattern.startsWith('*')) {
                // Wildcard pattern
                const ext = pattern.slice(1)
                if (name.endsWith(ext)) return true
            } else if (name === pattern || relativePath.startsWith(pattern + '/')) {
                return true
            }
        }
        return false
    }
}
