import { Hono } from "hono"
import { cors } from "hono/cors"
import type { ResolvedConfig } from "../config/types.js"
import type { CrudHandlers } from "./handlers.js"

export function buildRouter(
  config: ResolvedConfig,
  handlers: CrudHandlers
): Hono {
  const app = new Hono()

  app.use("*", cors({ origin: config.app.cors }))

  app.get("/health", (c) => c.json({ ok: true, timestamp: new Date().toISOString() }))

  for (const [name, resolved] of config.sections) {
    if (resolved.isChild) continue
    mountTopLevel(app, name, resolved.isParent, handlers, config)
  }

  for (const [name, resolved] of config.sections) {
    if (!resolved.isChild) continue
    const parentName = resolved.config.parent!
    mountChild(app, parentName, name, handlers, config)
  }

  return app
}

function mountTopLevel(
  app: Hono,
  section: string,
  isParent: boolean,
  handlers: CrudHandlers,
  config: ResolvedConfig
): void {
  const base = `/${section}`
  const resolved = config.sections.get(section)!
  const folderConfig = resolved.config.folders

  app.get(base, handlers.list(section, false))
  app.post(base, handlers.create(section, false))

  if (folderConfig?.enabled) {
    const ops = folderConfig.ops

    if (ops.list) {
      app.get(`${base}/_folders`, handlers.listFolders(section, false))
    }
    if (ops.create) {
      app.post(`${base}/_folders`, handlers.createFolder(section, false))
    }
    if (ops.rename) {
      app.patch(`${base}/_folders`, handlers.renameFolder(section, false))
    }
    if (ops.delete) {
      app.delete(`${base}/_folders`, handlers.deleteFolder(section, false))
    }
    if (ops.move) {
      app.post(`${base}/_folders/move`, handlers.moveFolder(section, false))
    }
  }

  if (isParent) {
    app.get(`${base}/:id/children`, async (c) => {
      return c.json({ section, id: c.req.param("id") })
    })
  }

  app.get(`${base}/:id`, handlers.get(section, false))
  app.put(`${base}/:id`, handlers.put(section, false))
  app.patch(`${base}/:id`, handlers.patch(section, false))
  app.delete(`${base}/:id`, handlers.delete(section, false))

  if (folderConfig?.enabled && folderConfig.ops.move) {
    app.post(`${base}/:id/move`, handlers.moveRecord(section, false))
  }
}

function mountChild(
  app: Hono,
  parentSection: string,
  childSection: string,
  handlers: CrudHandlers,
  config: ResolvedConfig
): void {
  const base = `/${parentSection}/:parentId/${childSection}`
  const resolved = config.sections.get(childSection)!
  const folderConfig = resolved.config.folders

  app.get(base, handlers.list(childSection, true))
  app.post(base, handlers.create(childSection, true))

  if (folderConfig?.enabled) {
    const ops = folderConfig.ops

    if (ops.list) {
      app.get(`${base}/_folders`, handlers.listFolders(childSection, true))
    }
    if (ops.create) {
      app.post(`${base}/_folders`, handlers.createFolder(childSection, true))
    }
    if (ops.rename) {
      app.patch(`${base}/_folders`, handlers.renameFolder(childSection, true))
    }
    if (ops.delete) {
      app.delete(`${base}/_folders`, handlers.deleteFolder(childSection, true))
    }
    if (ops.move) {
      app.post(`${base}/_folders/move`, handlers.moveFolder(childSection, true))
    }
  }

  app.get(`${base}/:id`, handlers.get(childSection, true))
  app.put(`${base}/:id`, handlers.put(childSection, true))
  app.patch(`${base}/:id`, handlers.patch(childSection, true))
  app.delete(`${base}/:id`, handlers.delete(childSection, true))

  if (folderConfig?.enabled && folderConfig.ops.move) {
    app.post(`${base}/:id/move`, handlers.moveRecord(childSection, true))
  }
}