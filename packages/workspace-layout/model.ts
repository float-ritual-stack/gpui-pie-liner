export type SplitAxis = "horizontal" | "vertical"
export type SplitDirection = "left" | "right" | "up" | "down"
export type WorkspaceTabKind = "outline" | "block-detail" | "tmd-document" | "empty"

export interface WorkspaceTab {
  id: string
  kind: WorkspaceTabKind
  title: string
  target?: string
}

export interface WorkspacePane {
  id: string
  tabs: WorkspaceTab[]
  activeTabId: string | null
}

export type LayoutNode =
  | { kind: "pane"; paneId: string }
  | {
      kind: "split"
      id: string
      axis: SplitAxis
      ratio: number
      first: LayoutNode
      second: LayoutNode
    }

export interface WorkspaceLayoutState {
  version: 1
  root: LayoutNode
  panes: Record<string, WorkspacePane>
}

export type WorkspaceLayoutCommand =
  | { action: "layout.get" }
  | {
      action: "tab.create"
      paneId: string
      tab: { id?: string; kind: WorkspaceTabKind; title: string; target?: string }
      activate?: boolean
    }
  | { action: "tab.activate"; paneId: string; tabId: string }
  | { action: "tab.close"; paneId: string; tabId: string }
  | { action: "tab.move"; tabId: string; fromPaneId: string; toPaneId: string; index?: number }
  | {
      action: "pane.split"
      paneId: string
      direction: SplitDirection
      newPaneId?: string
      tab?: { id?: string; kind: WorkspaceTabKind; title: string; target?: string }
    }
  | { action: "pane.move"; paneId: string; targetPaneId: string; direction: SplitDirection }
  | { action: "pane.close"; paneId: string; moveTabsToPaneId?: string }
  | { action: "pane.resize"; splitId: string; ratio: number }
  | { action: "layout.reset" }

export function initialWorkspaceLayout(): WorkspaceLayoutState {
  return {
    version: 1,
    root: {
      kind: "split",
      id: "split-root",
      axis: "horizontal",
      ratio: 0.32,
      first: { kind: "pane", paneId: "outline" },
      second: { kind: "pane", paneId: "main" },
    },
    panes: {
      outline: {
        id: "outline",
        tabs: [{ id: "outline", kind: "outline", title: "Outline" }],
        activeTabId: "outline",
      },
      main: {
        id: "main",
        tabs: [
          { id: "detail", kind: "block-detail", title: "Block Detail" },
          { id: "document", kind: "tmd-document", title: ".tmd Picker", target: "builtin:outliner-picker" },
        ],
        activeTabId: "document",
      },
    },
  }
}

function requirePane(state: WorkspaceLayoutState, paneId: string): WorkspacePane {
  const pane = state.panes[paneId]
  if (!pane) throw new Error(`Pane not found: ${paneId}`)
  return pane
}

function uniqueId(prefix: string, existing: (id: string) => boolean): string {
  for (let index = 1; ; index += 1) {
    const id = `${prefix}-${index}`
    if (!existing(id)) return id
  }
}

function mapNode(node: LayoutNode, callback: (node: LayoutNode) => LayoutNode): LayoutNode {
  const mapped = node.kind === "split"
    ? { ...node, first: mapNode(node.first, callback), second: mapNode(node.second, callback) }
    : node
  return callback(mapped)
}

function containsPane(node: LayoutNode, paneId: string): boolean {
  return node.kind === "pane"
    ? node.paneId === paneId
    : containsPane(node.first, paneId) || containsPane(node.second, paneId)
}

function replacePaneNode(root: LayoutNode, paneId: string, replacement: LayoutNode): LayoutNode {
  let found = false
  const next = mapNode(root, (node) => {
    if (node.kind === "pane" && node.paneId === paneId) {
      found = true
      return replacement
    }
    return node
  })
  if (!found) throw new Error(`Pane is not present in layout: ${paneId}`)
  return next
}

