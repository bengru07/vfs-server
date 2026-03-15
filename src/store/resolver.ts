import { join, resolve } from "path"
import type { ResolvedConfig } from "../config/types.js"

export class PathResolver {
  private dataDir: string
  private config: ResolvedConfig

  constructor(config: ResolvedConfig) {
    this.config = config
    this.dataDir = resolve(process.cwd(), config.app.dataDir)
  }

  root(): string {
    return this.dataDir
  }

  sectionDir(sectionName: string, parentId?: string): string {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (resolved.isChild) {
      if (!parentId) throw new Error(`section ${sectionName} requires a parentId`)
      const parent = resolved.parent!
      return join(this.dataDir, parent.name, parentId, sectionName)
    }

    return join(this.dataDir, sectionName)
  }

  recordDir(sectionName: string, id: string, parentId?: string): string {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (resolved.config.storage === "directory") {
      return join(this.sectionDir(sectionName, parentId), id)
    }

    return this.sectionDir(sectionName, parentId)
  }

  recordFile(sectionName: string, id: string, parentId?: string): string {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (resolved.config.storage === "directory") {
      return join(this.recordDir(sectionName, id, parentId), `${sectionName.slice(0, -1)}.json`)
    }

    return join(this.sectionDir(sectionName, parentId), `${id}.json`)
  }

  allRecordFiles(sectionName: string, parentId?: string): string {
    return join(this.sectionDir(sectionName, parentId), "*.json")
  }

  parentDir(sectionName: string, id: string): string {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)
    if (resolved.config.storage !== "directory") {
      throw new Error(`section ${sectionName} is not a directory storage type`)
    }
    return join(this.dataDir, sectionName, id)
  }
}