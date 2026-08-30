import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { createConnection } from "node:net"
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

interface SocketData {
  buffer: string
}

function socketIsLive(path: string, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timed out probing existing control socket: ${path}`))
    }, timeoutMs)
    const finish = (live: boolean) => {
      clearTimeout(timeout)
      socket.destroy()
      resolve(live)
    }
    socket.once("connect", () => finish(true))
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") finish(false)
      else {
        clearTimeout(timeout)
        reject(error)
      }
    })
  })
}

export class WorkspaceControlServer {
  private server: Bun.UnixSocketListener<SocketData> | null = null
  private starting: Promise<void> | null = null

  constructor(
    private readonly store: WorkspaceLayoutStore,
    readonly socketPath = workspaceControlSocketPath(),
  ) {}

  async start(): Promise<void> {
    if (this.server) return
    if (this.starting) return this.starting
    const attempt = this.startOnce()
    this.starting = attempt
    try {
      await attempt
    } finally {
      if (this.starting === attempt) this.starting = null
    }
  }

  private async startOnce(): Promise<void> {
    const directory = dirname(this.socketPath)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
    if (existsSync(this.socketPath)) {
      if (await socketIsLive(this.socketPath)) {
        throw new Error(`Workspace control socket is already owned by a running app: ${this.socketPath}`)
      }
      rmSync(this.socketPath, { force: true })
    }

    const decoder = new TextDecoder()
    const server = Bun.listen<SocketData>({
      unix: this.socketPath,
      data: { buffer: "" },
      socket: {
        open(socket) {
          socket.data = { buffer: "" }
        },
        data: (socket, data) => {
          socket.data.buffer += decoder.decode(data, { stream: true })
          let newline = socket.data.buffer.indexOf("\n")
          while (newline >= 0) {
            const line = socket.data.buffer.slice(0, newline)
            socket.data.buffer = socket.data.buffer.slice(newline + 1)
            newline = socket.data.buffer.indexOf("\n")
            if (!line.trim()) continue
            let request: ControlRequest | undefined
            try {
              request = JSON.parse(line) as ControlRequest
              if (!request.id || !request.command?.action) throw new Error("Request requires id and command.action")
              const result = this.store.dispatch(request.command)
              socket.write(`${JSON.stringify({ id: request.id, ok: true, result } satisfies ControlResponse)}\n`)
            } catch (error) {
              socket.write(`${JSON.stringify({
                id: request?.id ?? "invalid",
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              } satisfies ControlResponse)}\n`)
            }
          }
        },
      },
    })
    try {
      chmodSync(this.socketPath, 0o600)
      this.server = server
    } catch (error) {
      server.stop(true)
      rmSync(this.socketPath, { force: true })
      throw error
    }
    console.log(`[gpui-pie-liner] control socket ready: ${this.socketPath}`)
  }

  async stop(): Promise<void> {
    if (this.starting) await this.starting.catch(() => undefined)
    const server = this.server
    this.server = null
    if (!server) return
    server.stop(true)
    rmSync(this.socketPath, { force: true })
  }
}

interface WorkspaceRuntime {
  store: WorkspaceLayoutStore
}

const RUNTIME_KEY = Symbol.for("gpui-pie-liner.workspace-runtime")

export function getWorkspaceRuntime(): WorkspaceRuntime {
  const globals = globalThis as typeof globalThis & { [RUNTIME_KEY]?: WorkspaceRuntime }
  if (globals[RUNTIME_KEY]) return globals[RUNTIME_KEY]
  const runtime: WorkspaceRuntime = { store: new WorkspaceLayoutStore() }
  globals[RUNTIME_KEY] = runtime
  return runtime
}
