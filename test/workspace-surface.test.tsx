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

function Harness() {
  const [state, setState] = useState(initialWorkspaceLayout)
  const dispatch = (command: WorkspaceLayoutCommand) => {
    setState((current) => applyWorkspaceCommand(current, command))
  }
  return (
    <WorkspaceLayout
      state={state}
      dispatch={dispatch}
      renderTab={(tab) => <text>{tab.title}</text>}
    />
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

  test("closing a tab does not reactivate the removed tab", async () => {
    const root = createTestRoot()
    root.render(<Harness />)
    const app = await connectTest(root.renderer)

    expect(root.renderer.findByTestId("tab-detail")?.events.has("click")).toBe(false)
    expect(root.renderer.findByTestId("tab-button-detail")?.events.has("click")).toBe(true)
    await app.getByTestId("close-tab-detail").click()

    expect(root.renderer.findByTestId("tab-detail")).toBeUndefined()
    expect(root.renderer.findByTestId("tab-document")).toBeDefined()
  })
})
