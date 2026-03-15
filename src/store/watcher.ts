import chokidar, { type FSWatcher } from "chokidar"
import { relative } from "path"
import type { ResolvedConfig } from "../config/types.js"
import type { PathResolver } from "./resolver.js"

export type WatchEventType = "created" | "updated" | "deleted"

export interface WatchEvent {
  type: WatchEventType
  path: string
  section: string
  id: string
  parentId?: string
  timestamp: string
}

type WatchListener = (event: WatchEvent) => void

export class StoreWatcher {
  private watcher: FSWatcher | null = null
  private listeners: Set<WatchListener> = new Set()

  constructor(
    private resolver: PathResolver,
    private config: ResolvedConfig
  ) {}

  start(): void {
    if (!this.config.app.watch) return

    const root = this.resolver.root()

    this.watcher = chokidar.watch(root, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      ignored: /(^|[\/\\])\../,
    })

    this.watcher
      .on("add", (path) => this.emit("created", path))
      .on("change", (path) => this.emit("updated", path))
      .on("unlink", (path) => this.emit("deleted", path))
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    this.listeners.clear()
  }

  subscribe(listener: WatchListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(type: WatchEventType, absolutePath: string): void {
    if (!absolutePath.endsWith(".json")) return

    const event = this.parsePath(type, absolutePath)
    if (!event) return

    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private parsePath(type: WatchEventType, absolutePath: string): WatchEvent | null {
    const root = this.resolver.root()
    const rel = relative(root, absolutePath)
    const parts = rel.split(/[\/\\]/).filter(Boolean)

    if (parts.length === 0) return null

    const timestamp = new Date().toISOString()

    for (const [name, resolved] of this.config.sections) {
      if (resolved.isChild) continue

      if (parts[0] !== name) continue

      if (resolved.config.storage === "directory" && parts.length >= 3) {
        const id = parts[1]

        if (parts.length === 3) {
          return { type, path: rel, section: name, id, timestamp }
        }

        if (parts.length === 4) {
          const childSection = parts[2]
          const childId = parts[3].replace(".json", "")
          return { type, path: rel, section: childSection, id: childId, parentId: id, timestamp }
        }
      }

      if (resolved.config.storage === "file" && parts.length === 2) {
        const id = parts[1].replace(".json", "")
        return { type, path: rel, section: name, id, timestamp }
      }
    }

    return null
  }
}