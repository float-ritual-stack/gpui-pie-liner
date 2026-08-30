import { createConnection } from "node:net"
import type { WorkspaceLayoutCommand, WorkspaceLayoutState } from "./model"
import { workspaceControlSocketPath } from "./store"

interface ControlResponse {
  id: string
  ok: boolean
  result?: WorkspaceLayoutState
  error?: string
}

export function sendWorkspaceCommand(
  command: WorkspaceLayoutCommand,
  socketPath = workspaceControlSocketPath(),
  timeoutMs = 3_000,
): Promise<WorkspaceLayoutState> {
  const id = crypto.randomUUID()
  const socket = createConnection(socketPath)
  const result = Promise.withResolvers<WorkspaceLayoutState>()
  let buffer = ""
  const timeout = setTimeout(() => {
    socket.destroy()
    result.reject(new Error(`Workspace command timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  socket.setEncoding("utf8")
  socket.once("connect", () => socket.write(`${JSON.stringify({ id, command })}\n`))
  socket.once("error", (error) => {
    clearTimeout(timeout)
    result.reject(error)
  })
  socket.once("close", () => {
    clearTimeout(timeout)
    result.reject(new Error("Workspace control socket closed before replying"))
  })
  socket.on("data", (chunk: string) => {
    buffer += chunk
    const newline = buffer.indexOf("\n")
    if (newline < 0) return
    clearTimeout(timeout)
    socket.end()
    try {
      const response = JSON.parse(buffer.slice(0, newline)) as ControlResponse
      if (!response.ok || !response.result) result.reject(new Error(response.error ?? "Workspace command failed"))
      else result.resolve(response.result)
    } catch (error) {
      result.reject(new Error(`Invalid workspace control response: ${error instanceof Error ? error.message : String(error)}`))
    }
  })
  return result.promise
}
