import { readdir, readFile } from "fs/promises"
import { join } from "path"
import type { PathResolver } from "./resolver.js"
import type { ResolvedConfig } from "../config/types.js"

export class StoreReader {
  constructor(
    private resolver: PathResolver,
    private config: ResolvedConfig
  ) {}

  async list(sectionName: string, parentId?: string): Promise<unknown[]> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    const dir = this.resolver.sectionDir(sectionName, parentId)
    const results: unknown[] = []

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return []
    }

    if (resolved.config.storage === "directory") {
      for (const entry of entries) {
        const file = this.resolver.recordFile(sectionName, entry, parentId)
        try {
          const raw = await readFile(file, "utf-8")
          results.push(JSON.parse(raw))
        } catch {
          continue
        }
      }
      return results
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      try {
        const raw = await readFile(join(dir, entry), "utf-8")
        results.push(JSON.parse(raw))
      } catch {
        continue
      }
    }

    return results
  }

  async get(sectionName: string, id: string, parentId?: string): Promise<unknown> {
    const file = this.resolver.recordFile(sectionName, id, parentId)
    try {
      const raw = await readFile(file, "utf-8")
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async exists(sectionName: string, id: string, parentId?: string): Promise<boolean> {
    const file = this.resolver.recordFile(sectionName, id, parentId)
    try {
      await readFile(file)
      return true
    } catch {
      return false
    }
  }
}