import { createHash } from "node:crypto"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export interface OutlinerTarget {
  socketPath: string
  workspaceRoot?: string
  source: "socket-env" | "workspace" | "discovered"
}

function stateBase(env: NodeJS.ProcessEnv): string {
  return env.OUTLINER_STATE_DIR ?? join(homedir(), ".local", "state", "pi-herdr-outliner")
}

function socketForWorkspace(workspaceRoot: string, env: NodeJS.ProcessEnv): string {
  const resolvedRoot = resolve(workspaceRoot)
  const key = createHash("sha256").update(resolvedRoot).digest("hex").slice(0, 12)
  return join(stateBase(env), key, "outliner.sock")
}

export function resolveOutlinerTarget(env: NodeJS.ProcessEnv = process.env): OutlinerTarget {
  if (env.OUTLINER_SOCKET) {
    return { socketPath: resolve(env.OUTLINER_SOCKET), source: "socket-env" }
  }
  if (env.OUTLINER_WORKSPACE_ROOT) {
    const workspaceRoot = resolve(env.OUTLINER_WORKSPACE_ROOT)
    return {
      socketPath: socketForWorkspace(workspaceRoot, env),
      workspaceRoot,
      source: "workspace",
    }
  }

  const base = stateBase(env)
  const sockets = existsSync(base)
    ? readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(base, entry.name, "outliner.sock"))
        .filter(existsSync)
    : []
  if (sockets.length === 1) return { socketPath: sockets[0]!, source: "discovered" }
  if (sockets.length === 0) {
    throw new Error(
      "No outliner service socket found. Set OUTLINER_SOCKET or OUTLINER_WORKSPACE_ROOT.",
    )
  }
  throw new Error(
    `Found ${sockets.length} outliner sockets. Set OUTLINER_SOCKET or OUTLINER_WORKSPACE_ROOT explicitly.`,
  )
}
