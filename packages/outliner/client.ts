import { createConnection, type Socket } from "node:net"
import type {
  OutlinerEvent,
  OutlinerEventEnvelope,
  OutlinerRequestInput,
  OutlinerResponse,
} from "./types"

export interface WatchHandlers {
  onConnect?: () => void | Promise<void>
  onDisconnect?: () => void
  onEvent: (event: OutlinerEvent) => void | Promise<void>
  onError?: (error: Error) => void
}

export class OutlinerWatcher {
  private socket: Socket | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private retryDelayMs = 250

  constructor(
    private readonly socketPath: string,
    private readonly clientId: string,
    private readonly handlers: WatchHandlers,
  ) {
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.socket?.destroy()
    this.socket = null
  }

  private connect(): void {
    if (this.stopped) return
    const socket = createConnection(this.socketPath)
    this.socket = socket
    socket.setEncoding("utf8")
    let buffer = ""
    let subscribed = false
    const subscriptionId = crypto.randomUUID()

    socket.once("connect", () => {
      socket.write(`${JSON.stringify({
        id: subscriptionId,
        action: "events.subscribe",
        client: { clientId: this.clientId, role: "tree" },
      })}\n`)
    })
    socket.on("data", (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf("\n")
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
        if (!line.trim()) continue
        try {
          const message = JSON.parse(line) as OutlinerEventEnvelope | OutlinerResponse
          if ("event" in message) {
            void Promise.resolve(this.handlers.onEvent(message.event)).catch((error) =>
              this.handlers.onError?.(error instanceof Error ? error : new Error(String(error))),
            )
          } else if (message.id === subscriptionId) {
            if (!message.ok) throw new Error(message.error ?? "Subscription failed")
            subscribed = true
            this.retryDelayMs = 250
            void this.handlers.onConnect?.()
          }
        } catch (error) {
          this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })
    socket.once("error", (error) => this.handlers.onError?.(error))
    socket.once("close", () => {
      if (this.socket === socket) this.socket = null
      if (subscribed && !this.stopped) this.handlers.onDisconnect?.()
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer) return
    const delay = this.retryDelayMs
    this.retryDelayMs = Math.min(2_000, this.retryDelayMs * 2)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
  }
}

export class OutlinerClient {
  constructor(readonly socketPath: string) {}

  request<T>(input: OutlinerRequestInput, timeoutMs = 3_000): Promise<T> {
    const id = crypto.randomUUID()
    const socket = createConnection(this.socketPath)
    const result = Promise.withResolvers<T>()
    let buffer = ""
    let settled = false
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.end()
      callback()
    }
    const timeout = setTimeout(() => {
      socket.destroy()
      settle(() => result.reject(new Error(`Outliner request timed out after ${timeoutMs}ms`)))
    }, timeoutMs)

    socket.setEncoding("utf8")
    socket.once("connect", () => socket.write(`${JSON.stringify({ ...input, id })}\n`))
    socket.once("error", (error) => settle(() => result.reject(error)))
    socket.on("data", (chunk: string) => {
      buffer += chunk
      const newline = buffer.indexOf("\n")
      if (newline < 0) return
      try {
        const response = JSON.parse(buffer.slice(0, newline)) as OutlinerResponse
        if (!response.ok) settle(() => result.reject(new Error(response.error ?? "Request failed")))
        else settle(() => result.resolve(response.result as T))
      } catch (error) {
        settle(() => result.reject(error))
      }
    })
    return result.promise
  }

  watch(clientId: string, handlers: WatchHandlers): OutlinerWatcher {
    return new OutlinerWatcher(this.socketPath, clientId, handlers)
  }
}
