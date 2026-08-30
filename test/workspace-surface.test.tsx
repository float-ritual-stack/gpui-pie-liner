import { useState } from "react"
import { connectTest } from "@gpuix/react/automation"
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing"
import { describe, expect, test, vi } from "vitest"
import { WorkspaceLayout } from "../apps/desktop/components/workspace-layout"
import { dispatchWorkspaceCommandFromUi } from "../apps/desktop/model/use-workspace-layout"
import {
  applyWorkspaceCommand,
  initialWorkspaceLayout,
  WorkspaceLayoutStore,
  type WorkspaceLayoutCommand,
} from "../packages/workspace-layout"

const describeNative = hasNativeTestRenderer ? describe : describe.skip

function Harness({ commands }: { commands?: WorkspaceLayoutCommand[] } = {}) {
  const [state, setState] = useState(initialWorkspaceLayout)
  const dispatch = (command: WorkspaceLayoutCommand) => {
    commands?.push(command)
    setState((current) => applyWorkspaceCommand(current, command))
  }
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 50, flexShrink: 0 }} />
      <div style={{ flexGrow: 1, minHeight: 0 }}>
        <WorkspaceLayout
          state={state}
          dispatch={dispatch}
          windowOffsetY={50}
          renderTab={(tab) => <text>{tab.title}</text>}
        />
      </div>
    </div>
  )
}

describeNative("workspace surface", () => {
  test("rejects a stale UI event without throwing out of the event loop", () => {
    const store = new WorkspaceLayoutStore(`/tmp/gpui-pie-ui-${crypto.randomUUID()}/layout.json`)
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => dispatchWorkspaceCommandFromUi(store, {
      action: "tab.activate",
      paneId: "main",
      tabId: "already-closed",
    })).not.toThrow()
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Tab not found"))
    error.mockRestore()
  })

  test("drags a tab into another pane header", async () => {
    const root = createTestRoot()
    const commands: WorkspaceLayoutCommand[] = []
    root.render(<Harness commands={commands} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("tab-button-detail").dragTo(app.getByTestId("tab-button-outline"))

    expect(commands).toContainEqual({ action: "tab.move", tabId: "detail", fromPaneId: "main", toPaneId: "outline" })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(commands, JSON.stringify(commands)).toHaveLength(2)
    const tab = root.renderer.findByTestId("tab-detail")!
    const tabList = root.renderer.getElement(tab.parentId!)!
    const outlinePane = root.renderer.getElement(tabList.parentId!)
    expect(outlinePane?.testId).toBe("pane-outline")
  })

  test("shows an explicit drop preview while the pointer is captured", async () => {
    const root = createTestRoot()
    root.render(<Harness />)
    const app = await connectTest(root.renderer)
    const source = app.getByTestId("tab-button-detail")
    const target = app.getByTestId("pane-outline")

    await app.mouse.move(source)
    await app.mouse.down(source)
    await app.mouse.move(target, { pressedButton: 0 })
    await app.getByTestId("workspace-drop-preview").waitFor()
    await app.getByTestId("workspace-drag-ghost").waitFor()
    await app.mouse.up(target)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(root.renderer.findByTestId("workspace-drop-preview")).toBeUndefined()
    expect(root.renderer.findByTestId("workspace-drag-ghost")).toBeUndefined()
  })

  test("drops a tab onto a pane quadrant to create a new split", async () => {
    const root = createTestRoot()
    const commands: WorkspaceLayoutCommand[] = []
    root.render(<Harness commands={commands} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("tab-button-detail").dragTo(app.getByTestId("pane-outline"))
    await new Promise((resolve) => setTimeout(resolve, 20))

    const split = commands.find((command) => command.action === "pane.split")
    expect(split).toBeDefined()
    if (!split || split.action !== "pane.split" || !split.newPaneId) throw new Error("Expected pane split")
    expect(commands).toContainEqual(expect.objectContaining({
      action: "tab.move",
      tabId: "detail",
      toPaneId: split.newPaneId,
    }))
    expect(root.renderer.findByTestId(`pane-${split.newPaneId}`)).toBeDefined()
  })

  test("treats a lone tab as a handle for its whole pane", async () => {
    const root = createTestRoot()
    const commands: WorkspaceLayoutCommand[] = []
    root.render(<Harness commands={commands} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("tab-button-outline").dragTo(app.getByTestId("pane-main"))

    expect(commands.some((command) => command.action === "pane.move" && command.paneId === "outline")).toBe(true)
    expect(commands.some((command) => command.action === "tab.move" && command.tabId === "outline")).toBe(false)
  })

  test("deleting a pane's last tab removes that pane", async () => {
    const root = createTestRoot()
    const commands: WorkspaceLayoutCommand[] = []
    root.render(<Harness commands={commands} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("close-tab-outline").click()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(commands.map((command) => command.action)).toEqual(["tab.close", "pane.close"])
    expect(root.renderer.findByTestId("pane-outline")).toBeUndefined()
  })

  test("closing a tab does not reactivate the removed tab", async () => {
    const root = createTestRoot()
    root.render(<Harness />)
    const app = await connectTest(root.renderer)

    expect(root.renderer.findByTestId("tab-detail")?.events.has("click")).toBe(false)
    expect(root.renderer.findByTestId("tab-button-detail")?.events.has("click")).toBe(false)
    expect(root.renderer.findByTestId("tab-button-detail")?.events.has("mouseDown")).toBe(true)
    await app.getByTestId("close-tab-detail").click()

    expect(root.renderer.findByTestId("tab-detail")).toBeUndefined()
    expect(root.renderer.findByTestId("tab-document")).toBeDefined()
  })
})
