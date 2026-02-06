import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import os from 'os'
import { processManager } from './services/ProcessManager'
import { autoSyncManager } from './services/AutoSyncManager'
import { LockManager } from './services/CloudProvider'
import { MockCloudProvider } from './services/MockCloudProvider'
import { LocalFolderSync } from './services/LocalFolderSync'
import { ServerPropertiesService, lookupPlayerUUID } from './services/ServerPropertiesService'
import { ModManagerService } from './services/ModManagerService'

// Initialize electron-store for config persistence
const store = new Store({
    name: 'minesync-config',
    defaults: {
        serverPath: '',
        cloudSyncPath: '', // Google Drive synced folder path
        ramMin: 1,    // GB
        ramMax: 4,    // GB
        javaPath: 'java',
        javaArgs: '',  // No default args
        cloudProvider: 'google-drive',
        cloudFolderId: '',
        userName: os.userInfo().username,
        autoSyncInterval: 5  // minutes (0 = disabled)
    }
})

// Cloud provider and lock manager instances
let cloudProvider = new MockCloudProvider()
let lockManager = new LockManager(cloudProvider, store.get('cloudFolderId') as string)

// Track main window for IPC
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        frame: false, // Frameless for custom titlebar
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0a',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// ===== IPC Handlers for window controls =====
ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
        win.unmaximize()
    } else {
        win?.maximize()
    }
})

ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
})

// ===== IPC Handlers for configuration =====
ipcMain.handle('config:get', async (_event, key: string) => {
    return store.get(key)
})

ipcMain.handle('config:set', async (_event, key: string, value: unknown) => {
    store.set(key, value)

    // Update lock manager if cloud folder changed
    if (key === 'cloudFolderId') {
        lockManager = new LockManager(cloudProvider, value as string)
    }

    return true
})

ipcMain.handle('config:getAll', async () => {
    return store.store
})

// ===== IPC Handler for folder picker =====
ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
})

// ===== IPC Handler for file picker =====
ipcMain.handle('dialog:selectFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters || [
            { name: 'Executable', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    })
    if (result.canceled) return null
    return result.filePaths[0]
})

// ===== IPC Handlers for Server Control =====
ipcMain.handle('server:start', async () => {
    const serverPath = store.get('serverPath') as string
    const javaPath = store.get('javaPath') as string
    const ramMin = store.get('ramMin') as number
    const ramMax = store.get('ramMax') as number
    const javaArgs = store.get('javaArgs') as string

    processManager.configure({
        serverPath,
        javaPath,
        ramMin,
        ramMax,
        javaArgs
    })

    // Forward logs to renderer
    processManager.removeAllListeners('log')
    processManager.on('log', (line: string) => {
        mainWindow?.webContents.send('server:log', line)
    })

    return await processManager.start()
})

ipcMain.handle('server:stop', async () => {
    return await processManager.stop()
})

ipcMain.handle('server:status', async () => {
    const status = {
        running: processManager.isRunning,
        pid: processManager.pid
    }
    console.log('[MineSync] Server status check:', status)
    return status
})

ipcMain.handle('server:sendCommand', async (_event, command: string) => {
    processManager.sendCommand(command)
    return true
})

// ===== IPC Handlers for Auto-Sync =====
ipcMain.handle('autoSync:start', async () => {
    const serverPath = store.get('serverPath') as string
    const cloudSyncPath = store.get('cloudSyncPath') as string
    const userName = store.get('userName') as string
    const autoSyncInterval = store.get('autoSyncInterval') as number

    if (!serverPath || !cloudSyncPath) {
        console.log('[AutoSync] Paths not configured, auto-sync disabled')
        return false
    }

    autoSyncManager.configure({
        serverPath,
        cloudPath: cloudSyncPath,
        userName,
        intervalMinutes: autoSyncInterval
    })

    // Forward auto-sync logs to renderer
    autoSyncManager.removeAllListeners('log')
    autoSyncManager.on('log', (msg: string) => {
        mainWindow?.webContents.send('server:log', msg)
    })

    autoSyncManager.start()
    return true
})

ipcMain.handle('autoSync:stop', async () => {
    autoSyncManager.stop()
    return true
})

ipcMain.handle('autoSync:syncNow', async () => {
    return await autoSyncManager.syncNow()
})

