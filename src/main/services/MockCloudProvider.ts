import { CloudProvider } from './CloudProvider'
import { FileMetadata, SyncProgress } from '../../shared/types'

/**
 * MockCloudProvider - For testing without actual cloud connection
 * This will be replaced with GoogleDriveProvider when implementing OAuth
 */
export class MockCloudProvider implements CloudProvider {
    readonly name = 'Mock Cloud (Testing)'

    private mockFiles = new Map<string, { name: string; content: string }>()
    private isAuth = false

    async isAuthenticated(): Promise<boolean> {
        return this.isAuth
    }

    async authenticate(): Promise<boolean> {
        // Simulate authentication
        this.isAuth = true
        return true
    }

    async listFiles(_folderId: string): Promise<FileMetadata[]> {
        // Return mock empty list
        return []
    }

    async downloadFile(
        _fileId: string,
        _localPath: string,
        _onProgress?: (progress: SyncProgress) => void
    ): Promise<void> {
        // Mock download
        await new Promise(resolve => setTimeout(resolve, 100))
    }

    async uploadFile(
        _localPath: string,
        _remoteFolderId: string,
        fileName: string,
        _onProgress?: (progress: SyncProgress) => void
    ): Promise<string> {
        // Mock upload - return fake file ID
        await new Promise(resolve => setTimeout(resolve, 100))
        return `mock-file-${Date.now()}-${fileName}`
    }

    async deleteFile(fileId: string): Promise<void> {
        this.mockFiles.delete(fileId)
    }

    async readTextFile(fileId: string): Promise<string> {
        return this.mockFiles.get(fileId)?.content || '{}'
    }

    async writeTextFile(
        _folderId: string,
        fileName: string,
        content: string
    ): Promise<string> {
        const fileId = `mock-${fileName}`
        this.mockFiles.set(fileId, { name: fileName, content })
        return fileId
    }

    async findFileByName(_folderId: string, fileName: string): Promise<string | null> {
        for (const [id, file] of this.mockFiles) {
            if (file.name === fileName) {
                return id
            }
        }
        return null
    }

    async createFolder(_parentId: string, name: string): Promise<string> {
        return `mock-folder-${name}`
    }

    async getFileMetadata(_fileId: string): Promise<FileMetadata | null> {
        return null
    }
}
