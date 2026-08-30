import { describe, expect, test } from "vitest"
import {
  applyWorkspaceCommand,
  initialWorkspaceLayout,
  type LayoutNode,
} from "../packages/workspace-layout/model"

function paneIds(node: LayoutNode): string[] {
  return node.kind === "pane" ? [node.paneId] : [...paneIds(node.first), ...paneIds(node.second)]
}

describe("workspace layout commands", () => {
  test("creates, activates, moves, reorders, and closes tabs", () => {
    let state = initialWorkspaceLayout()
    state = applyWorkspaceCommand(state, {
      action: "tab.create",
      paneId: "main",
      tab: { id: "search", kind: "empty", title: "Search" },
    })
    expect(state.panes.main?.activeTabId).toBe("search")

    state = applyWorkspaceCommand(state, {
      action: "tab.move",
      tabId: "search",
      fromPaneId: "main",
      toPaneId: "outline",
      index: 0,
    })
    expect(state.panes.outline?.tabs.map((tab) => tab.id)).toEqual(["search", "outline"])
    expect(state.panes.outline?.activeTabId).toBe("search")

    state = applyWorkspaceCommand(state, { action: "tab.close", paneId: "outline", tabId: "search" })
    expect(state.panes.outline?.activeTabId).toBe("outline")
  })

  test("splits, resizes, moves, and closes panes", () => {
    let state = initialWorkspaceLayout()
    state = applyWorkspaceCommand(state, {
      action: "pane.split",
      paneId: "main",
      direction: "down",
      newPaneId: "notes",
      tab: { kind: "tmd-document", title: "Notes", target: "notes.tmd" },
    })
    expect(paneIds(state.root)).toEqual(["outline", "main", "notes"])
    const nested = state.root.kind === "split" ? state.root.second : null
    expect(nested).toMatchObject({ kind: "split", axis: "vertical" })
    if (!nested || nested.kind !== "split") throw new Error("Expected nested split")

    state = applyWorkspaceCommand(state, { action: "pane.resize", splitId: nested.id, ratio: 0.7 })
    expect(state.root.kind === "split" && state.root.second.kind === "split"
      ? state.root.second.ratio
      : null).toBe(0.7)

    state = applyWorkspaceCommand(state, {
      action: "pane.move",
      paneId: "notes",
      targetPaneId: "outline",
      direction: "right",
    })
    expect(paneIds(state.root)).toEqual(["outline", "notes", "main"])

    state = applyWorkspaceCommand(state, {
      action: "pane.close",
      paneId: "notes",
      moveTabsToPaneId: "main",
    })
    expect(paneIds(state.root)).toEqual(["outline", "main"])
    expect(state.panes.main?.tabs.some((tab) => tab.title === "Notes")).toBe(true)
  })

  test("clamps resize ratios and rejects approval-theater-free commands only when invalid", () => {
    const state = applyWorkspaceCommand(initialWorkspaceLayout(), {
      action: "pane.resize",
      splitId: "split-root",
      ratio: 42,
    })
    expect(state.root.kind === "split" ? state.root.ratio : null).toBe(0.9)
    expect(() => applyWorkspaceCommand(state, {
      action: "tab.activate",
      paneId: "main",
      tabId: "missing",
    })).toThrow("Tab not found")
  })
})
