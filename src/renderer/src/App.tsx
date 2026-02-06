import { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import ServerConfig from './pages/ServerConfig'
import Mods from './pages/Mods'
import './styles/App.css'

export type Page = 'dashboard' | 'server-config' | 'mods' | 'settings'

export interface AppConfig {
    serverPath: string
    cloudSyncPath: string
    ramMin: number
    ramMax: number
    javaPath: string
    javaArgs: string
    cloudProvider: string
    cloudFolderId: string
    autoSyncInterval: number // 0 = disabled, otherwise minutes (1, 2, 5, 10)
}

function App() {
    const [currentPage, setCurrentPage] = useState<Page>('dashboard')
    const [config, setConfig] = useState<AppConfig | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isBusy, setIsBusy] = useState(false)

    useEffect(() => {
        loadConfig()
    }, [])

    const loadConfig = async () => {
        try {
            const allConfig = await window.electronAPI.getAllConfig()
            setConfig(allConfig as AppConfig)
        } catch (error) {
            console.error('Failed to load config:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const updateConfig = async (key: keyof AppConfig, value: unknown) => {
        await window.electronAPI.setConfig(key, value)
        setConfig(prev => prev ? { ...prev, [key]: value } : null)
    }

    const handleNavigate = (page: Page) => {
        if (!isBusy) {
            setCurrentPage(page)
        }
    }

    if (isLoading) {
        return (
            <div className="app-loading">
                <div className="loader">
                    <div className="loader-ring"></div>
                    <span>Loading MineSync...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            <TitleBar />
            <div className="app-container">
                <Sidebar currentPage={currentPage} onNavigate={handleNavigate} disabled={isBusy} />
                <main className="app-content">
                    {currentPage === 'dashboard' && (
                        <Dashboard config={config} onBusyChange={setIsBusy} />
                    )}
                    {currentPage === 'server-config' && (
                        <ServerConfig config={config} />
                    )}
                    {currentPage === 'mods' && (
                        <Mods config={config} />
                    )}
                    {currentPage === 'settings' && (
                        <Settings config={config} onUpdateConfig={updateConfig} />
                    )}
                </main>
            </div>
        </div>
    )
}

export default App
