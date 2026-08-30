import { useRef, type ReactNode } from "react"
import { useWindowSize } from "@gpuix/react"
import type {
  LayoutNode,
  WorkspaceLayoutCommand,
  WorkspaceLayoutState,
  WorkspacePane,
  WorkspaceTab,
} from "../../../packages/workspace-layout"
import { C, FONT } from "../theme"

interface WorkspaceLayoutProps {
  state: WorkspaceLayoutState
  dispatch(command: WorkspaceLayoutCommand): unknown
  renderTab(tab: WorkspaceTab, pane: WorkspacePane): ReactNode
}

function PaneView({
  pane,
  dispatch,
  renderTab,
}: {
  pane: WorkspacePane
  dispatch(command: WorkspaceLayoutCommand): unknown
  renderTab(tab: WorkspaceTab, pane: WorkspacePane): ReactNode
}) {
  const active = pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0]
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
        {pane.tabs.map((tab, index) => (
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
              hover: active?.id === tab.id ? undefined : { backgroundColor: C.overlay },
            }}
          >
            <div
              testId={`tab-button-${tab.id}`}
              tabIndex={0}
              onClick={() => dispatch({ action: "tab.activate", paneId: pane.id, tabId: tab.id })}
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
              style={{ height: "100%", minWidth: 0, flexGrow: 1, paddingLeft: 11, display: "flex", alignItems: "center", cursor: "pointer" }}
            >
              <text style={{ minWidth: 0, color: active?.id === tab.id ? C.text : C.tertiary, fontFamily: FONT, fontSize: 12 }}>
                {tab.title}
              </text>
            </div>
            {pane.tabs.length > 1 ? (
              <div
                testId={`close-tab-${tab.id}`}
                onClick={() => dispatch({ action: "tab.close", paneId: pane.id, tabId: tab.id })}
                style={{ width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", hover: { backgroundColor: C.overlay } }}
              >
                <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 11 }}>×</text>
              </div>
            ) : null}
          </div>
        ))}
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

function LayoutBranch({ node, state, dispatch, renderTab }: WorkspaceLayoutProps & { node: LayoutNode }) {
  const windowSize = useWindowSize()
  const drag = useRef<{ start: number; ratio: number } | null>(null)
  if (node.kind === "pane") {
    const pane = state.panes[node.paneId]
    if (!pane) return <div />
    return <PaneView pane={pane} dispatch={dispatch} renderTab={renderTab} />
  }

  const horizontal = node.axis === "horizontal"
  return (
    <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", flexDirection: horizontal ? "row" : "column" }}>
      <div style={{ minWidth: 0, minHeight: 0, flexBasis: 0, flexGrow: node.ratio }}>
        <LayoutBranch node={node.first} state={state} dispatch={dispatch} renderTab={renderTab} />
      </div>
      <div
        testId={`divider-${node.id}`}
        onMouseDown={(event) => {
          drag.current = { start: horizontal ? (event.x ?? 0) : (event.y ?? 0), ratio: node.ratio }
        }}
        onMouseMove={(event) => {
          const active = drag.current
          if (!active) return
          const current = horizontal ? (event.x ?? 0) : (event.y ?? 0)
          const extent = horizontal ? windowSize.width : windowSize.height
          dispatch({ action: "pane.resize", splitId: node.id, ratio: active.ratio + (current - active.start) / Math.max(1, extent) })
        }}
        onMouseUp={() => { drag.current = null }}
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
        <LayoutBranch node={node.second} state={state} dispatch={dispatch} renderTab={renderTab} />
      </div>
    </div>
  )
}

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  return <LayoutBranch {...props} node={props.state.root} />
}