// ===== IPC Handlers for Sync Control =====
ipcMain.handle('sync:checkLock', async () => {
    try {
        const serverPath = store.get('serverPath') as string
        const cloudSyncPath = store.get('cloudSyncPath') as string

        if (!serverPath || !cloudSyncPath) {
            return { locked: false }
        }

        const sync = new LocalFolderSync(serverPath, cloudSyncPath)
        return await sync.checkLock()
    } catch (error) {
        console.error('Error checking lock:', error)
        return { locked: false }
    }
})

ipcMain.handle('sync:acquireLock', async () => {
    try {
        const serverPath = store.get('serverPath') as string
        const cloudSyncPath = store.get('cloudSyncPath') as string
        const userName = store.get('userName') as string

        if (!serverPath || !cloudSyncPath) {
            mainWindow?.webContents.send('server:log', '[MineSync] Cannot acquire lock - paths not configured')
            return false
        }

        const sync = new LocalFolderSync(serverPath, cloudSyncPath, (msg) => {
            mainWindow?.webContents.send('server:log', msg)
        })
        return await sync.acquireLock(userName)
    } catch (error) {
        console.error('Error acquiring lock:', error)
        return false
    }
})

ipcMain.handle('sync:releaseLock', async () => {
    try {
        const serverPath = store.get('serverPath') as string
        const cloudSyncPath = store.get('cloudSyncPath') as string

        if (!serverPath || !cloudSyncPath) {
            return true // Nothing to release
        }

        const sync = new LocalFolderSync(serverPath, cloudSyncPath, (msg) => {
            mainWindow?.webContents.send('server:log', msg)
        })
        return await sync.releaseLock()
    } catch (error) {
        console.error('Error releasing lock:', error)
        return false
    }
})

ipcMain.handle('sync:pull', async () => {
    try {
        const serverPath = store.get('serverPath') as string
        const cloudSyncPath = store.get('cloudSyncPath') as string
        const userName = store.get('userName') as string

        if (!serverPath || !cloudSyncPath) {
            console.log('Sync paths not configured')
            mainWindow?.webContents.send('server:log', '[MineSync] Sync paths not configured - skipping sync')
            return true
        }

        const sync = new LocalFolderSync(serverPath, cloudSyncPath, (msg) => {
            mainWindow?.webContents.send('server:log', msg)
        })

        const result = await sync.pull(userName, false)

        if (result.errors.length > 0) {
            for (const error of result.errors) {
                mainWindow?.webContents.send('server:log', `[Error] ${error}`)
            }
        }

        // Return the full result so frontend can handle conflicts
        return result
    } catch (error) {
        console.error('Error during sync pull:', error)
        mainWindow?.webContents.send('server:log', `[MineSync] Sync pull failed: ${error}`)
        return {
            filesUploaded: 0,
            filesDownloaded: 0,
            errors: [String(error)],
            conflicts: [],
            hasConflicts: false
        }
    }
})

// Force pull - overwrite local files even if newer
ipcMain.handle('sync:forcePull', async () => {
    try {
        const serverPath = store.get('serverPath') as string
        const cloudSyncPath = store.get('cloudSyncPath') as string
        const userName = store.get('userName') as string

        if (!serverPath || !cloudSyncPath) {
            return { success: false, error: 'Paths not configured' }
        }

        mainWindow?.webContents.send('server:log', '[MineSync] Force pulling from cloud (overwriting local)...')

        const sync = new LocalFolderSync(serverPath, cloudSyncPath, (msg) => {
            mainWindow?.webContents.send('server:log', msg)
        })

        const result = await sync.pull(userName, true) // forcePull = true

        mainWindow?.webContents.send('server:log', `[MineSync] Force pull complete: ${result.filesDownloaded} files downloaded`)
        return result
    } catch (error) {
        console.error('Error during force pull:', error)
        mainWindow?.webContents.send('server:log', `[MineSync] Force pull failed: ${error}`)
        return {
            filesUploaded: 0,
            filesDownloaded: 0,
            errors: [String(error)],
            conflicts: [],
            hasConflicts: false
        }
    }
})

