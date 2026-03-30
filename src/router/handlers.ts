import type { Context } from "hono"
import type { StoreReader } from "../store/reader.js"
import type { StoreWriter } from "../store/writer.js"
import type { SchemaValidator } from "../validation/schema.js"
import type { ResolvedConfig } from "../config/types.js"

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

export class CrudHandlers {
  constructor(
    private reader: StoreReader,
    private writer: StoreWriter,
    private validator: SchemaValidator,
    private config: ResolvedConfig
  ) {}

  list(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      const folder = c.req.query("folder")
      try {
        const records = await this.reader.list(sectionName, parentId, folder)
        return c.json(records)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  get(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const id = c.req.param("id")
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const record = await this.reader.get(sectionName, id ?? "", parentId)
        if (!record) return c.json({ error: `${sectionName} '${id}' not found` }, 404)
        return c.json(record)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  create(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      const folder = c.req.query("folder")
      try {
        const body = await c.req.json<Record<string, unknown>>()
        const resolved = this.config.sections.get(sectionName)!
        const idField = resolved.config.idField
        const id = (body[idField] as string | undefined) ?? uuid()

        const record = {
          ...body,
          [idField]: id,
          createdAt: now(),
          updatedAt: now(),
        }

        const result = this.validator.validate(sectionName, record)
        if (!result.valid) {
          return c.json({ error: "Validation failed", details: result.errors }, 422)
        }

        await this.writer.write(sectionName, id, record, parentId, folder)
        return c.json(record, 201)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  put(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const id = c.req.param("id")
      const parentId = isChild ? c.req.param("parentId") : undefined
      const folder = c.req.query("folder")
      try {
        const body = await c.req.json<Record<string, unknown>>()
        const resolved = this.config.sections.get(sectionName)!
        const idField = resolved.config.idField

        const record = {
          ...body,
          [idField]: id,
          updatedAt: now(),
        }

        const result = this.validator.validate(sectionName, record)
        if (!result.valid) {
          return c.json({ error: "Validation failed", details: result.errors }, 422)
        }

        await this.writer.write(sectionName, id ?? "", record, parentId, folder)
        return c.json(record)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  patch(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const id = c.req.param("id")
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const body = await c.req.json<Record<string, unknown>>()

        const existing = await this.reader.get(sectionName, id ?? "", parentId)

        const resolved = this.config.sections.get(sectionName)!
        const upsert = resolved.config.upsert ?? false

        if (!existing && !upsert) {
          return c.json({ error: `${sectionName} '${id}' not found` }, 404)
        }

        const merged = {
          ...((existing as Record<string, unknown>) ?? {}),
          ...body,
          updatedAt: now(),
        }

        const result = this.validator.validate(sectionName, merged)
        if (!result.valid) {
          return c.json({ error: "Validation failed", details: result.errors }, 422)
        }

        let folder = c.req.query("folder")
        if (folder === undefined && existing) {
          const found = await this.reader.findRecordLocation(sectionName, id ?? "", parentId)
          if (found) folder = found
        }
        await this.writer.write(sectionName, id ?? "", merged, parentId, folder)
        return c.json(merged)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  delete(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const id = c.req.param("id")
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const exists = await this.reader.exists(sectionName, id ?? "", parentId)
        if (!exists) return c.json({ error: `${sectionName} '${id}' not found` }, 404)

        const resolved = this.config.sections.get(sectionName)!
        if (resolved.isParent) {
          await this.writer.deleteChildren(sectionName, id ?? "")
        }

        await this.writer.delete(sectionName, id ?? "", parentId)
        return c.json({ deleted: true, id })
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  moveRecord(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const id = c.req.param("id")
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const body = await c.req.json<{ folder?: string }>()
        await this.writer.moveRecord(sectionName, id ?? "", body.folder, parentId)
        return c.json({ moved: true, id, folder: body.folder ?? null })
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  listFolders(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      const folderPath = c.req.query("path")
      try {
        const tree = await this.reader.listFolders(sectionName, parentId, folderPath)
        return c.json(tree)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  createFolder(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const body = await c.req.json<{ path: string }>()
        if (!body.path) return c.json({ error: "path is required" }, 400)
        await this.writer.createFolder(sectionName, body.path, parentId)
        return c.json({ created: true, path: body.path }, 201)
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  renameFolder(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const body = await c.req.json<{ path: string; name: string }>()
        if (!body.path) return c.json({ error: "path is required" }, 400)
        if (!body.name) return c.json({ error: "name is required" }, 400)
        await this.writer.renameFolder(sectionName, body.path, body.name, parentId)
        return c.json({ renamed: true, path: body.path, name: body.name })
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  deleteFolder(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const body = await c.req.json<{ path: string; force?: boolean }>()
        if (!body.path) return c.json({ error: "path is required" }, 400)
        await this.writer.deleteFolder(sectionName, body.path, parentId, body.force ?? false)
        return c.json({ deleted: true, path: body.path })
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }

  moveFolder(sectionName: string, isChild: boolean) {
    return async (c: Context) => {
      const parentId = isChild ? c.req.param("parentId") : undefined
      try {
        const body = await c.req.json<{ path: string; destination: string }>()
        if (!body.path) return c.json({ error: "path is required" }, 400)
        if (body.destination === undefined) return c.json({ error: "destination is required" }, 400)
        await this.writer.moveFolder(sectionName, body.path, body.destination, parentId)
        return c.json({ moved: true, path: body.path, destination: body.destination })
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
      }
    }
  }
}