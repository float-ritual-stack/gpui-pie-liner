import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import {
  applyWorkspaceCommand,
  initialWorkspaceLayout,
  type LayoutNode,
  type WorkspaceLayoutCommand,
  type WorkspaceLayoutState,
} from "./model"

export function workspaceStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.GPUI_PIE_STATE_DIR ?? join(homedir(), ".local", "state", "gpui-pie-liner")
}

export function workspaceLayoutPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(workspaceStateDir(env), "workspace-layout.json")
}

export function workspaceControlSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GPUI_PIE_CONTROL_SOCKET ?? join(workspaceStateDir(env), "control.sock")
}

function referencesKnownPanes(node: LayoutNode, panes: WorkspaceLayoutState["panes"]): boolean {
  if (node.kind === "pane") return Boolean(panes[node.paneId])
  return referencesKnownPanes(node.first, panes) && referencesKnownPanes(node.second, panes)
}

function loadState(path: string): WorkspaceLayoutState {
  if (!existsSync(path)) return initialWorkspaceLayout()
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as WorkspaceLayoutState
    if (parsed.version !== 1 || !parsed.root || !parsed.panes || !referencesKnownPanes(parsed.root, parsed.panes)) {
      throw new Error("unsupported layout shape")
    }
    return parsed
  } catch (error) {
    const backup = `${path}.invalid-${Date.now()}`
    renameSync(path, backup)
    console.error(`[gpui-pie-liner] invalid workspace layout moved to ${backup}: ${String(error)}`)
    return initialWorkspaceLayout()
  }
}

function persistState(path: string, state: WorkspaceLayoutState): void {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}

function wait(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function withLayoutLock<T>(path: string, callback: () => T, timeoutMs = 3_000): T {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const lockPath = `${path}.lock`
  const started = Date.now()
  while (true) {
    try {
      mkdirSync(lockPath, { mode: 0o700 })
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if (Date.now() - started >= timeoutMs) throw new Error(`Timed out acquiring workspace layout lock: ${lockPath}`)
      wait(10)
    }
  }
  try {
    return callback()
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}

export class WorkspaceLayoutStore {
  private state: WorkspaceLayoutState
  private readonly listeners = new Set<() => void>()
  private pendingCommands: WorkspaceLayoutCommand[] = []
  private persistenceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly path = workspaceLayoutPath()) {
    this.state = loadState(path)
  }

  getSnapshot = (): WorkspaceLayoutState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispatch(command: WorkspaceLayoutCommand, persist = true): WorkspaceLayoutState {
    const next = applyWorkspaceCommand(this.state, command)
    if (next === this.state) return this.state
    this.state = next
    if (persist) this.pendingCommands.push(command)
    this.notify()
    if (persist) this.schedulePersistence()
    return this.state
  }

  refreshFromDisk(): WorkspaceLayoutState {
    if (this.pendingCommands.length > 0 || !existsSync(this.path)) return this.state
    const next = loadState(this.path)
    if (JSON.stringify(next) !== JSON.stringify(this.state)) {
      this.state = next
      this.notify()
    }
    return this.state
  }

  flushSync(): void {
    if (this.persistenceTimer) clearTimeout(this.persistenceTimer)
    this.persistenceTimer = null
    const commands = this.pendingCommands.splice(0)
    this.state = withLayoutLock(this.path, () => {
      let latest = loadState(this.path)
      for (const command of commands) latest = applyWorkspaceCommand(latest, command)
      persistState(this.path, latest)
      return latest
    })
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private schedulePersistence(): void {
    if (this.persistenceTimer) return
    this.persistenceTimer = setTimeout(() => {
      this.persistenceTimer = null
      try {
        const previous = this.state
        this.flushSync()
        if (this.state !== previous) this.notify()
      } catch (error) {
        console.error(`[gpui-pie-liner] failed to persist workspace layout: ${String(error)}`)
      }
    }, 0)
  }
}

export function dispatchPersistedWorkspaceCommand(
  command: WorkspaceLayoutCommand,
  path = workspaceLayoutPath(),
  timeoutMs = 3_000,
): WorkspaceLayoutState {
  return withLayoutLock(path, () => {
    const state = applyWorkspaceCommand(loadState(path), command)
    persistState(path, state)
    return state
  }, timeoutMs)
}