ipcMain.handle('sync:push', async () => {
    try {
        const serverPath = store.get('serverPath') as string
        const cloudSyncPath = store.get('cloudSyncPath') as string
        const userName = store.get('userName') as string

        if (!serverPath || !cloudSyncPath) {
            console.log('Sync paths not configured')
            mainWindow?.webContents.send('server:log', '[MineSync] Sync paths not configured - skipping sync')
            return true
        }

        const sync = new LocalFolderSync(serverPath, cloudSyncPath, (msg) => {
            mainWindow?.webContents.send('server:log', msg)
        })

        const result = await sync.push(userName)

        if (result.errors.length > 0) {
            for (const error of result.errors) {
                mainWindow?.webContents.send('server:log', `[Error] ${error}`)
            }
        }

        return true
    } catch (error) {
        console.error('Error during sync push:', error)
        mainWindow?.webContents.send('server:log', `[MineSync] Sync push failed: ${error}`)
        return false
    }
})

// ===== App Lifecycle =====
app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.minesync')

    // Default open or close DevTools by F12 in development
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', async () => {
    // Ensure server is stopped and lock is released before quitting
    if (processManager.isRunning) {
        await processManager.stop()
    }

    try {
        await lockManager.releaseLock()
    } catch (e) {
        console.error('Error releasing lock on quit:', e)
    }

    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// Handle unexpected crashes - release lock
process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error)
    try {
        await lockManager.releaseLock()
    } catch (e) {
        console.error('Error releasing lock on crash:', e)
    }
    process.exit(1)
})

// ===== IPC Handlers for Server Config =====
ipcMain.handle('serverConfig:getProperties', async () => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return {}

    const service = new ServerPropertiesService(serverPath)
    return await service.getProperties()
})

ipcMain.handle('serverConfig:setProperties', async (_event, changes: Record<string, unknown>) => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return false

    try {
        const service = new ServerPropertiesService(serverPath)
        await service.setProperties(changes as Record<string, string | number | boolean>)
        return true
    } catch (error) {
        console.error('Error setting properties:', error)
        return false
    }
})

ipcMain.handle('serverConfig:getOps', async () => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return []

    const service = new ServerPropertiesService(serverPath)
    return await service.getOps()
})

ipcMain.handle('serverConfig:addOp', async (_event, username: string) => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return { success: false, error: 'No server path configured' }

    try {
        const player = await lookupPlayerUUID(username)
        if (!player) {
            return { success: false, error: 'Player not found' }
        }

        const service = new ServerPropertiesService(serverPath)
        await service.addOp(player.name, player.uuid)
        return { success: true, player }
    } catch (error) {
        return { success: false, error: String(error) }
    }
})

ipcMain.handle('serverConfig:removeOp', async (_event, uuid: string) => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return false

    const service = new ServerPropertiesService(serverPath)
    await service.removeOp(uuid)
    return true
})

ipcMain.handle('serverConfig:getWhitelist', async () => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return []

    const service = new ServerPropertiesService(serverPath)
    return await service.getWhitelist()
})

ipcMain.handle('serverConfig:addToWhitelist', async (_event, username: string) => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return { success: false, error: 'No server path configured' }

    try {
        const player = await lookupPlayerUUID(username)
        if (!player) {
            return { success: false, error: 'Player not found' }
        }

        const service = new ServerPropertiesService(serverPath)
        await service.addToWhitelist(player.name, player.uuid)
        return { success: true, player }
    } catch (error) {
        return { success: false, error: String(error) }
    }
})

ipcMain.handle('serverConfig:removeFromWhitelist', async (_event, uuid: string) => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return false

    const service = new ServerPropertiesService(serverPath)
    await service.removeFromWhitelist(uuid)
    return true
})

// ===== IPC Handlers for Mod Manager =====
ipcMain.handle('mods:getMods', async () => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return []

    const service = new ModManagerService(serverPath)
    return await service.getMods()
})

ipcMain.handle('mods:toggleMod', async (_event, filename: string, enable: boolean) => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return false

    const service = new ModManagerService(serverPath)
    return await service.toggleMod(filename, enable)
})

ipcMain.handle('mods:getModLoader', async () => {
    const serverPath = store.get('serverPath') as string
    if (!serverPath) return 'unknown'

    const service = new ModManagerService(serverPath)
    return await service.getModLoader()
})
