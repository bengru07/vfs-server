import { createServer } from "node:http"
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

const configPath = process.env.FS_CONFIG ?? "./vfs.config.json"

console.log(`[lamina-fs] loading config from ${configPath}`)

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

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on("connection", (ws) => {
  console.log("[lamina-fs] ws client connected")

  const unsub = watcher.subscribe((event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event))
    }
  })

  ws.on("close", () => {
    console.log("[lamina-fs] ws client disconnected")
    unsub()
  })
})

console.log(`[lamina-fs] sections: ${[...config.sections.keys()].join(", ")}`)
console.log(`[lamina-fs] listening on port ${appConfig.port}`)

serve({ fetch: router.fetch, port: appConfig.port })