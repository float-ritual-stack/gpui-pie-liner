import { useRef, useState, type ReactNode } from "react"
import { useWindowSize } from "@gpuix/react"
import type {
  LayoutNode,
  WorkspaceLayoutCommand,
  WorkspaceLayoutState,
  WorkspacePane,
  WorkspaceTab,
} from "../../../packages/workspace-layout"
import {
  workspaceDropTarget,
  type WorkspaceDropTarget,
  type WorkspaceRect,
} from "../model/workspace-drag"
import { C, FONT } from "../theme"

interface WorkspaceLayoutProps {
  state: WorkspaceLayoutState
  dispatch(command: WorkspaceLayoutCommand): unknown
  renderTab(tab: WorkspaceTab, pane: WorkspacePane): ReactNode
  windowOffsetY: number
}

interface TabDrag {
  tab: WorkspaceTab
  sourcePaneId: string
  sourcePaneIsSingleTab: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
  target: WorkspaceDropTarget | null
}

interface PaneViewProps {
  pane: WorkspacePane
  paneCount: number
  drag: TabDrag | null
  dispatch(command: WorkspaceLayoutCommand): unknown
  renderTab(tab: WorkspaceTab, pane: WorkspacePane): ReactNode
  beginDrag(pane: WorkspacePane, tab: WorkspaceTab, x: number, y: number): void
  moveDrag(x: number, y: number): void
  endDrag(): void
}

function PaneView({
  pane,
  paneCount,
  drag,
  dispatch,
  renderTab,
  beginDrag,
  moveDrag,
  endDrag,
}: PaneViewProps) {
  const active = pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0]
  const closeTab = (tab: WorkspaceTab) => {
    dispatch({ action: "tab.close", paneId: pane.id, tabId: tab.id })
    if (pane.tabs.length === 1 && paneCount > 1) {
      dispatch({ action: "pane.close", paneId: pane.id })
    }
  }
  return (
    <div
      testId={`pane-${pane.id}`}
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", backgroundColor: C.canvas }}
    >
      <div
        style={{
          height: 38,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "end",
          paddingLeft: 6,
          paddingRight: 6,
          gap: 3,
          borderBottomWidth: 1,
          borderColor: C.border,
          backgroundColor: C.sidebar,
        }}
      >
        {pane.tabs.map((tab, index) => {
          const dragging = drag?.active && drag.tab.id === tab.id
          return (
            <div
              key={tab.id}
              testId={`tab-${tab.id}`}
              style={{
                height: 34,
                minWidth: 0,
                maxWidth: 220,
                paddingRight: 7,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                backgroundColor: active?.id === tab.id ? C.canvas : C.sidebar,
                borderBottomWidth: active?.id === tab.id ? 2 : 0,
                borderColor: C.accent,
                opacity: dragging ? 0.45 : 1,
                hover: active?.id === tab.id ? undefined : { backgroundColor: C.overlay },
              }}
            >
              <div
                testId={`tab-button-${tab.id}`}
                tabIndex={0}
                onMouseDown={(event) => {
                  dispatch({ action: "tab.activate", paneId: pane.id, tabId: tab.id })
                  beginDrag(pane, tab, event.x ?? 0, event.y ?? 0)
                }}
                onMouseMove={(event) => moveDrag(event.x ?? 0, event.y ?? 0)}
                onMouseUp={endDrag}
                onKeyDown={(event) => {
                  if (event.key === "enter" || event.key === "space") {
                    dispatch({ action: "tab.activate", paneId: pane.id, tabId: tab.id })
                    return
                  }
                  if (event.key !== "left" && event.key !== "right") return
                  const offset = event.key === "left" ? -1 : 1
                  const nextIndex = Math.max(0, Math.min(pane.tabs.length - 1, index + offset))
                  if (event.modifiers?.shift) {
                    dispatch({ action: "tab.move", tabId: tab.id, fromPaneId: pane.id, toPaneId: pane.id, index: nextIndex })
                  } else {
                    const next = pane.tabs[nextIndex]
                    if (next) dispatch({ action: "tab.activate", paneId: pane.id, tabId: next.id })
                  }
                }}
                style={{ height: "100%", minWidth: 0, flexGrow: 1, paddingLeft: 11, display: "flex", alignItems: "center", cursor: dragging ? "grabbing" : "grab" }}
              >
                <text style={{ minWidth: 0, color: active?.id === tab.id ? C.text : C.tertiary, fontFamily: FONT, fontSize: 12 }}>
                  {tab.title}
                </text>
              </div>
              {pane.tabs.length > 1 || paneCount > 1 ? (
                <div
                  testId={`close-tab-${tab.id}`}
                  onClick={() => closeTab(tab)}
                  style={{ width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", hover: { backgroundColor: C.overlay } }}
                >
                  <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 11 }}>×</text>
                </div>
              ) : null}
            </div>
          )
        })}
        <div
          testId={`new-tab-${pane.id}`}
          onClick={() => dispatch({
            action: "tab.create",
            paneId: pane.id,
            tab: { kind: "empty", title: "Untitled" },
          })}
          style={{ width: 28, height: 28, marginBottom: 3, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", hover: { backgroundColor: C.overlay } }}
        >
          <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 14 }}>+</text>
        </div>
        <div style={{ flexGrow: 1 }} />
        <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 9, marginBottom: 10 }}>{pane.id}</text>
      </div>
      <div style={{ flexGrow: 1, minWidth: 0, minHeight: 0 }}>
        {active ? renderTab(active, pane) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 12 }}>Empty pane</text>
          </div>
        )}
      </div>
    </div>
  )
}

