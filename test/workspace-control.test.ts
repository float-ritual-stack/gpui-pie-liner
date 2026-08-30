import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  sendWorkspaceCommand,
  WorkspaceControlServer,
  WorkspaceLayoutStore,
} from "../packages/workspace-layout"

const describeUnix = process.platform === "win32" ? describe.skip : describe
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describeUnix("workspace control socket", () => {
  test("applies the same immediate command model used by the UI", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gpui-pie-control-"))
    temporaryDirectories.push(directory)
    const store = new WorkspaceLayoutStore(join(directory, "layout.json"))
    const server = new WorkspaceControlServer(store, join(directory, "control.sock"))
    await server.start()
    try {
      const state = await sendWorkspaceCommand({
        action: "pane.split",
        paneId: "main",
        direction: "down",
        newPaneId: "agent",
        tab: { kind: "empty", title: "Agent work" },
      }, server.socketPath)
      expect(state.panes.agent?.tabs[0]?.title).toBe("Agent work")
      expect(store.getSnapshot()).toEqual(state)
    } finally {
      await server.stop()
    }
  })
})
