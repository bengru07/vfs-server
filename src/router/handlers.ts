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
      try {
        const records = await this.reader.list(sectionName, parentId)
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

        await this.writer.write(sectionName, id, record, parentId)
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

        await this.writer.write(sectionName, id ?? "", record, parentId)
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
        if (!existing) return c.json({ error: `${sectionName} '${id}' not found` }, 404)

        const merged = {
          ...(existing as Record<string, unknown>),
          ...body,
          updatedAt: now(),
        }

        const result = this.validator.validate(sectionName, merged)
        if (!result.valid) {
          return c.json({ error: "Validation failed", details: result.errors }, 422)
        }

        await this.writer.write(sectionName, id ?? "", merged, parentId)
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
}