function LayoutBranch({
  node,
  state,
  dispatch,
  renderTab,
  windowOffsetY,
  drag,
  beginDrag,
  moveDrag,
  endDrag,
}: WorkspaceLayoutProps & {
  node: LayoutNode
  drag: TabDrag | null
  beginDrag(pane: WorkspacePane, tab: WorkspaceTab, x: number, y: number): void
  moveDrag(x: number, y: number): void
  endDrag(): void
}) {
  const windowSize = useWindowSize()
  const dividerDrag = useRef<{ start: number; ratio: number } | null>(null)
  if (node.kind === "pane") {
    const pane = state.panes[node.paneId]
    if (!pane) return <div />
    return (
      <PaneView
        pane={pane}
        paneCount={Object.keys(state.panes).length}
        drag={drag}
        dispatch={dispatch}
        renderTab={renderTab}
        beginDrag={beginDrag}
        moveDrag={moveDrag}
        endDrag={endDrag}
      />
    )
  }

  const horizontal = node.axis === "horizontal"
  const branchProps = { state, dispatch, renderTab, windowOffsetY, drag, beginDrag, moveDrag, endDrag }
  return (
    <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", flexDirection: horizontal ? "row" : "column" }}>
      <div style={{ minWidth: 0, minHeight: 0, flexBasis: 0, flexGrow: node.ratio }}>
        <LayoutBranch {...branchProps} node={node.first} />
      </div>
      <div
        testId={`divider-${node.id}`}
        onMouseDown={(event) => {
          dividerDrag.current = { start: horizontal ? (event.x ?? 0) : (event.y ?? 0), ratio: node.ratio }
        }}
        onMouseMove={(event) => {
          const currentDrag = dividerDrag.current
          if (!currentDrag) return
          const current = horizontal ? (event.x ?? 0) : (event.y ?? 0)
          const extent = horizontal ? windowSize.width : windowSize.height
          dispatch({ action: "pane.resize", splitId: node.id, ratio: currentDrag.ratio + (current - currentDrag.start) / Math.max(1, extent) })
        }}
        onMouseUp={() => { dividerDrag.current = null }}
        style={{
          width: horizontal ? 5 : "100%",
          height: horizontal ? "100%" : 5,
          flexShrink: 0,
          cursor: horizontal ? "col-resize" : "row-resize",
          backgroundColor: C.border,
          hover: { backgroundColor: C.accent },
          active: { backgroundColor: C.accent },
        }}
      />
      <div style={{ minWidth: 0, minHeight: 0, flexBasis: 0, flexGrow: 1 - node.ratio }}>
        <LayoutBranch {...branchProps} node={node.second} />
      </div>
    </div>
  )
}

