import { describe, expect, test } from "vitest"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { resolveOutlinerTarget } from "../packages/outliner"

describe("outliner service target", () => {
  test("prefers an explicit socket", () => {
    expect(resolveOutlinerTarget({ OUTLINER_SOCKET: "/tmp/pie.sock" })).toEqual({
      socketPath: resolve("/tmp/pie.sock"),
      source: "socket-env",
    })
  })

  test("derives the existing service's workspace-scoped socket", () => {
    const workspaceRoot = resolve("/tmp/pie-workspace")
    const key = createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 12)
    expect(resolveOutlinerTarget({
      OUTLINER_WORKSPACE_ROOT: workspaceRoot,
      OUTLINER_STATE_DIR: "/tmp/pie-state",
    })).toEqual({
      socketPath: join("/tmp/pie-state", key, "outliner.sock"),
      workspaceRoot,
      source: "workspace",
    })
  })
})
