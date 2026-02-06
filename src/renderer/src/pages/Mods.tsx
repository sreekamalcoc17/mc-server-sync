import { useState, useEffect } from 'react'
import { AppConfig } from '../App'
import './Mods.css'

interface ModInfo {
    filename: string
    enabled: boolean
    size: number
}

interface ModsProps {
    config: AppConfig | null
}

function Mods({ config }: ModsProps) {
    const [mods, setMods] = useState<ModInfo[]>([])
    const [modLoader, setModLoader] = useState<'fabric' | 'forge' | 'unknown'>('unknown')
    const [loading, setLoading] = useState(true)
    const [toggling, setToggling] = useState<string | null>(null)

    const isConfigured = config?.serverPath && config.serverPath.length > 0

    useEffect(() => {
        if (isConfigured) {
            loadData()
        }
    }, [isConfigured])

    const loadData = async () => {
        setLoading(true)
        try {
            const [modsData, loader] = await Promise.all([
                window.electronAPI.getMods(),
                window.electronAPI.getModLoader()
            ])
            setMods(modsData)
            setModLoader(loader)
        } catch (err) {
            console.error('Failed to load mods:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleToggle = async (mod: ModInfo) => {
        setToggling(mod.filename)
        try {
            const success = await window.electronAPI.toggleMod(mod.filename, !mod.enabled)
            if (success) {
                // Reload the list to get updated filenames
                await loadData()
            }
        } catch (err) {
            console.error('Failed to toggle mod:', err)
        } finally {
            setToggling(null)
        }
    }

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    const getModName = (filename: string): string => {
        // Remove .jar or .jar.disabled extension
        return filename.replace('.jar.disabled', '').replace('.jar', '')
    }

    if (!isConfigured) {
        return (
            <div className="mods-page animate-fadeIn">
                <div className="page-header">
                    <h1>Mods</h1>
                    <p>Manage your server mods</p>
                </div>
                <div className="mods-warning">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p>Please configure your server path in Settings first.</p>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="mods-page animate-fadeIn">
                <div className="page-header">
                    <h1>Mods</h1>
                    <p>Manage your server mods</p>
                </div>
                <div className="loading-state">
                    <div className="btn-spinner"></div>
                    <p>Loading mods...</p>
                </div>
            </div>
        )
    }

    const enabledCount = mods.filter(m => m.enabled).length
    const disabledCount = mods.filter(m => !m.enabled).length

    return (
        <div className="mods-page animate-fadeIn">
            <div className="page-header">
                <h1>Mods</h1>
                <p>Manage your server mods</p>
            </div>

            {/* Mod Loader Badge */}
            <div className="mod-loader-badge">
                <span className={`loader-type ${modLoader}`}>
                    {modLoader === 'fabric' ? '🧵 Fabric' : modLoader === 'forge' ? '🔨 Forge' : '❓ Unknown Loader'}
                </span>
                <span className="mod-counts">
                    {enabledCount} enabled • {disabledCount} disabled
                </span>
            </div>

            {/* Mods List */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Installed Mods</h3>
                    <p className="card-subtitle">Toggle mods on/off (requires server restart)</p>
                </div>

                {mods.length === 0 ? (
                    <div className="empty-mods">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                        <p>No mods found in the mods folder</p>
                    </div>
                ) : (
                    <div className="mods-list">
                        {mods.map(mod => (
                            <div key={mod.filename} className={`mod-row ${mod.enabled ? '' : 'disabled'}`}>
                                <div className="mod-info">
                                    <span className="mod-name">{getModName(mod.filename)}</span>
                                    <span className="mod-size">{formatSize(mod.size)}</span>
                                </div>
                                <button
                                    className={`toggle ${mod.enabled ? 'active' : ''}`}
                                    onClick={() => handleToggle(mod)}
                                    disabled={toggling === mod.filename}
                                >
                                    {toggling === mod.filename ? (
                                        <div className="btn-spinner small"></div>
                                    ) : (
                                        <span className="toggle-slider"></span>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Mods
