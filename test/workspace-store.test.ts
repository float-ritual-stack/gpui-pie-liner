import { execFile } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, test } from "vitest"
import {
  dispatchPersistedWorkspaceCommand,
  initialWorkspaceLayout,
  WorkspaceLayoutStore,
} from "../packages/workspace-layout"

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("workspace layout persistence", () => {
  test("rejects persisted roots that reference missing panes", () => {
    const directory = mkdtempSync(join(tmpdir(), "gpui-pie-store-invalid-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "layout.json")
    const invalid = { ...initialWorkspaceLayout(), root: { kind: "pane", paneId: "missing" } }
    writeFileSync(path, JSON.stringify(invalid))
    const store = new WorkspaceLayoutStore(path)
    expect(store.getSnapshot().panes.outline).toBeDefined()
    expect(existsSync(path)).toBe(false)
    expect(readdirSync(directory).some((name) => name.startsWith("layout.json.invalid-"))).toBe(true)
  })

  test("notifies synchronously and coalesces persistence to the latest state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gpui-pie-store-coalesce-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "layout.json")
    const store = new WorkspaceLayoutStore(path)
    let notified = 0
    store.subscribe(() => notified += 1)
    store.dispatch({ action: "tab.create", paneId: "main", tab: { id: "one", kind: "empty", title: "One" } })
    store.dispatch({ action: "tab.create", paneId: "main", tab: { id: "two", kind: "empty", title: "Two" } })
    expect(notified).toBe(2)
    expect(existsSync(path)).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const persisted = JSON.parse(readFileSync(path, "utf8"))
    expect(persisted.panes.main.tabs.map((tab: { id: string }) => tab.id)).toEqual(["detail", "document", "one", "two"])
  })

  test("lets a running store observe an external agent command", () => {
    const directory = mkdtempSync(join(tmpdir(), "gpui-pie-store-observe-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "layout.json")
    const running = new WorkspaceLayoutStore(path)
    dispatchPersistedWorkspaceCommand({
      action: "tab.create",
      paneId: "main",
      tab: { id: "external", kind: "empty", title: "External" },
    }, path)
    running.refreshFromDisk()
    expect(running.getSnapshot().panes.main?.activeTabId).toBe("external")
  })

  test("serializes concurrent offline process updates", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gpui-pie-store-lock-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "layout.json")
    const modulePath = resolve("packages/workspace-layout/index.ts")
    const script = `import { dispatchPersistedWorkspaceCommand as dispatch } from ${JSON.stringify(modulePath)}; dispatch(JSON.parse(process.argv[1]), process.argv[2])`
    const command = (id: string) => JSON.stringify({
      action: "tab.create",
      paneId: "main",
      tab: { id, kind: "empty", title: id },
    })
    await Promise.all([
      execFileAsync(process.execPath, ["-e", script, command("agent-a"), path]),
      execFileAsync(process.execPath, ["-e", script, command("agent-b"), path]),
    ])
    const persisted = JSON.parse(readFileSync(path, "utf8"))
    expect(persisted.panes.main.tabs.map((tab: { id: string }) => tab.id)).toEqual(
      expect.arrayContaining(["agent-a", "agent-b"]),
    )
  })
})
