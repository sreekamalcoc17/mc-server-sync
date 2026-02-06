import { useState, useEffect, useRef } from 'react'
import { AppConfig } from '../App'
import './Dashboard.css'

interface DashboardProps {
    config: AppConfig | null
    onBusyChange?: (busy: boolean) => void
}

type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'syncing' | 'conflict'
type LockStatus = 'checking' | 'unlocked' | 'locked' | 'owned'

interface ConflictInfo {
    relativePath: string
    localModifiedTime: number
    cloudModifiedTime: number
    reason: string
}

function Dashboard({ config, onBusyChange }: DashboardProps) {
    const [serverStatus, setServerStatus] = useState<ServerStatus>('stopped')
    const [lockStatus, setLockStatus] = useState<LockStatus>('unlocked')
    const [lockOwner, setLockOwner] = useState<string | null>(null)
    const [logs, setLogs] = useState<string[]>([])
    const [commandInput, setCommandInput] = useState('')
    const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
    const consoleRef = useRef<HTMLDivElement>(null)

    const isConfigured = config?.serverPath && config.serverPath.length > 0

    // Check actual server status from main process on mount
    useEffect(() => {
        const checkServerStatus = async () => {
            try {
                const status = await window.electronAPI.getServerStatus()
                if (status.running) {
                    setServerStatus('running')
                    const timestamp = new Date().toLocaleTimeString()
                    setLogs(prev => [...prev, `[${timestamp}] Server is already running (reconnected)`])
                }
            } catch (error) {
                console.error('Error checking server status:', error)
            }
        }

        checkServerStatus()
    }, [])

    // Subscribe to server logs from main process
    useEffect(() => {
        const handleServerLog = (log: string) => {
            const timestamp = new Date().toLocaleTimeString()
            setLogs(prev => [...prev, `[${timestamp}] ${log}`])
        }

        // Returns cleanup function
        const cleanup = window.electronAPI.onServerLog(handleServerLog)

        // Cleanup on unmount to prevent duplicate listeners
        return cleanup
    }, [])

    // Auto-scroll console to bottom
    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight
        }
    }, [logs])

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString()
        setLogs(prev => [...prev, `[${timestamp}] ${message}`])
    }

    const handleSendCommand = async () => {
        if (!commandInput.trim() || serverStatus !== 'running') return

        const cmd = commandInput.trim()
        addLog(`> ${cmd}`)
        await window.electronAPI.sendCommand(cmd)
        setCommandInput('')
    }

    const handleStartServer = async () => {
        if (!isConfigured) return

        try {
            onBusyChange?.(true)
            setServerStatus('syncing')
            addLog('Checking server lock...')

            // Check lock (mock for now)
            const lockInfo = await window.electronAPI.checkLock()

            if (lockInfo.locked && lockInfo.user) {
                setLockStatus('locked')
                setLockOwner(lockInfo.user)
                addLog(`Server is locked by ${lockInfo.user}`)
                setServerStatus('stopped')
                return
            }

            addLog('Acquiring lock...')
            await window.electronAPI.acquireLock()
            setLockStatus('owned')

            addLog('Syncing from cloud...')
            const syncResult = await window.electronAPI.syncPull()

            // Check for conflicts
            if (syncResult.hasConflicts) {
                setConflicts(syncResult.conflicts)
                setServerStatus('conflict')
                addLog(`⚠️ CONFLICT: ${syncResult.conflicts.length} local file(s) are newer than cloud!`)
                addLog('Choose: Keep Local (your progress) or Use Cloud (discard local changes)')
                onBusyChange?.(false)
                return
            }

            addLog('Starting Minecraft server...')
            setServerStatus('starting')

            await window.electronAPI.startServer()
            setServerStatus('running')
            addLog('Server is now running!')

            // Start auto-sync if configured
            await window.electronAPI.startAutoSync()
            addLog('Auto-sync enabled')

        } catch (error) {
            addLog(`Error: ${error}`)
            setServerStatus('stopped')
        } finally {
            onBusyChange?.(false)
        }
    }

    const handleStopServer = async () => {
        try {
            onBusyChange?.(true)

            // Stop auto-sync first
            await window.electronAPI.stopAutoSync()
            addLog('Auto-sync stopped')

            setServerStatus('stopping')
            addLog('Stopping Minecraft server...')

            await window.electronAPI.stopServer()

            addLog('Server stopped. Syncing to cloud...')
            setServerStatus('syncing')

            await window.electronAPI.syncPush()

            addLog('Releasing lock...')
            await window.electronAPI.releaseLock()
            setLockStatus('unlocked')

            setServerStatus('stopped')
            addLog('All done! Server synced and unlocked.')

        } catch (error) {
            addLog(`Error: ${error}`)
        } finally {
            onBusyChange?.(false)
        }
    }

    // Conflict resolution: Keep local files (don't overwrite)
    const handleKeepLocal = async () => {
        try {
            onBusyChange?.(true)
            addLog('Keeping local files, starting server...')
            setConflicts([])

            setServerStatus('starting')
            await window.electronAPI.startServer()
            setServerStatus('running')
            addLog('Server is now running!')

            await window.electronAPI.startAutoSync()
            addLog('Auto-sync enabled')
        } catch (error) {
            addLog(`Error: ${error}`)
            setServerStatus('stopped')
        } finally {
            onBusyChange?.(false)
        }
    }

    // Conflict resolution: Force pull from cloud (overwrite local)
    const handleUseCloud = async () => {
        try {
            onBusyChange?.(true)
            addLog('Force pulling from cloud (overwriting local)...')
            setConflicts([])
            setServerStatus('syncing')

            await window.electronAPI.forcePull()

            addLog('Starting Minecraft server...')
            setServerStatus('starting')
            await window.electronAPI.startServer()
            setServerStatus('running')
            addLog('Server is now running!')

            await window.electronAPI.startAutoSync()
            addLog('Auto-sync enabled')
        } catch (error) {
            addLog(`Error: ${error}`)
            setServerStatus('stopped')
        } finally {
            onBusyChange?.(false)
        }
    }

    const getStatusColor = () => {
        switch (serverStatus) {
            case 'running': return 'online'
            case 'starting':
            case 'stopping':
            case 'syncing': return 'syncing'
            case 'conflict': return 'conflict'
            default: return 'offline'
        }
    }

    const getStatusText = () => {
        switch (serverStatus) {
            case 'running': return 'Server Running'
            case 'starting': return 'Starting Server...'
            case 'stopping': return 'Stopping Server...'
            case 'syncing': return 'Syncing Files...'
            default: return 'Server Offline'
        }
    }

    return (
        <div className="dashboard animate-fadeIn">
            <div className="page-header">
                <h1>Dashboard</h1>
                <p>Manage your Minecraft server</p>
            </div>

            {!isConfigured && (
                <div className="dashboard-warning">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                        <strong>Configuration Required</strong>
                        <p>Please configure your server path in Settings before starting.</p>
                    </div>
                </div>
            )}

            <div className="dashboard-grid">
                {/* Server Status Card */}
                <div className="card server-status-card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Server Status</h3>
                            <p className="card-subtitle">Current state of your Minecraft server</p>
                        </div>
                        <div className={`status-indicator`}>
                            <span className={`status-dot ${getStatusColor()}`}></span>
                            <span>{getStatusText()}</span>
                        </div>
                    </div>

                    <div className="server-controls">
                        {serverStatus === 'stopped' ? (
                            <button
                                className="btn btn-primary btn-large"
                                onClick={handleStartServer}
                                disabled={!isConfigured || lockStatus === 'locked'}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                Start Server
                            </button>
                        ) : serverStatus === 'running' ? (
                            <button
                                className="btn btn-danger btn-large"
                                onClick={handleStopServer}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="6" width="12" height="12" />
                                </svg>
                                Stop Server
                            </button>
                        ) : serverStatus === 'conflict' ? (
                            <div className="conflict-resolution">
                                <div className="conflict-message">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <div>
                                        <strong>Conflict Detected!</strong>
                                        <p>{conflicts.length} local file(s) are newer than cloud. Did you crash?</p>
                                    </div>
                                </div>
                                <div className="conflict-buttons">
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleKeepLocal}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                            <polyline points="22 4 12 14.01 9 11.01" />
                                        </svg>
                                        Keep Local (Save Progress)
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleUseCloud}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        Use Cloud (Discard Local)
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button className="btn btn-secondary btn-large" disabled>
                                <div className="btn-spinner"></div>
                                {getStatusText()}
                            </button>
                        )}
                    </div>

                    {lockStatus === 'locked' && lockOwner && (
                        <div className="lock-warning">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>Locked by <strong>{lockOwner}</strong></span>
                            <button
                                className="btn btn-secondary btn-small"
                                onClick={async () => {
                                    addLog('Force unlocking...')
                                    await window.electronAPI.releaseLock()
                                    setLockStatus('unlocked')
                                    setLockOwner(null)
                                    addLog('Lock released!')
                                }}
                            >
                                Force Unlock
                            </button>
                        </div>
                    )}
                </div>

                {/* Sync Status Card */}
                <div className="card sync-status-card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Sync Status</h3>
                            <p className="card-subtitle">Cloud synchronization state</p>
                        </div>
                    </div>
                    <div className="sync-info">
                        <div className="sync-item">
                            <span className="sync-label">Provider</span>
                            <span className="sync-value">{config?.cloudProvider || 'Not configured'}</span>
                        </div>
                        <div className="sync-item">
                            <span className="sync-label">Last Sync</span>
                            <span className="sync-value">Never</span>
                        </div>
                        <div className="sync-item">
                            <span className="sync-label">Lock Status</span>
                            <span className={`sync-value ${lockStatus}`}>
                                {lockStatus === 'owned' ? 'You own the lock' :
                                    lockStatus === 'locked' ? `Locked by ${lockOwner}` :
                                        lockStatus === 'checking' ? 'Checking...' : 'Unlocked'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Console Output */}
            <div className="card console-card">
                <div className="card-header">
                    <h3 className="card-title">Console</h3>
                    <button
                        className="btn btn-secondary btn-small"
                        onClick={() => setLogs([])}
                    >
                        Clear
                    </button>
                </div>
                <div className="console-output" ref={consoleRef}>
                    {logs.length === 0 ? (
                        <div className="console-empty">No logs yet. Start the server to see output.</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} className="console-line">{log}</div>
                        ))
                    )}
                </div>
                <div className="console-input">
                    <input
                        type="text"
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendCommand()
                        }}
                        placeholder={serverStatus === 'running' ? 'Type a command (e.g., op player, say hello)...' : 'Start server to send commands'}
                        disabled={serverStatus !== 'running'}
                        className="input"
                    />
                    <button
                        className="btn btn-primary"
                        onClick={handleSendCommand}
                        disabled={serverStatus !== 'running' || !commandInput.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Dashboard
