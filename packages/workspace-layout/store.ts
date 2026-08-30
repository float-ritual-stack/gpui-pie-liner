import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import {
  applyWorkspaceCommand,
  initialWorkspaceLayout,
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

function loadState(path: string): WorkspaceLayoutState {
  if (!existsSync(path)) return initialWorkspaceLayout()
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as WorkspaceLayoutState
    if (parsed.version !== 1 || !parsed.root || !parsed.panes) throw new Error("unsupported layout shape")
    return parsed
  } catch (error) {
    const backup = `${path}.invalid-${Date.now()}`
    renameSync(path, backup)
    console.error(`[gpui-pie-liner] invalid workspace layout moved to ${backup}: ${String(error)}`)
    return initialWorkspaceLayout()
  }
}

export class WorkspaceLayoutStore {
  private state: WorkspaceLayoutState
  private readonly listeners = new Set<() => void>()

  constructor(private readonly path = workspaceLayoutPath()) {
    this.state = loadState(path)
  }

  getSnapshot = (): WorkspaceLayoutState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispatch(command: WorkspaceLayoutCommand): WorkspaceLayoutState {
    const next = applyWorkspaceCommand(this.state, command)
    if (next === this.state) return this.state
    this.state = next
    this.persist()
    for (const listener of this.listeners) listener()
    return this.state
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp-${process.pid}`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`)
    renameSync(temporary, this.path)
  }
}
