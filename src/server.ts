import { serve } from "@hono/node-server"
import { WebSocketServer } from "ws"
import { loadConfig } from "./config/loader.js"
import { PathResolver } from "./store/resolver.js"
import { StoreReader } from "./store/reader.js"
import { StoreWriter } from "./store/writer.js"
import { StoreWatcher } from "./store/watcher.js"
import { SchemaValidator } from "./validation/schema.js"
import { CrudHandlers } from "./router/handlers.js"
import { buildRouter } from "./router/builder.js"
import type { Server } from "node:http"

const configPath = process.env.VFS_CONFIG ?? "./vfs.config.json"

console.log(`[vfs-server] loading config from ${configPath}`)

const config = loadConfig(configPath)
const { app: appConfig } = config

const resolver = new PathResolver(config)
const reader = new StoreReader(resolver, config)
const writer = new StoreWriter(resolver, config, reader)
const watcher = new StoreWatcher(resolver, config)
const validator = new SchemaValidator(config)
const handlers = new CrudHandlers(reader, writer, validator, config)

await writer.ensureDataDir()
watcher.start()

const router = buildRouter(config, handlers)

console.log(`[vfs-server] sections: ${[...config.sections.keys()].join(", ")}`)
console.log(`[vfs-server] listening on port ${appConfig.port}`)

const server = serve({ fetch: router.fetch, port: appConfig.port }) as unknown as Server

const wss = new WebSocketServer({ server })

wss.on("connection", (ws) => {
  console.log("[vfs-server] ws client connected")

  const unsub = watcher.subscribe((event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event))
    }
  })

  ws.on("close", () => {
    console.log("[vfs-server] ws client disconnected")
    unsub()
  })
})