function applyDrop(
  state: WorkspaceLayoutState,
  drag: TabDrag,
  dispatch: (command: WorkspaceLayoutCommand) => unknown,
): void {
  const target = drag.target
  if (!target) return
  const source = state.panes[drag.sourcePaneId]
  if (!source) return

  if (target.kind === "merge") {
    if (target.paneId === source.id) return
    if (drag.sourcePaneIsSingleTab) {
      for (const tab of source.tabs) {
        dispatch({ action: "tab.move", tabId: tab.id, fromPaneId: source.id, toPaneId: target.paneId })
      }
      dispatch({ action: "pane.close", paneId: source.id })
    } else {
      dispatch({ action: "tab.move", tabId: drag.tab.id, fromPaneId: source.id, toPaneId: target.paneId })
    }
    return
  }

  if (drag.sourcePaneIsSingleTab) {
    if (target.paneId !== source.id) {
      dispatch({ action: "pane.move", paneId: source.id, targetPaneId: target.paneId, direction: target.direction })
    }
    return
  }

  const newPaneId = `pane-${crypto.randomUUID().slice(0, 8)}`
  const temporaryTabId = `${newPaneId}-drop-target`
  dispatch({
    action: "pane.split",
    paneId: target.paneId,
    direction: target.direction,
    newPaneId,
    tab: { id: temporaryTabId, kind: "empty", title: "Drop target" },
  })
  dispatch({ action: "tab.move", tabId: drag.tab.id, fromPaneId: source.id, toPaneId: newPaneId })
  dispatch({ action: "tab.close", paneId: newPaneId, tabId: temporaryTabId })
}

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const windowSize = useWindowSize()
  const [drag, setDrag] = useState<TabDrag | null>(null)
  const dragRef = useRef<TabDrag | null>(null)
  const workspace: WorkspaceRect = {
    x: 0,
    y: props.windowOffsetY,
    width: windowSize.width,
    height: Math.max(0, windowSize.height - props.windowOffsetY),
  }
  const updateDrag = (next: TabDrag | null) => {
    dragRef.current = next
    setDrag(next)
  }
  const beginDrag = (pane: WorkspacePane, tab: WorkspaceTab, x: number, y: number) => {
    updateDrag({
      tab,
      sourcePaneId: pane.id,
      sourcePaneIsSingleTab: pane.tabs.length === 1,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      active: false,
      target: null,
    })
  }
  const moveDrag = (x: number, y: number) => {
    const current = dragRef.current
    if (!current) return
    const radius = Math.hypot(x - current.startX, y - current.startY)
    const active = current.active || radius >= (current.sourcePaneIsSingleTab ? 50 : 8)
    updateDrag({
      ...current,
      currentX: x,
      currentY: y,
      active,
      target: active ? workspaceDropTarget(props.state, workspace, x, y) : null,
    })
  }
  const endDrag = () => {
    const current = dragRef.current
    updateDrag(null)
    if (current?.active) applyDrop(props.state, current, props.dispatch)
  }
  const preview = drag?.active ? drag.target?.preview : null
  return (
    <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, position: "relative" }}>
      <LayoutBranch
        {...props}
        node={props.state.root}
        drag={drag}
        beginDrag={beginDrag}
        moveDrag={moveDrag}
        endDrag={endDrag}
      />
      {drag?.active ? (
        <div
          testId="workspace-drag-ghost"
          style={{
            position: "absolute",
            left: drag.currentX + 12,
            top: drag.currentY - workspace.y + 12,
            maxWidth: 220,
            padding: 8,
            paddingLeft: 11,
            paddingRight: 11,
            borderWidth: 1,
            borderColor: C.accent,
            borderRadius: 7,
            backgroundColor: C.raised,
            pointerEvents: "none",
          }}
        >
          <text style={{ color: C.text, fontFamily: FONT, fontSize: 12 }}>
            {drag.sourcePaneIsSingleTab ? `Pane · ${drag.tab.title}` : drag.tab.title}
          </text>
        </div>
      ) : null}
      {preview ? (
        <div
          testId="workspace-drop-preview"
          style={{
            position: "absolute",
            left: preview.x + 4,
            top: preview.y - workspace.y + 4,
            width: Math.max(0, preview.width - 8),
            height: Math.max(0, preview.height - 8),
            borderWidth: 2,
            borderColor: C.accent,
            borderRadius: 9,
            backgroundColor: "#E2795B33",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  )
}
