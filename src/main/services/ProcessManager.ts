import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'

export interface ProcessManagerEvents {
    'log': (line: string) => void
    'error': (error: Error) => void
    'started': (pid: number) => void
    'stopped': (code: number | null) => void
}

/**
 * ProcessManager - Manages the Minecraft server Java process
 */
export class ProcessManager extends EventEmitter {
    private process: ChildProcess | null = null
    private serverPath: string = ''
    private javaPath: string = 'java'
    private ramMin: number = 1      // GB
    private ramMax: number = 4      // GB
    private javaArgs: string = ''   // No default

    get isRunning(): boolean {
        const hasProcess = this.process !== null
        const exitCode = this.process?.exitCode
        const isRunning = hasProcess && exitCode === null
        console.log('[ProcessManager] isRunning check:', { hasProcess, exitCode, isRunning, pid: this.process?.pid })
        return isRunning
    }

    get pid(): number | undefined {
        return this.process?.pid
    }

    configure(options: {
        serverPath: string
        javaPath?: string
        ramMin?: number
        ramMax?: number
        javaArgs?: string
    }) {
        this.serverPath = options.serverPath
        if (options.javaPath) this.javaPath = options.javaPath
        if (options.ramMin !== undefined) this.ramMin = options.ramMin
        if (options.ramMax !== undefined) this.ramMax = options.ramMax
        if (options.javaArgs !== undefined) this.javaArgs = options.javaArgs
    }

    async start(): Promise<boolean> {
        if (this.isRunning) {
            this.emit('log', '[MineSync] Server is already running')
            return false
        }

        if (!this.serverPath) {
            this.emit('error', new Error('Server path not configured'))
            return false
        }

        try {
            const serverDir = this.serverPath
            const serverJar = path.join(serverDir, 'server.jar')

            // Build Java arguments - RAM in GB
            const args = [
                `-Xms${this.ramMin}G`,
                `-Xmx${this.ramMax}G`,
                '-jar',
                serverJar,
                ...this.javaArgs.split(' ').filter(a => a.trim())
            ]

            // Log the full command for debugging
            const fullCommand = `"${this.javaPath}" ${args.join(' ')}`
            this.emit('log', `[MineSync] ========================================`)
            this.emit('log', `[MineSync] Starting Minecraft Server`)
            this.emit('log', `[MineSync] Command: ${fullCommand}`)
            this.emit('log', `[MineSync] Working Directory: ${serverDir}`)
            this.emit('log', `[MineSync] ========================================`)

            this.process = spawn(this.javaPath, args, {
                cwd: serverDir,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            })
            console.log('[ProcessManager] Process spawned, pid:', this.process?.pid)

            // Handle stdout
            this.process.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n')
                lines.forEach(line => {
                    if (line.trim()) {
                        this.emit('log', line)
                    }
                })
            })

            // Handle stderr
            this.process.stderr?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n')
                lines.forEach(line => {
                    if (line.trim()) {
                        this.emit('log', `[ERROR] ${line}`)
                    }
                })
            })

            // Handle process exit
            this.process.on('exit', (code) => {
                console.log('[ProcessManager] Process exited with code:', code)
                this.emit('log', `[MineSync] Server stopped with code: ${code}`)
                this.emit('stopped', code)
                this.process = null
            })

            // Handle process error
            this.process.on('error', (error) => {
                console.log('[ProcessManager] Process error:', error)
                this.emit('error', error)
                this.process = null
            })

            if (this.process.pid) {
                this.emit('started', this.process.pid)
                this.emit('log', `[MineSync] Server started with PID: ${this.process.pid}`)
                return true
            }

            return false
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)))
            return false
        }
    }

    async stop(): Promise<boolean> {
        if (!this.isRunning || !this.process) {
            this.emit('log', '[MineSync] Server is not running')
            return true
        }

        return new Promise((resolve) => {
            if (!this.process) {
                resolve(true)
                return
            }

            // Try graceful shutdown first by sending "stop" command
            this.emit('log', '[MineSync] Sending stop command to server...')
            this.process.stdin?.write('stop\n')

            // Set a timeout for graceful shutdown
            const timeout = setTimeout(() => {
                if (this.process && this.isRunning) {
                    this.emit('log', '[MineSync] Force killing server process...')
                    this.process.kill('SIGKILL')
                }
            }, 30000) // 30 second timeout

            this.process.once('exit', () => {
                clearTimeout(timeout)
                resolve(true)
            })
        })
    }

    sendCommand(command: string) {
        if (this.isRunning && this.process?.stdin) {
            this.process.stdin.write(command + '\n')
            this.emit('log', `[MineSync] Sent command: ${command}`)
        }
    }

    /**
     * Send save-all command to flush world data to disk
     */
    saveAll(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.isRunning) {
                resolve()
                return
            }
            this.sendCommand('save-all')
            // Give Minecraft time to save
            setTimeout(resolve, 2000)
        })
    }

    /**
     * Disable auto-save (safe for copying files)
     */
    saveOff() {
        if (this.isRunning) {
            this.sendCommand('save-off')
        }
    }

    /**
     * Re-enable auto-save
     */
    saveOn() {
        if (this.isRunning) {
            this.sendCommand('save-on')
        }
    }
}

// Singleton instance
export const processManager = new ProcessManager()
