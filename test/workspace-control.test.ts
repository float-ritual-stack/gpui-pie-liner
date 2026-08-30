import { mkdtempSync, rmSync, statSync } from "node:fs"
import { createServer } from "node:net"
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
  test("rejects malformed and prematurely closed replies", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gpui-pie-control-client-"))
    temporaryDirectories.push(directory)
    for (const [name, reply] of [["malformed", "not-json\n"], ["closed", ""]] as const) {
      const path = join(directory, `${name}.sock`)
      const server = createServer((socket) => socket.end(reply, () => socket.destroy()))
      await new Promise<void>((resolve) => server.listen(path, resolve))
      try {
        await expect(sendWorkspaceCommand({ action: "layout.get" }, path)).rejects.toThrow(
          name === "malformed" ? "Invalid workspace control response" : "closed before replying",
        )
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    }
  })

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
      expect(statSync(server.socketPath).mode & 0o777).toBe(0o600)

      const competing = new WorkspaceControlServer(store, server.socketPath)
      await expect(competing.start()).rejects.toThrow("already owned")
    } finally {
      await server.stop()
    }
  })
})