function removePaneNode(node: LayoutNode, paneId: string): { node: LayoutNode | null; found: boolean } {
  if (node.kind === "pane") {
    return node.paneId === paneId ? { node: null, found: true } : { node, found: false }
  }
  const first = removePaneNode(node.first, paneId)
  if (first.found) {
    return first.node
      ? { node: { ...node, first: first.node }, found: true }
      : { node: node.second, found: true }
  }
  const second = removePaneNode(node.second, paneId)
  if (second.found) {
    return second.node
      ? { node: { ...node, second: second.node }, found: true }
      : { node: node.first, found: true }
  }
  return { node, found: false }
}

function splitAround(
  target: LayoutNode,
  paneId: string,
  direction: SplitDirection,
  splitId: string,
): LayoutNode {
  const incoming: LayoutNode = { kind: "pane", paneId }
  const before = direction === "left" || direction === "up"
  return {
    kind: "split",
    id: splitId,
    axis: direction === "left" || direction === "right" ? "horizontal" : "vertical",
    ratio: 0.5,
    first: before ? incoming : target,
    second: before ? target : incoming,
  }
}

function normalizePane(pane: WorkspacePane): WorkspacePane {
  const activeExists = pane.tabs.some((tab) => tab.id === pane.activeTabId)
  return { ...pane, activeTabId: activeExists ? pane.activeTabId : pane.tabs[0]?.id ?? null }
}

