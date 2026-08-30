import { describe, expect, test } from "vitest"
import { initialWorkspaceLayout } from "../packages/workspace-layout"
import {
  paneRects,
  workspaceDropTarget,
  type WorkspaceRect,
} from "../apps/desktop/model/workspace-drag"

const workspace: WorkspaceRect = { x: 0, y: 50, width: 1000, height: 650 }

describe("fluid workspace drop geometry", () => {
  test("derives pane rectangles from the serialized split tree", () => {
    const panes = paneRects(initialWorkspaceLayout().root, workspace)
    expect(panes).toHaveLength(2)
    expect(panes[0]).toMatchObject({ paneId: "outline", x: 0, y: 50, height: 650 })
    expect(panes[1]?.x).toBeGreaterThan(panes[0]!.width)
  })

  test("merges in headers and uses conical body sections for splits", () => {
    const state = initialWorkspaceLayout()
    const main = paneRects(state.root, workspace).find((pane) => pane.paneId === "main")!
    expect(workspaceDropTarget(state, workspace, main.x + 20, main.y + 10)).toMatchObject({
      kind: "merge",
      paneId: "main",
    })
    expect(workspaceDropTarget(state, workspace, main.x + 2, main.y + main.height / 2)).toMatchObject({
      kind: "split",
      direction: "left",
    })
    expect(workspaceDropTarget(state, workspace, main.x + main.width / 2, main.y + main.height - 2)).toMatchObject({
      kind: "split",
      direction: "down",
    })
  })
})
