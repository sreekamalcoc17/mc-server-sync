import { useState, useEffect } from 'react'
import { AppConfig } from '../App'
import './ServerConfig.css'

interface PlayerEntry {
    uuid: string
    name: string
    level?: number
}

interface ServerConfigProps {
    config: AppConfig | null
}

function ServerConfig({ config }: ServerConfigProps) {
    const [properties, setProperties] = useState<Record<string, string | number | boolean>>({})
    const [ops, setOps] = useState<PlayerEntry[]>([])
    const [whitelist, setWhitelist] = useState<PlayerEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [newOpName, setNewOpName] = useState('')
    const [newWhitelistName, setNewWhitelistName] = useState('')
    const [addingOp, setAddingOp] = useState(false)
    const [addingWhitelist, setAddingWhitelist] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isConfigured = config?.serverPath && config.serverPath.length > 0

    useEffect(() => {
        if (isConfigured) {
            loadData()
        }
    }, [isConfigured])

    const loadData = async () => {
        setLoading(true)
        try {
            const [props, opsData, whitelistData] = await Promise.all([
                window.electronAPI.getServerProperties(),
                window.electronAPI.getOps(),
                window.electronAPI.getWhitelist()
            ])
            setProperties(props)
            setOps(opsData)
            setWhitelist(whitelistData)
        } catch (err) {
            setError(String(err))
        } finally {
            setLoading(false)
        }
    }

    const handlePropertyChange = async (key: string, value: string | number | boolean) => {
        setSaving(true)
        setError(null)
        try {
            const success = await window.electronAPI.setServerProperties({ [key]: value })
            if (success) {
                setProperties(prev => ({ ...prev, [key]: value }))
            }
        } catch (err) {
            setError(String(err))
        } finally {
            setSaving(false)
        }
    }

    const handleAddOp = async () => {
        if (!newOpName.trim()) return
        setAddingOp(true)
        setError(null)
        try {
            const result = await window.electronAPI.addOp(newOpName.trim())
            if (result.success && result.player) {
                setOps(prev => [...prev, result.player!])
                setNewOpName('')
            } else {
                setError(result.error || 'Failed to add operator')
            }
        } catch (err) {
            setError(String(err))
        } finally {
            setAddingOp(false)
        }
    }

    const handleRemoveOp = async (uuid: string) => {
        try {
            await window.electronAPI.removeOp(uuid)
            setOps(prev => prev.filter(op => op.uuid !== uuid))
        } catch (err) {
            setError(String(err))
        }
    }

    const handleAddToWhitelist = async () => {
        if (!newWhitelistName.trim()) return
        setAddingWhitelist(true)
        setError(null)
        try {
            const result = await window.electronAPI.addToWhitelist(newWhitelistName.trim())
            if (result.success && result.player) {
                setWhitelist(prev => [...prev, result.player!])
                setNewWhitelistName('')
            } else {
                setError(result.error || 'Failed to add player')
            }
        } catch (err) {
            setError(String(err))
        } finally {
            setAddingWhitelist(false)
        }
    }

    const handleRemoveFromWhitelist = async (uuid: string) => {
        try {
            await window.electronAPI.removeFromWhitelist(uuid)
            setWhitelist(prev => prev.filter(p => p.uuid !== uuid))
        } catch (err) {
            setError(String(err))
        }
    }

    if (!isConfigured) {
        return (
            <div className="server-config animate-fadeIn">
                <div className="page-header">
                    <h1>Server Config</h1>
                    <p>Configure your server settings</p>
                </div>
                <div className="config-warning">
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
            <div className="server-config animate-fadeIn">
                <div className="page-header">
                    <h1>Server Config</h1>
                    <p>Configure your server settings</p>
                </div>
                <div className="loading-state">
                    <div className="btn-spinner"></div>
                    <p>Loading server configuration...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="server-config animate-fadeIn">
            <div className="page-header">
                <h1>Server Config</h1>
                <p>Configure your server settings{saving && ' • Saving...'}</p>
            </div>

            {error && (
                <div className="error-message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {error}
                    <button className="error-dismiss" onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="config-grid">
                {/* Game Settings */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Game Settings</h3>
                        <p className="card-subtitle">Core gameplay configuration</p>
                    </div>
                    <div className="settings-list">
                        <div className="setting-row">
                            <label>Difficulty</label>
                            <select
                                className="input select-input"
                                value={String(properties['difficulty'] || 'normal')}
                                onChange={(e) => handlePropertyChange('difficulty', e.target.value)}
                            >
                                <option value="peaceful">Peaceful</option>
                                <option value="easy">Easy</option>
                                <option value="normal">Normal</option>
                                <option value="hard">Hard</option>
                            </select>
                        </div>
                        <div className="setting-row">
                            <label>Gamemode</label>
                            <select
                                className="input select-input"
                                value={String(properties['gamemode'] || 'survival')}
                                onChange={(e) => handlePropertyChange('gamemode', e.target.value)}
                            >
                                <option value="survival">Survival</option>
                                <option value="creative">Creative</option>
                                <option value="adventure">Adventure</option>
                                <option value="spectator">Spectator</option>
                            </select>
                        </div>
                        <div className="setting-row">
                            <label>Max Players</label>
                            <input
                                type="number"
                                className="input"
                                value={Number(properties['max-players']) || 20}
                                min={1}
                                max={100}
                                onChange={(e) => handlePropertyChange('max-players', parseInt(e.target.value))}
                            />
                        </div>
                        <div className="setting-row">
                            <label>View Distance</label>
                            <input
                                type="number"
                                className="input"
                                value={Number(properties['view-distance']) || 10}
                                min={2}
                                max={32}
                                onChange={(e) => handlePropertyChange('view-distance', parseInt(e.target.value))}
                            />
                        </div>
                    </div>
                </div>

                {/* Toggles */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Server Rules</h3>
                        <p className="card-subtitle">Enable or disable features</p>
                    </div>
                    <div className="settings-list">
                        <div className="setting-row toggle-row">
                            <label>PvP</label>
                            <button
                                className={`toggle ${properties['pvp'] === true ? 'active' : ''}`}
                                onClick={() => handlePropertyChange('pvp', !properties['pvp'])}
                            >
                                <span className="toggle-slider"></span>
                            </button>
                        </div>
                        <div className="setting-row toggle-row">
                            <label>Allow Flight</label>
                            <button
                                className={`toggle ${properties['allow-flight'] === true ? 'active' : ''}`}
                                onClick={() => handlePropertyChange('allow-flight', !properties['allow-flight'])}
                            >
                                <span className="toggle-slider"></span>
                            </button>
                        </div>
                        <div className="setting-row toggle-row">
                            <label>Online Mode</label>
                            <button
                                className={`toggle ${properties['online-mode'] === true ? 'active' : ''}`}
                                onClick={() => handlePropertyChange('online-mode', !properties['online-mode'])}
                            >
                                <span className="toggle-slider"></span>
                            </button>
                        </div>
                        <div className="setting-row toggle-row">
                            <label>Hardcore</label>
                            <button
                                className={`toggle ${properties['hardcore'] === true ? 'active' : ''}`}
                                onClick={() => handlePropertyChange('hardcore', !properties['hardcore'])}
                            >
                                <span className="toggle-slider"></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Operators */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Operators</h3>
                        <p className="card-subtitle">Players with admin permissions</p>
                    </div>
                    <div className="player-list">
                        {ops.length === 0 ? (
                            <p className="empty-state">No operators configured</p>
                        ) : (
                            ops.map(op => (
                                <div key={op.uuid} className="player-row">
                                    <img
                                        src={`https://crafatar.com/avatars/${op.uuid}?size=32&overlay`}
                                        alt={op.name}
                                        className="player-avatar"
                                    />
                                    <span className="player-name">{op.name}</span>
                                    <button
                                        className="btn btn-small btn-danger"
                                        onClick={() => handleRemoveOp(op.uuid)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="add-player-row">
                        <input
                            type="text"
                            className="input"
                            placeholder="Minecraft username"
                            value={newOpName}
                            onChange={(e) => setNewOpName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddOp()}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleAddOp}
                            disabled={addingOp || !newOpName.trim()}
                        >
                            {addingOp ? '...' : 'Add'}
                        </button>
                    </div>
                </div>

                {/* Whitelist */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Whitelist</h3>
                        <p className="card-subtitle">Players allowed to join</p>
                    </div>
                    <div className="player-list">
                        {whitelist.length === 0 ? (
                            <p className="empty-state">No players whitelisted</p>
                        ) : (
                            whitelist.map(player => (
                                <div key={player.uuid} className="player-row">
                                    <img
                                        src={`https://crafatar.com/avatars/${player.uuid}?size=32&overlay`}
                                        alt={player.name}
                                        className="player-avatar"
                                    />
                                    <span className="player-name">{player.name}</span>
                                    <button
                                        className="btn btn-small btn-danger"
                                        onClick={() => handleRemoveFromWhitelist(player.uuid)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="add-player-row">
                        <input
                            type="text"
                            className="input"
                            placeholder="Minecraft username"
                            value={newWhitelistName}
                            onChange={(e) => setNewWhitelistName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddToWhitelist()}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleAddToWhitelist}
                            disabled={addingWhitelist || !newWhitelistName.trim()}
                        >
                            {addingWhitelist ? '...' : 'Add'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ServerConfig
