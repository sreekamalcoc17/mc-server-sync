import { useState } from 'react'
import { AppConfig } from '../App'
import './Settings.css'

interface SettingsProps {
    config: AppConfig | null
    onUpdateConfig: (key: keyof AppConfig, value: unknown) => Promise<void>
}

function Settings({ config, onUpdateConfig }: SettingsProps) {
    const [isSaving, setIsSaving] = useState(false)

    const handleSelectServerPath = async () => {
        const path = await window.electronAPI.selectFolder()
        if (path) {
            await onUpdateConfig('serverPath', path)
        }
    }

    const handleRamChange = async (key: 'ramMin' | 'ramMax', value: number) => {
        setIsSaving(true)
        await onUpdateConfig(key, value)
        setIsSaving(false)
    }

    const handleJavaArgsChange = async (value: string) => {
        await onUpdateConfig('javaArgs', value)
    }

    return (
        <div className="settings animate-fadeIn">
            <div className="page-header">
                <h1>Settings</h1>
                <p>Configure your MineSync preferences</p>
            </div>

            {/* Server Configuration */}
            <section className="settings-section">
                <h2 className="section-title">Server Configuration</h2>

                <div className="card settings-card">
                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Server Directory</label>
                            <p className="setting-description">
                                Select the folder containing your Minecraft server files (server.jar)
                            </p>
                        </div>
                        <div className="setting-control">
                            <div className="path-input">
                                <input
                                    type="text"
                                    value={config?.serverPath || ''}
                                    placeholder="No folder selected"
                                    readOnly
                                    className="input"
                                />
                                <button className="btn btn-secondary" onClick={handleSelectServerPath}>
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="setting-divider"></div>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">RAM Allocation</label>
                            <p className="setting-description">
                                Set minimum and maximum RAM for the Minecraft server
                            </p>
                        </div>
                        <div className="setting-control ram-control">
                            <div className="ram-input-group">
                                <label>Min RAM (GB)</label>
                                <input
                                    type="number"
                                    value={config?.ramMin || 1}
                                    onChange={(e) => handleRamChange('ramMin', parseInt(e.target.value))}
                                    min={1}
                                    max={config?.ramMax || 4}
                                    step={1}
                                    className="input input-number"
                                />
                            </div>
                            <div className="ram-input-group">
                                <label>Max RAM (GB)</label>
                                <input
                                    type="number"
                                    value={config?.ramMax || 4}
                                    onChange={(e) => handleRamChange('ramMax', parseInt(e.target.value))}
                                    min={config?.ramMin || 1}
                                    max={64}
                                    step={1}
                                    className="input input-number"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="setting-divider"></div>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Java Path</label>
                            <p className="setting-description">
                                Path to Java executable (java.exe). Leave as "java" to use system default.
                            </p>
                        </div>
                        <div className="setting-control">
                            <div className="path-input">
                                <input
                                    type="text"
                                    value={config?.javaPath || 'java'}
                                    onChange={(e) => onUpdateConfig('javaPath', e.target.value)}
                                    placeholder="java"
                                    className="input"
                                />
                                <button
                                    className="btn btn-secondary"
                                    onClick={async () => {
                                        const path = await window.electronAPI.selectFile([
                                            { name: 'Java Executable', extensions: ['exe'] },
                                            { name: 'All Files', extensions: ['*'] }
                                        ])
                                        if (path) {
                                            await onUpdateConfig('javaPath', path)
                                        }
                                    }}
                                >
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="setting-divider"></div>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Java Arguments</label>
                            <p className="setting-description">
                                Additional JVM arguments (e.g., -nogui, garbage collection flags)
                            </p>
                        </div>
                        <div className="setting-control">
                            <input
                                type="text"
                                value={config?.javaArgs || ''}
                                onChange={(e) => handleJavaArgsChange(e.target.value)}
                                placeholder="Optional: -nogui, -XX:+UseG1GC, etc."
                                className="input"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Cloud Configuration */}
            <section className="settings-section">
                <h2 className="section-title">Cloud Sync</h2>

                <div className="card settings-card">
                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Cloud Provider</label>
                            <p className="setting-description">
                                Select your preferred cloud storage service for syncing
                            </p>
                        </div>
                        <div className="setting-control">
                            <div className="provider-selector">
                                <button
                                    className={`provider-btn ${config?.cloudProvider === 'google-drive' ? 'active' : ''}`}
                                    onClick={() => onUpdateConfig('cloudProvider', 'google-drive')}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7.71 3.5L1.15 15.17L4.22 19.5H8.14L14.71 7.83L7.71 3.5ZM8.31 3.5L15.31 7.83L21.85 3.5H8.31ZM16.12 8.33L9.56 20H19.78L22.85 15.67L16.12 8.33Z" />
                                    </svg>
                                    Google Drive
                                </button>
                                <button
                                    className={`provider-btn ${config?.cloudProvider === 'onedrive' ? 'active' : ''}`}
                                    onClick={() => onUpdateConfig('cloudProvider', 'onedrive')}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M10.5 18H18.5C20.43 18 22 16.43 22 14.5C22 12.57 20.43 11 18.5 11C18.33 11 18.16 11.01 18 11.03C17.68 8.2 15.33 6 12.5 6C10.8 6 9.27 6.78 8.27 8H8C5.24 8 3 10.24 3 13C3 15.76 5.24 18 8 18H10.5Z" />
                                    </svg>
                                    OneDrive
                                    <span className="coming-soon">Coming Soon</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="setting-divider"></div>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Cloud Sync Folder</label>
                            <p className="setting-description">
                                Select your Google Drive synced folder (e.g., G:\My Drive\MinecraftServerSync)
                            </p>
                        </div>
                        <div className="setting-control">
                            <div className="path-input">
                                <input
                                    type="text"
                                    value={config?.cloudSyncPath || ''}
                                    placeholder="No folder selected"
                                    readOnly
                                    className="input"
                                />
                                <button
                                    className="btn btn-secondary"
                                    onClick={async () => {
                                        const path = await window.electronAPI.selectFolder()
                                        if (path) {
                                            await onUpdateConfig('cloudSyncPath', path)
                                        }
                                    }}
                                >
                                    Browse
                                </button>
                            </div>
                            {config?.cloudSyncPath && (
                                <div className="sync-status connected">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                    Cloud sync folder configured
                                </div>
                            )}
                            {!config?.cloudSyncPath && (
                                <div className="sync-status disconnected">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    Select your Google Drive folder to enable sync
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="setting-divider"></div>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Auto-Sync Interval</label>
                            <p className="setting-description">
                                Automatically save and sync to cloud while playing. Reduces data loss on crash.
                            </p>
                        </div>
                        <div className="setting-control">
                            <select
                                className="input select-input"
                                value={config?.autoSyncInterval ?? 5}
                                onChange={(e) => onUpdateConfig('autoSyncInterval', parseInt(e.target.value))}
                            >
                                <option value={0}>Disabled</option>
                                <option value={1}>Every 1 minute</option>
                                <option value={2}>Every 2 minutes</option>
                                <option value={5}>Every 5 minutes</option>
                                <option value={10}>Every 10 minutes</option>
                            </select>
                            {(config?.autoSyncInterval ?? 5) > 0 && (
                                <div className="sync-status connected">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                    Auto-save enabled: Max {config?.autoSyncInterval ?? 5} min of data loss on crash
                                </div>
                            )}
                            {(config?.autoSyncInterval ?? 5) === 0 && (
                                <div className="sync-status disconnected">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    Warning: No auto-sync. All progress lost on crash until manual stop.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {isSaving && (
                <div className="settings-saving">
                    <div className="saving-indicator"></div>
                    Saving...
                </div>
            )}
        </div>
    )
}

export default Settings
