import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export interface ServerProperties {
    [key: string]: string | number | boolean
}

export interface PlayerEntry {
    uuid: string
    name: string
    level?: number  // For ops
    bypassesPlayerLimit?: boolean
}

/**
 * Service for managing server.properties, ops.json, and whitelist.json
 */
export class ServerPropertiesService {
    private serverPath: string

    constructor(serverPath: string) {
        this.serverPath = serverPath
    }

    // ===== server.properties =====

    async getProperties(): Promise<ServerProperties> {
        const filePath = path.join(this.serverPath, 'server.properties')

        if (!existsSync(filePath)) {
            return {}
        }

        const content = await fs.readFile(filePath, 'utf-8')
        const properties: ServerProperties = {}

        for (const line of content.split('\n')) {
            const trimmed = line.trim()
            // Skip comments and empty lines
            if (trimmed.startsWith('#') || !trimmed.includes('=')) {
                continue
            }

            const [key, ...valueParts] = trimmed.split('=')
            const value = valueParts.join('=') // Handle values with '=' in them

            // Parse booleans and numbers
            if (value === 'true') {
                properties[key] = true
            } else if (value === 'false') {
                properties[key] = false
            } else if (!isNaN(Number(value)) && value !== '') {
                properties[key] = Number(value)
            } else {
                properties[key] = value
            }
        }

        return properties
    }

    async setProperties(changes: Partial<ServerProperties>): Promise<void> {
        const filePath = path.join(this.serverPath, 'server.properties')

        if (!existsSync(filePath)) {
            throw new Error('server.properties not found')
        }

        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.split('\n')
        const updatedLines: string[] = []

        for (const line of lines) {
            const trimmed = line.trim()

            // Keep comments and empty lines as-is
            if (trimmed.startsWith('#') || !trimmed.includes('=')) {
                updatedLines.push(line)
                continue
            }

            const [key] = trimmed.split('=')

            if (key in changes) {
                // Update this property
                updatedLines.push(`${key}=${changes[key]}`)
            } else {
                updatedLines.push(line)
            }
        }

        await fs.writeFile(filePath, updatedLines.join('\n'), 'utf-8')
    }

    // ===== ops.json =====

    async getOps(): Promise<PlayerEntry[]> {
        const filePath = path.join(this.serverPath, 'ops.json')

        if (!existsSync(filePath)) {
            return []
        }

        try {
            const content = await fs.readFile(filePath, 'utf-8')
            return JSON.parse(content)
        } catch {
            return []
        }
    }

    async addOp(name: string, uuid: string): Promise<void> {
        const ops = await this.getOps()

        // Check if already exists
        if (ops.some(op => op.uuid === uuid)) {
            return
        }

        ops.push({
            uuid,
            name,
            level: 4,
            bypassesPlayerLimit: false
        })

        const filePath = path.join(this.serverPath, 'ops.json')
        await fs.writeFile(filePath, JSON.stringify(ops, null, 2), 'utf-8')
    }

    async removeOp(uuid: string): Promise<void> {
        const ops = await this.getOps()
        const filtered = ops.filter(op => op.uuid !== uuid)

        const filePath = path.join(this.serverPath, 'ops.json')
        await fs.writeFile(filePath, JSON.stringify(filtered, null, 2), 'utf-8')
    }

    // ===== whitelist.json =====

    async getWhitelist(): Promise<PlayerEntry[]> {
        const filePath = path.join(this.serverPath, 'whitelist.json')

        if (!existsSync(filePath)) {
            return []
        }

        try {
            const content = await fs.readFile(filePath, 'utf-8')
            return JSON.parse(content)
        } catch {
            return []
        }
    }

    async addToWhitelist(name: string, uuid: string): Promise<void> {
        const whitelist = await this.getWhitelist()

        if (whitelist.some(p => p.uuid === uuid)) {
            return
        }

        whitelist.push({ uuid, name })

        const filePath = path.join(this.serverPath, 'whitelist.json')
        await fs.writeFile(filePath, JSON.stringify(whitelist, null, 2), 'utf-8')
    }

    async removeFromWhitelist(uuid: string): Promise<void> {
        const whitelist = await this.getWhitelist()
        const filtered = whitelist.filter(p => p.uuid !== uuid)

        const filePath = path.join(this.serverPath, 'whitelist.json')
        await fs.writeFile(filePath, JSON.stringify(filtered, null, 2), 'utf-8')
    }
}

// Lookup UUID from Mojang API
export async function lookupPlayerUUID(username: string): Promise<{ uuid: string; name: string } | null> {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`)

        if (!response.ok) {
            return null
        }

        const data = await response.json()
        // Mojang returns UUID without dashes, we need to add them
        const uuid = data.id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
        return { uuid, name: data.name }
    } catch {
        return null
    }
}
