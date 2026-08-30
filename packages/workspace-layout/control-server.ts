import { existsSync, mkdirSync, rmSync } from "node:fs"
import { createServer, type Server, type Socket } from "node:net"
import { dirname } from "node:path"
import type { WorkspaceLayoutCommand } from "./model"
import { WorkspaceLayoutStore, workspaceControlSocketPath } from "./store"

interface ControlRequest {
  id: string
  command: WorkspaceLayoutCommand
}

interface ControlResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

function write(socket: Socket, response: ControlResponse): void {
  socket.write(`${JSON.stringify(response)}\n`)
}

export class WorkspaceControlServer {
  private server: Server | null = null

  constructor(
    private readonly store: WorkspaceLayoutStore,
    readonly socketPath = workspaceControlSocketPath(),
  ) {}

  async start(): Promise<void> {
    if (this.server) return
    mkdirSync(dirname(this.socketPath), { recursive: true })
    if (existsSync(this.socketPath)) rmSync(this.socketPath, { force: true })
    const server = createServer((socket) => this.handleSocket(socket))
    this.server = server
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(this.socketPath, () => {
        server.off("error", reject)
        resolve()
      })
    })
    console.log(`[gpui-pie-liner] control socket ready: ${this.socketPath}`)
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(this.socketPath, { force: true })
  }

  private handleSocket(socket: Socket): void {
    socket.setEncoding("utf8")
    let buffer = ""
    socket.on("data", (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf("\n")
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
        if (!line.trim()) continue
        let request: ControlRequest | undefined
        try {
          request = JSON.parse(line) as ControlRequest
          if (!request.id || !request.command?.action) throw new Error("Request requires id and command.action")
          const result = this.store.dispatch(request.command)
          write(socket, { id: request.id, ok: true, result })
        } catch (error) {
          write(socket, {
            id: request?.id ?? "invalid",
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })
  }
}

interface WorkspaceRuntime {
  store: WorkspaceLayoutStore
  server: WorkspaceControlServer
  starting: Promise<void>
}

const RUNTIME_KEY = Symbol.for("gpui-pie-liner.workspace-runtime")

export function getWorkspaceRuntime(): WorkspaceRuntime {
  const globals = globalThis as typeof globalThis & { [RUNTIME_KEY]?: WorkspaceRuntime }
  if (globals[RUNTIME_KEY]) return globals[RUNTIME_KEY]
  const store = new WorkspaceLayoutStore()
  const server = new WorkspaceControlServer(store)
  const runtime = { store, server, starting: server.start() }
  globals[RUNTIME_KEY] = runtime
  return runtime
}
