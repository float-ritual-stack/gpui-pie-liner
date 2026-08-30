import type { LayoutNode, SplitDirection, WorkspaceLayoutState } from "../../../packages/workspace-layout"

export interface WorkspaceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PaneRect extends WorkspaceRect {
  paneId: string
}

export type WorkspaceDropTarget =
  | { kind: "merge"; paneId: string; preview: WorkspaceRect }
  | { kind: "split"; paneId: string; direction: SplitDirection; preview: WorkspaceRect }

const DIVIDER_SIZE = 5
export const PANE_HEADER_HEIGHT = 38

export function paneRects(node: LayoutNode, rect: WorkspaceRect): PaneRect[] {
  if (node.kind === "pane") return [{ ...rect, paneId: node.paneId }]
  if (node.axis === "horizontal") {
    const usable = Math.max(0, rect.width - DIVIDER_SIZE)
    const firstWidth = usable * node.ratio
    return [
      ...paneRects(node.first, { ...rect, width: firstWidth }),
      ...paneRects(node.second, {
        x: rect.x + firstWidth + DIVIDER_SIZE,
        y: rect.y,
        width: usable - firstWidth,
        height: rect.height,
      }),
    ]
  }
  const usable = Math.max(0, rect.height - DIVIDER_SIZE)
  const firstHeight = usable * node.ratio
  return [
    ...paneRects(node.first, { ...rect, height: firstHeight }),
    ...paneRects(node.second, {
      x: rect.x,
      y: rect.y + firstHeight + DIVIDER_SIZE,
      width: rect.width,
      height: usable - firstHeight,
    }),
  ]
}

export function workspaceDropTarget(
  state: WorkspaceLayoutState,
  workspace: WorkspaceRect,
  x: number,
  y: number,
): WorkspaceDropTarget | null {
  const pane = paneRects(state.root, workspace).find((candidate) =>
    x >= candidate.x && x <= candidate.x + candidate.width
      && y >= candidate.y && y <= candidate.y + candidate.height,
  )
  if (!pane) return null
  if (y <= pane.y + PANE_HEADER_HEIGHT) {
    return {
      kind: "merge",
      paneId: pane.paneId,
      preview: { x: pane.x, y: pane.y, width: pane.width, height: PANE_HEADER_HEIGHT },
    }
  }

  const bodyY = pane.y + PANE_HEADER_HEIGHT
  const bodyHeight = pane.height - PANE_HEADER_HEIGHT
  const normalizedX = (x - (pane.x + pane.width / 2)) / Math.max(1, pane.width / 2)
  const normalizedY = (y - (bodyY + bodyHeight / 2)) / Math.max(1, bodyHeight / 2)
  const horizontal = Math.abs(normalizedX) >= Math.abs(normalizedY)
  const direction: SplitDirection = horizontal
    ? normalizedX < 0 ? "left" : "right"
    : normalizedY < 0 ? "up" : "down"
  const preview = direction === "left"
    ? { x: pane.x, y: bodyY, width: pane.width / 2, height: bodyHeight }
    : direction === "right"
      ? { x: pane.x + pane.width / 2, y: bodyY, width: pane.width / 2, height: bodyHeight }
      : direction === "up"
        ? { x: pane.x, y: bodyY, width: pane.width, height: bodyHeight / 2 }
        : { x: pane.x, y: bodyY + bodyHeight / 2, width: pane.width, height: bodyHeight / 2 }
  return { kind: "split", paneId: pane.paneId, direction, preview }
}
