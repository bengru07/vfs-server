import { readdir, readFile, stat } from "fs/promises"
import { join, relative } from "path"
import type { PathResolver } from "./resolver.js"
import type { ResolvedConfig } from "../config/types.js"
import type { FolderNode } from "../config/types.js"

export class StoreReader {
  constructor(
    private resolver: PathResolver,
    private config: ResolvedConfig
  ) {}

  async list(sectionName: string, parentId?: string, folder?: string): Promise<unknown[]> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    const dir = folder
      ? this.resolver.folderPath(sectionName, folder, parentId)
      : this.resolver.sectionDir(sectionName, parentId)

    const results: unknown[] = []

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return []
    }

    if (resolved.config.storage === "directory") {
      for (const entry of entries) {
        const entryPath = join(dir, entry)
        let st
        try {
          st = await stat(entryPath)
        } catch {
          continue
        }
        if (!st.isDirectory()) continue

        const file = join(entryPath, `${sectionName.slice(0, -1)}.json`)
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
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (resolved.config.storage === "directory") {
      const found = await this.findRecordDir(sectionName, id, parentId)
      if (!found) return null
      try {
        const raw = await readFile(found.file, "utf-8")
        return JSON.parse(raw)
      } catch {
        return null
      }
    }

    const directFile = this.resolver.recordFile(sectionName, id, parentId)
    try {
      const raw = await readFile(directFile, "utf-8")
      return JSON.parse(raw)
    } catch {}

    const sectionBase = this.resolver.sectionDir(sectionName, parentId)
    const found = await this.findFileInDir(sectionBase, `${id}.json`)
    if (!found) return null
    try {
      const raw = await readFile(found, "utf-8")
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async exists(sectionName: string, id: string, parentId?: string): Promise<boolean> {
    const result = await this.get(sectionName, id, parentId)
    return result !== null
  }

  async findRecordLocation(sectionName: string, id: string, parentId?: string): Promise<string | undefined> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) return undefined

    if (resolved.config.storage === "directory") {
      const found = await this.findRecordDir(sectionName, id, parentId)
      return found?.folder
    }

    const sectionBase = this.sectionDir(sectionName, parentId)
    const found = await this.findFileInDir(sectionBase, `${id}.json`)
    if (!found) return undefined
    const rel = relative(sectionBase, found)
    const parts = rel.split("/")
    if (parts.length <= 1) return undefined
    return parts.slice(0, -1).join("/")
  }

  private sectionDir(sectionName: string, parentId?: string): string {
    return this.resolver.sectionDir(sectionName, parentId)
  }

  private async findFileInDir(dir: string, filename: string): Promise<string | null> {
    let entries: string[]
    try { entries = await readdir(dir) } catch { return null }
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try { st = await stat(full) } catch { continue }
      if (st.isFile() && entry === filename) return full
      if (st.isDirectory()) {
        const found = await this.findFileInDir(full, filename)
        if (found) return found
      }
    }
    return null
  }

  async findRecordDir(
    sectionName: string,
    id: string,
    parentId?: string
  ): Promise<{ dir: string; file: string; folder: string | undefined } | null> {
    const sectionBase = this.resolver.sectionDir(sectionName, parentId)
    return this.searchForRecord(sectionBase, sectionName, id, sectionBase)
  }

  private async searchForRecord(
    dir: string,
    sectionName: string,
    id: string,
    sectionBase: string
  ): Promise<{ dir: string; file: string; folder: string | undefined } | null> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return null
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry)
      let st
      try {
        st = await stat(entryPath)
      } catch {
        continue
      }

      if (!st.isDirectory()) continue

      if (entry === id) {
        const file = join(entryPath, `${sectionName.slice(0, -1)}.json`)
        const relFolder = relative(sectionBase, dir)
        const folder = relFolder === "" ? undefined : relFolder
        return { dir: entryPath, file, folder }
      }

      const nested = await this.searchForRecord(entryPath, sectionName, id, sectionBase)
      if (nested) return nested
    }

    return null
  }

  async listFolders(sectionName: string, parentId?: string, folderPath?: string): Promise<FolderNode> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)
    if (!resolved.config.folders?.enabled) {
      throw new Error(`section ${sectionName} does not have folders enabled`)
    }

    const base = folderPath
      ? this.resolver.folderPath(sectionName, folderPath, parentId)
      : this.resolver.sectionDir(sectionName, parentId)

    return this.buildFolderTree(base, base, folderPath ?? "", sectionName)
  }

  private async buildFolderTree(
    dir: string,
    sectionBase: string,
    currentPath: string,
    sectionName: string
  ): Promise<FolderNode> {
    const node: FolderNode = {
      name: currentPath === "" ? "" : currentPath.split("/").pop()!,
      path: currentPath,
      children: [],
      items: [],
    }

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return node
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry)
      let st
      try {
        st = await stat(entryPath)
      } catch {
        continue
      }

      if (!st.isDirectory()) continue

      const childPath = currentPath === "" ? entry : `${currentPath}/${entry}`
      const recordFile = join(entryPath, `${sectionName.slice(0, -1)}.json`)
      let isRecord = false
      try {
        await readFile(recordFile)
        isRecord = true
      } catch {}

      if (isRecord) {
        node.items.push(entry)
      } else {
        const childNode = await this.buildFolderTree(entryPath, sectionBase, childPath, sectionName)
        node.children.push(childNode)
      }
    }

    return node
  }
}