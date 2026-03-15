import { mkdir, rm, writeFile } from "fs/promises"
import { dirname } from "path"
import type { PathResolver } from "./resolver.js"
import type { ResolvedConfig } from "../config/types.js"
import type { StoreReader } from "./reader.js"

export class StoreWriter {
  constructor(
    private resolver: PathResolver,
    private config: ResolvedConfig,
    private reader: StoreReader
  ) {}

  async write(
    sectionName: string,
    id: string,
    data: Record<string, unknown>,
    parentId?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (parentId) {
      const parent = resolved.parent!
      const parentExists = await this.reader.exists(parent.name, parentId)
      if (!parentExists) {
        throw new Error(`Parent ${parent.name} with id '${parentId}' not found`)
      }
    }

    const file = this.resolver.recordFile(sectionName, id, parentId)
    await mkdir(dirname(file), { recursive: true })

    const idField = resolved.config.idField
    const record = { ...data, [idField]: id }

    await writeFile(file, JSON.stringify(record, null, 2), "utf-8")
  }

  async patch(
    sectionName: string,
    id: string,
    updates: Record<string, unknown>,
    parentId?: string
  ): Promise<Record<string, unknown>> {
    const existing = await this.reader.get(sectionName, id, parentId)
    if (!existing) throw new Error(`${sectionName} '${id}' not found`)

    const merged = {
      ...(existing as Record<string, unknown>),
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    await this.write(sectionName, id, merged, parentId)
    return merged
  }

  async delete(
    sectionName: string,
    id: string,
    parentId?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    const exists = await this.reader.exists(sectionName, id, parentId)
    if (!exists) throw new Error(`${sectionName} '${id}' not found`)

    if (resolved.config.storage === "directory") {
      const dir = this.resolver.recordDir(sectionName, id, parentId)
      await rm(dir, { recursive: true, force: true })
      return
    }

    const file = this.resolver.recordFile(sectionName, id, parentId)
    await rm(file, { force: true })
  }

  async deleteChildren(sectionName: string, parentId: string): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    for (const child of resolved.children) {
      const dir = this.resolver.sectionDir(child.name, parentId)
      await rm(dir, { recursive: true, force: true })
    }
  }

  async ensureDataDir(): Promise<void> {
    const root = this.resolver.root()
    await mkdir(root, { recursive: true })

    for (const [, resolved] of this.config.sections) {
      if (!resolved.isChild) {
        const dir = this.resolver.sectionDir(resolved.config.name)
        await mkdir(dir, { recursive: true })
      }
    }
  }
}