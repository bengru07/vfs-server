import { readFileSync } from "fs"
import { resolve } from "path"
import type { AppConfig, FolderConfig, FolderOps, ResolvedConfig, ResolvedSection } from "./types.js"

const DEFAULT_FOLDER_OPS: FolderConfig = {
  enabled: false,
  ops: {
    create: false,
    rename: false,
    delete: false,
    move: false,
    list: false,
  },
}

export function loadConfig(configPath = "./vfs.config.json"): ResolvedConfig {
  const raw = readFileSync(resolve(process.cwd(), configPath), "utf-8")
  const app: AppConfig = JSON.parse(raw)

  validate(app)

  for (const section of app.sections) {
    if (section.folders) {
      section.folders = normalizeFolderConfig(section.folders)
    }
  }

  const sections = new Map<string, ResolvedSection>()

  for (const section of app.sections) {
    const parent = section.parent
      ? app.sections.find((s) => s.name === section.parent)
      : undefined

    const children = (section.children ?? [])
      .map((name) => app.sections.find((s) => s.name === name))
      .filter(Boolean) as typeof app.sections

    sections.set(section.name, {
      config: section,
      isChild: !!section.parent,
      isParent: (section.children?.length ?? 0) > 0,
      parent,
      children,
    })
  }

  validateRelationships(sections, app)

  return { app, sections }
}

function normalizeFolderConfig(raw: Partial<FolderConfig> & { enabled?: boolean }): FolderConfig {
  if (raw.enabled === false) {
    return { enabled: false, ops: { create: false, rename: false, delete: false, move: false, list: false } }
  }

  const ops: Partial<FolderOps> = raw.ops ?? {}
  return {
    enabled: true,
    ops: {
      create: ops.create ?? true,
      rename: ops.rename ?? true,
      delete: ops.delete ?? true,
      move: ops.move ?? true,
      list: ops.list ?? true,
    },
  }
}

function validate(app: AppConfig) {
  if (!app.dataDir) throw new Error("vfs.config.json: missing dataDir")
  if (!app.port) throw new Error("vfs.config.json: missing port")
  if (!Array.isArray(app.sections)) throw new Error("vfs.config.json: sections must be an array")

  for (const s of app.sections) {
    if (!s.name) throw new Error(`section missing name`)
    if (!s.idField) throw new Error(`section ${s.name}: missing idField`)
    if (!["directory", "file"].includes(s.storage)) {
      throw new Error(`section ${s.name}: storage must be 'directory' or 'file'`)
    }
    if (s.storage === "directory" && s.parent) {
      throw new Error(`section ${s.name}: directory storage cannot have a parent`)
    }

  }
}

function validateRelationships(
  sections: Map<string, ResolvedSection>,
  app: AppConfig
) {
  for (const s of app.sections) {
    if (s.parent && !sections.has(s.parent)) {
      throw new Error(`section ${s.name}: parent '${s.parent}' not found`)
    }
    for (const child of s.children ?? []) {
      if (!sections.has(child)) {
        throw new Error(`section ${s.name}: child '${child}' not found`)
      }
    }
  }
}

export { DEFAULT_FOLDER_OPS }