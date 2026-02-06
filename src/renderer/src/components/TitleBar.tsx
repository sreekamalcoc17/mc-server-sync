import './TitleBar.css'

function TitleBar() {
    const handleMinimize = () => window.electronAPI.minimizeWindow()
    const handleMaximize = () => window.electronAPI.maximizeWindow()
    const handleClose = () => window.electronAPI.closeWindow()

    return (
        <header className="titlebar">
            <div className="titlebar-drag">
                <div className="titlebar-logo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="titlebar-title">MineSync</span>
                </div>
            </div>
            <div className="titlebar-controls">
                <button className="titlebar-btn" onClick={handleMinimize} aria-label="Minimize">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <rect y="5" width="12" height="2" />
                    </svg>
                </button>
                <button className="titlebar-btn" onClick={handleMaximize} aria-label="Maximize">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="1" y="1" width="10" height="10" />
                    </svg>
                </button>
                <button className="titlebar-btn titlebar-btn-close" onClick={handleClose} aria-label="Close">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        </header>
    )
}

export default TitleBar
