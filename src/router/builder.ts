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
    mountTopLevel(app, name, resolved.isParent, handlers)
  }

  for (const [name, resolved] of config.sections) {
    if (!resolved.isChild) continue
    const parentName = resolved.config.parent!
    mountChild(app, parentName, name, handlers)
  }

  return app
}

function mountTopLevel(
  app: Hono,
  section: string,
  isParent: boolean,
  handlers: CrudHandlers
): void {
  const base = `/${section}`

  app.get(base, handlers.list(section, false))
  app.post(base, handlers.create(section, false))
  app.get(`${base}/:id`, handlers.get(section, false))
  app.put(`${base}/:id`, handlers.put(section, false))
  app.patch(`${base}/:id`, handlers.patch(section, false))
  app.delete(`${base}/:id`, handlers.delete(section, false))

  if (isParent) {
    app.get(`${base}/:id/children`, async (c) => {
      return c.json({ section, id: c.req.param("id") })
    })
  }
}

function mountChild(
  app: Hono,
  parentSection: string,
  childSection: string,
  handlers: CrudHandlers
): void {
  const base = `/${parentSection}/:parentId/${childSection}`

  app.get(base, handlers.list(childSection, true))
  app.post(base, handlers.create(childSection, true))
  app.get(`${base}/:id`, handlers.get(childSection, true))
  app.put(`${base}/:id`, handlers.put(childSection, true))
  app.patch(`${base}/:id`, handlers.patch(childSection, true))
  app.delete(`${base}/:id`, handlers.delete(childSection, true))
}