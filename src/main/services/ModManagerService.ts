import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export interface ModInfo {
    filename: string
    enabled: boolean
    size: number
}

/**
 * Service for managing mods in the mods/ folder
 */
export class ModManagerService {
    private serverPath: string

    constructor(serverPath: string) {
        this.serverPath = serverPath
    }

    private get modsPath(): string {
        return path.join(this.serverPath, 'mods')
    }

    async getMods(): Promise<ModInfo[]> {
        if (!existsSync(this.modsPath)) {
            return []
        }

        const files = await fs.readdir(this.modsPath)
        const mods: ModInfo[] = []

        for (const file of files) {
            const isJar = file.endsWith('.jar')
            const isDisabled = file.endsWith('.jar.disabled')

            if (isJar || isDisabled) {
                const filePath = path.join(this.modsPath, file)
                const stat = await fs.stat(filePath)

                mods.push({
                    filename: file,
                    enabled: isJar,
                    size: stat.size
                })
            }
        }

        // Sort: enabled first, then alphabetically
        return mods.sort((a, b) => {
            if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
            return a.filename.localeCompare(b.filename)
        })
    }

    async toggleMod(filename: string, enable: boolean): Promise<boolean> {
        const currentPath = path.join(this.modsPath, filename)

        if (!existsSync(currentPath)) {
            return false
        }

        let newFilename: string
        if (enable) {
            // Remove .disabled suffix
            newFilename = filename.replace('.jar.disabled', '.jar')
        } else {
            // Add .disabled suffix
            newFilename = filename.replace('.jar', '.jar.disabled')
        }

        const newPath = path.join(this.modsPath, newFilename)
        await fs.rename(currentPath, newPath)
        return true
    }

    async getModLoader(): Promise<'fabric' | 'forge' | 'unknown'> {
        // Check for fabric-server-launch.jar or fabric.mod.json presence
        const fabricLauncher = path.join(this.serverPath, 'fabric-server-launch.jar')
        const forgeDir = path.join(this.serverPath, 'libraries', 'net', 'minecraftforge')

        if (existsSync(fabricLauncher)) {
            return 'fabric'
        }

        if (existsSync(forgeDir)) {
            return 'forge'
        }

        return 'unknown'
    }
}