export function applyWorkspaceCommand(
  state: WorkspaceLayoutState,
  command: WorkspaceLayoutCommand,
): WorkspaceLayoutState {
  if (command.action === "layout.get") return state
  if (command.action === "layout.reset") return initialWorkspaceLayout()

  if (command.action === "tab.create") {
    const pane = requirePane(state, command.paneId)
    const tabId = command.tab.id ?? uniqueId("tab", (id) =>
      Object.values(state.panes).some((candidate) => candidate.tabs.some((tab) => tab.id === id)),
    )
    if (Object.values(state.panes).some((candidate) => candidate.tabs.some((tab) => tab.id === tabId))) {
      throw new Error(`Tab already exists: ${tabId}`)
    }
    const tab: WorkspaceTab = { ...command.tab, id: tabId }
    return {
      ...state,
      panes: {
        ...state.panes,
        [pane.id]: {
          ...pane,
          tabs: [...pane.tabs, tab],
          activeTabId: command.activate === false ? pane.activeTabId : tab.id,
        },
      },
    }
  }

  if (command.action === "tab.activate") {
    const pane = requirePane(state, command.paneId)
    if (!pane.tabs.some((tab) => tab.id === command.tabId)) throw new Error(`Tab not found: ${command.tabId}`)
    return { ...state, panes: { ...state.panes, [pane.id]: { ...pane, activeTabId: command.tabId } } }
  }

  if (command.action === "tab.close") {
    const pane = requirePane(state, command.paneId)
    if (!pane.tabs.some((tab) => tab.id === command.tabId)) throw new Error(`Tab not found: ${command.tabId}`)
    const nextPane = normalizePane({ ...pane, tabs: pane.tabs.filter((tab) => tab.id !== command.tabId) })
    return { ...state, panes: { ...state.panes, [pane.id]: nextPane } }
  }

  if (command.action === "tab.move") {
    const from = requirePane(state, command.fromPaneId)
    const to = requirePane(state, command.toPaneId)
    const tab = from.tabs.find((candidate) => candidate.id === command.tabId)
    if (!tab) throw new Error(`Tab not found: ${command.tabId}`)
    const remaining = from.tabs.filter((candidate) => candidate.id !== tab.id)
    if (from.id === to.id) {
      const index = Math.max(0, Math.min(command.index ?? remaining.length, remaining.length))
      remaining.splice(index, 0, tab)
      return {
        ...state,
        panes: { ...state.panes, [from.id]: { ...from, tabs: remaining, activeTabId: tab.id } },
      }
    }
    const fromPane = normalizePane({ ...from, tabs: remaining })
    const toTabs = [...to.tabs]
    const index = Math.max(0, Math.min(command.index ?? toTabs.length, toTabs.length))
    toTabs.splice(index, 0, tab)
    return {
      ...state,
      panes: {
        ...state.panes,
        [from.id]: fromPane,
        [to.id]: { ...to, tabs: toTabs, activeTabId: tab.id },
      },
    }
  }

  if (command.action === "pane.split") {
    requirePane(state, command.paneId)
    const newPaneId = command.newPaneId ?? uniqueId("pane", (id) => Boolean(state.panes[id]))
    if (state.panes[newPaneId]) throw new Error(`Pane already exists: ${newPaneId}`)
    const tab = command.tab
      ? { ...command.tab, id: command.tab.id ?? `${newPaneId}-tab` }
      : { id: `${newPaneId}-empty`, kind: "empty" as const, title: "Empty" }
    const splitId = uniqueId("split", (id) => {
      let exists = false
      mapNode(state.root, (node) => {
        if (node.kind === "split" && node.id === id) exists = true
        return node
      })
      return exists
    })
    const root = replacePaneNode(
      state.root,
      command.paneId,
      splitAround({ kind: "pane", paneId: command.paneId }, newPaneId, command.direction, splitId),
    )
    return {
      ...state,
      root,
      panes: {
        ...state.panes,
        [newPaneId]: { id: newPaneId, tabs: [tab], activeTabId: tab.id },
      },
    }
  }

  if (command.action === "pane.resize") {
    if (!Number.isFinite(command.ratio)) throw new Error("Pane ratio must be finite")
    let found = false
    const ratio = Math.max(0.1, Math.min(0.9, command.ratio))
    const root = mapNode(state.root, (node) => {
      if (node.kind === "split" && node.id === command.splitId) {
        found = true
        return { ...node, ratio }
      }
      return node
    })
    if (!found) throw new Error(`Split not found: ${command.splitId}`)
    return { ...state, root }
  }

  if (command.action === "pane.close") {
    requirePane(state, command.paneId)
    if (state.root.kind === "pane") throw new Error("Cannot close the last pane")
    const removed = removePaneNode(state.root, command.paneId)
    if (!removed.found || !removed.node) throw new Error(`Pane is not present in layout: ${command.paneId}`)
    const panes = { ...state.panes }
    const closing = panes[command.paneId]!
    delete panes[command.paneId]
    if (closing.tabs.length > 0) {
      if (!command.moveTabsToPaneId) throw new Error("Pane contains tabs; provide moveTabsToPaneId")
      const target = panes[command.moveTabsToPaneId]
      if (!target) throw new Error(`Target pane not found: ${command.moveTabsToPaneId}`)
      panes[target.id] = { ...target, tabs: [...target.tabs, ...closing.tabs], activeTabId: closing.activeTabId }
    }
    return { ...state, root: removed.node, panes }
  }

  if (command.action === "pane.move") {
    requirePane(state, command.paneId)
    requirePane(state, command.targetPaneId)
    if (command.paneId === command.targetPaneId) throw new Error("Cannot move a pane relative to itself")
    if (!containsPane(state.root, command.targetPaneId)) throw new Error(`Target pane is not present: ${command.targetPaneId}`)
    const removed = removePaneNode(state.root, command.paneId)
    if (!removed.found || !removed.node) throw new Error(`Pane is not present in layout: ${command.paneId}`)
    const splitId = uniqueId("split", (id) => {
      let exists = false
      mapNode(removed.node!, (node) => {
        if (node.kind === "split" && node.id === id) exists = true
        return node
      })
      return exists
    })
    const root = replacePaneNode(
      removed.node,
      command.targetPaneId,
      splitAround({ kind: "pane", paneId: command.targetPaneId }, command.paneId, command.direction, splitId),
    )
    return { ...state, root }
  }

  return state
}
