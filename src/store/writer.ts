import { mkdir, rm, writeFile, rename, readdir, stat, cp } from "fs/promises"
import { join, dirname, basename } from "path"
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
    parentId?: string,
    folder?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    const upsert = resolved.config.upsert ?? false

    if (parentId) {
      const parent = resolved.parent!
      const parentExists = await this.reader.exists(parent.name, parentId)
      if (!parentExists) {
        if (!upsert) {
          throw new Error(`Parent ${parent.name} with id '${parentId}' not found`)
        }
      }
    }

    let file: string

    if (resolved.config.storage === "file") {
      const sectionBase = this.resolver.sectionDir(sectionName, parentId)
      const existingFile = await this.findFileInDir(sectionBase, `${id}.json`)

      console.log(`[writer.write] section=${sectionName} id=${id} folder=${folder} existingFile=${existingFile} sectionBase=${sectionBase}`)

      if (existingFile) {
        file = existingFile
      } else if (folder) {
        file = join(this.resolver.folderPath(sectionName, folder, parentId), `${id}.json`)
      } else {
        file = join(sectionBase, `${id}.json`)
      }
    } else {
      file = this.resolver.recordFile(sectionName, id, parentId, folder)
    }

    console.log(`[writer.write] WRITING TO: ${file}`)
    await mkdir(dirname(file), { recursive: true })

    const idField = resolved.config.idField
    const record = { ...data, [idField]: id }

    await writeFile(file, JSON.stringify(record, null, 2), "utf-8")
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
      const found = await this.reader.findRecordDir(sectionName, id, parentId)
      if (found) {
        await rm(found.dir, { recursive: true, force: true })
      }
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

  async moveRecord(
    sectionName: string,
    id: string,
    destinationFolder: string | undefined,
    parentId?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (resolved.config.storage === "directory") {
      const found = await this.reader.findRecordDir(sectionName, id, parentId)
      if (!found) throw new Error(`${sectionName} '${id}' not found`)

      const sectionBase = this.resolver.sectionDir(sectionName, parentId)
      const destBase = destinationFolder
        ? this.resolver.folderPath(sectionName, destinationFolder, parentId)
        : sectionBase
      const destDir = join(destBase, id)

      if (this.resolver.isAncestorOf(found.dir, destDir)) {
        throw new Error(`Cannot move '${id}' into its own subdirectory`)
      }
      if (found.dir === destDir) return

      await mkdir(destBase, { recursive: true })
      await rename(found.dir, destDir)
      return
    }

    const srcFile = this.resolver.recordFile(sectionName, id, parentId)
    const destBase = destinationFolder
      ? this.resolver.folderPath(sectionName, destinationFolder, parentId)
      : this.resolver.sectionDir(sectionName, parentId)
    const destFile = join(destBase, `${id}.json`)

    if (srcFile === destFile) return

    let srcExists = false
    try {
      await stat(srcFile)
      srcExists = true
    } catch {}

    if (!srcExists) {
      const sectionBase = this.resolver.sectionDir(sectionName, parentId)
      const found = await this.findFileInDir(sectionBase, `${id}.json`)
      if (!found) throw new Error(`${sectionName} '${id}' not found`)
      await mkdir(destBase, { recursive: true })
      await rename(found, destFile)
      return
    }

    await mkdir(destBase, { recursive: true })
    await rename(srcFile, destFile)
  }

  private async findFileInDir(dir: string, filename: string): Promise<string | null> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return null
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try { st = await stat(full) } catch { continue }
      if (st.isDirectory()) {
        const found = await this.findFileInDir(full, filename)
        if (found) return found
      } else if (entry === filename) {
        return full
      }
    }
    return null
  }

  async createFolder(
    sectionName: string,
    folderPath: string,
    parentId?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)
    if (!resolved.config.folders?.enabled) {
      throw new Error(`section ${sectionName} does not have folders enabled`)
    }

    const safePath = this.resolver.safeFolderPath(folderPath)
    if (!safePath) throw new Error("Invalid folder path")

    const target = this.resolver.folderPath(sectionName, safePath, parentId)
    await mkdir(target, { recursive: true })
  }

  async renameFolder(
    sectionName: string,
    folderPath: string,
    newName: string,
    parentId?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    if (newName.includes("/") || newName === "." || newName === "..") {
      throw new Error("New folder name must not contain path separators")
    }

    const safePath = this.resolver.safeFolderPath(folderPath)
    const target = this.resolver.folderPath(sectionName, safePath, parentId)
    const parent = dirname(target)
    const dest = join(parent, newName)

    if (this.resolver.isAncestorOf(target, dest)) {
      throw new Error("Cannot rename folder into its own descendant")
    }

    await rename(target, dest)
  }

  async deleteFolder(
    sectionName: string,
    folderPath: string,
    parentId?: string,
    force = false
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    const safePath = this.resolver.safeFolderPath(folderPath)
    const target = this.resolver.folderPath(sectionName, safePath, parentId)

    if (!force) {
      const hasContents = await this.folderHasContents(target)
      if (hasContents) {
        throw new Error(
          `Folder '${folderPath}' is not empty. Use force=true to delete recursively.`
        )
      }
    }

    await rm(target, { recursive: true, force: true })
  }

  async moveFolder(
    sectionName: string,
    folderPath: string,
    destinationFolder: string,
    parentId?: string
  ): Promise<void> {
    const resolved = this.config.sections.get(sectionName)
    if (!resolved) throw new Error(`Unknown section: ${sectionName}`)

    const safeSrc = this.resolver.safeFolderPath(folderPath)
    const safeDest = this.resolver.safeFolderPath(destinationFolder)

    const srcAbs = this.resolver.folderPath(sectionName, safeSrc, parentId)
    const destBase = safeDest
      ? this.resolver.folderPath(sectionName, safeDest, parentId)
      : this.resolver.sectionDir(sectionName, parentId)

    const folderName = basename(srcAbs)
    const destAbs = join(destBase, folderName)

    if (this.resolver.isAncestorOf(srcAbs, destAbs)) {
      throw new Error(`Cannot move folder '${folderPath}' into its own descendant '${destinationFolder}'`)
    }

    if (srcAbs === destAbs) return

    await mkdir(destBase, { recursive: true })
    await rename(srcAbs, destAbs)
  }

  private async folderHasContents(dir: string): Promise<boolean> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return false
    }
    return entries.length > 0
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