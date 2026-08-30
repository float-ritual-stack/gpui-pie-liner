import { useMemo, useRef, useState } from "react"
import { render } from "@gpuix/react"
import pickerSource from "./documents/fixtures/outliner-picker.tmd" with { type: "text" }
import { DocumentSurface } from "./documents/render-document"
import type { DocumentCapabilityRegistry } from "./documents/registry"
import { C, FONT } from "./theme"
import { useOutlinerWorkspace } from "./model/use-outliner-workspace"
import { navigateTree, visibleTreeItems } from "./model/tree-navigation"
import type { VisibleBlock } from "../../packages/outliner"

type Session = {
  id: string
  title: string
  summary: string
  depth: number
  parentId: string | null
  children?: boolean
  rawText?: string
  workId?: string
}

function blockTitle(block: VisibleBlock): string {
  const firstContentLine = block.displayText
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[A-Za-z][A-Za-z0-9_.-]*::[^\]]+\]/g, "").trim())
    .find(Boolean)
  return firstContentLine || block.id.slice(0, 8)
}

function blockSummary(block: VisibleBlock): string {
  const lines = block.displayText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.slice(1, 3).join(" ") || `${block.author} · ${block.properties.length} properties`
}

function blockToSession(block: VisibleBlock): Session {
  return {
    id: block.id,
    title: blockTitle(block),
    summary: blockSummary(block),
    depth: block.depth,
    parentId: block.parentId,
    children: block.hasChildren,
    rawText: block.text,
    workId: block.properties.find((property) => property.key === "work-id")?.value,
  }
}

const INITIAL_SESSIONS: Session[] = [
  {
    id: "PIE-146",
    title: "Normalize block queries",
    summary: "One bounded query shape shared by Tree, virtual branches, CLI, and agents.",
    depth: 0,
    parentId: null,
    children: true,
  },
  {
    id: "PIE-152",
    title: "Resolve work placeholders",
    summary: "Turn deterministic PREFIX-XXX markers into agent-assisted durable work.",
    depth: 1,
    parentId: "PIE-146",
  },
  {
    id: "PIE-156",
    title: "Live client identity",
    summary: "Address exact Tree and Detail clients without guessing pane ownership.",
    depth: 1,
    parentId: "PIE-146",
  },
  {
    id: "PIE-160",
    title: "GPUX document spike",
    summary: "Interpret safe .tmd documents as validated native GPUIX component trees.",
    depth: 0,
    parentId: null,
  },
]

function TreeRow({
  session,
  selected,
  collapsed,
  onSelect,
}: {
  session: Session
  selected: boolean
  collapsed: boolean
  onSelect: () => void
}) {
  return (
    <div
      testId={`tree-${session.id}`}
      onClick={onSelect}
      style={{
        minHeight: 38,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 12 + session.depth * 18,
        paddingRight: 10,
        gap: 8,
        borderRadius: 7,
        cursor: "pointer",
        backgroundColor: selected ? C.accentSoft : undefined,
        hover: selected ? undefined : { backgroundColor: C.overlay },
      }}
    >
      <text style={{ width: 12, color: C.tertiary, fontFamily: FONT, fontSize: 12 }}>
        {session.children ? (collapsed ? "▸" : "▾") : "•"}
      </text>
      <text style={{ flexGrow: 1, minWidth: 0, color: selected ? C.text : C.secondary, fontFamily: FONT, fontSize: 13 }}>
        {session.title}
      </text>
      {session.workId ? (
        <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 10 }}>{session.workId}</text>
      ) : null}
    </div>
  )
}

function Detail({ session, onOpenDocument }: { session: Session; onOpenDocument: () => void }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 18,
          paddingRight: 14,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <text style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}>Detail</text>
          <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 10 }}>{session.id}</text>
        </div>
        <div
          testId="open-tmd"
          onClick={onOpenDocument}
          style={{
            padding: 9,
            paddingLeft: 12,
            paddingRight: 12,
            borderRadius: 7,
            backgroundColor: C.accent,
            cursor: "pointer",
            hover: { backgroundColor: "#EC8767" },
          }}
        >
          <text style={{ color: "#171717", fontFamily: FONT, fontSize: 12 }}>Open .tmd picker</text>
        </div>
      </div>
      <div style={{ flexGrow: 1, minHeight: 0, overflowY: "scroll", padding: 24 }}>
        <markdown
          source={session.rawText ?? `# ${session.title}\n\n${session.summary}\n\n\`\`\`text\n[work-id::${session.id}]\n\`\`\``}
          style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}
        />
      </div>
    </div>
  )
}

export function App() {
  const workspace = useOutlinerWorkspace()
  const [localSelectedId, setLocalSelectedId] = useState(INITIAL_SESSIONS[0]!.id)
  const [activeTab, setActiveTab] = useState<"detail" | "document">("document")
  const [treeWidth, setTreeWidth] = useState(340)
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set())
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [filter, setFilter] = useState("")
  const [status, setStatus] = useState(".tmd picker mounted")
  const sessions = workspace.blocks.length > 0
    ? workspace.blocks.map(blockToSession)
    : INITIAL_SESSIONS
  const selectedId = workspace.selectedId ?? localSelectedId
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0]!
  const matches = sessions.filter((session) =>
    `${session.id} ${session.title} ${session.summary}`.toLowerCase().includes(filter.toLowerCase()),
  )
  const visible = filter ? matches : visibleTreeItems(matches, collapsedIds)

  const registry = useMemo<DocumentCapabilityRegistry>(() => ({
    version: "spike-1",
    actions: {
      "session.open": ({ value }) => {
        const id = String(value ?? "")
        if (sessions.some((session) => session.id === id)) {
          setLocalSelectedId(id)
          void workspace.select(id)
          setStatus(`Opened ${id.slice(0, 8)} through named capability`)
        }
      },
      "sessions.refresh": () => {
        void workspace.refresh()
        setStatus(`Refreshing ${sessions.length} canonical blocks`)
      },
      "document.close": () => {
        setActiveTab("detail")
        setStatus("Closed .tmd surface and returned to Detail")
      },
    },
  }), [sessions, workspace.refresh, workspace.select])

  const documentData = useMemo(() => ({ sessions, selected }), [sessions, selected])

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: C.canvas,
      }}
    >
      <div
        style={{
          height: 50,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingLeft: 18,
          paddingRight: 14,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <text style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}>GPUI Pie Liner</text>
        <input
          testId="filter"
          value={filter}
          placeholder="Filter blocks"
          onChange={(event) => setFilter(event.value ?? "")}
          style={{
            width: 300,
            height: 32,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 7,
            backgroundColor: C.raised,
            color: C.text,
            fontFamily: FONT,
            fontSize: 12,
          }}
          theme={{ caret: C.accent }}
        />
        <div style={{ flexGrow: 1 }} />
        <text style={{ color: workspace.error ? C.danger : C.tertiary, fontFamily: FONT, fontSize: 11 }}>
          {workspace.error
            ? `offline · ${workspace.error}`
            : `${workspace.connection} · seq ${workspace.sequence} · ${status}`}
        </text>
      </div>

      <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
        <div
          style={{
            width: treeWidth,
            height: "100%",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            padding: 10,
            backgroundColor: C.sidebar,
          }}
          tabIndex={0}
          onKeyDown={(event) => {
            const result = navigateTree(visible, selected.id, collapsedIds, event.key ?? "")
            setCollapsedIds(result.collapsed)
            if (result.selectedId && result.selectedId !== selected.id) {
              setLocalSelectedId(result.selectedId)
              void workspace.select(result.selectedId)
            }
            if (result.openDetail) setActiveTab("detail")
          }}
        >
          <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
            PHYSICAL TREE · {String(visible.length)}
          </text>
          <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 9, marginBottom: 8 }}>
            ↑↓ move · ←→ collapse/enter · Space toggle · Enter detail
          </text>
          <virtual-list estimatedItemHeight={40} style={{ flexGrow: 1, minHeight: 0 }}>
            {visible.map((session) => (
              <div key={session.id}>
                <TreeRow
                  session={session}
                  selected={session.id === selected.id}
                  collapsed={collapsedIds.has(session.id)}
                  onSelect={() => {
                    setLocalSelectedId(session.id)
                    void workspace.select(session.id)
                  }}
                />
              </div>
            ))}
          </virtual-list>
        </div>

        <div
          testId="tree-divider"
          onMouseDown={(event) => {
            resizeRef.current = { startX: event.x ?? 0, startWidth: treeWidth }
          }}
          onMouseMove={(event) => {
            const resize = resizeRef.current
            if (!resize) return
            setTreeWidth(Math.max(240, Math.min(620, resize.startWidth + (event.x ?? 0) - resize.startX)))
          }}
          onMouseUp={() => {
            resizeRef.current = null
          }}
          style={{
            width: 5,
            height: "100%",
            flexShrink: 0,
            cursor: "col-resize",
            backgroundColor: C.border,
            hover: { backgroundColor: C.accent },
            active: { backgroundColor: C.accent },
          }}
        />

        <div
          style={{
            flexGrow: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: C.canvas,
          }}
        >
          <div
            style={{
              height: 38,
              flexShrink: 0,
              display: "flex",
              flexDirection: "row",
              alignItems: "end",
              paddingLeft: 8,
              gap: 3,
              borderBottomWidth: 1,
              borderColor: C.border,
              backgroundColor: C.sidebar,
            }}
          >
            {([
              ["detail", "Block Detail"],
              ["document", ".tmd Picker"],
            ] as const).map(([id, label]) => (
              <div
                key={id}
                testId={`tab-${id}`}
                onClick={() => setActiveTab(id)}
                style={{
                  height: 34,
                  paddingLeft: 13,
                  paddingRight: 13,
                  display: "flex",
                  alignItems: "center",
                  borderTopLeftRadius: 7,
                  borderTopRightRadius: 7,
                  cursor: "pointer",
                  backgroundColor: activeTab === id ? C.canvas : C.sidebar,
                  borderBottomWidth: activeTab === id ? 2 : 0,
                  borderColor: C.accent,
                  hover: activeTab === id ? undefined : { backgroundColor: C.overlay },
                }}
              >
                <text style={{ color: activeTab === id ? C.text : C.tertiary, fontFamily: FONT, fontSize: 12 }}>
                  {label}
                </text>
              </div>
            ))}
          </div>
          <div style={{ flexGrow: 1, minHeight: 0 }}>
            {activeTab === "document" ? (
              <DocumentSurface
                source={pickerSource}
                data={documentData}
                registry={registry}
                onClose={() => {
                  setActiveTab("detail")
                  setStatus("Closed .tmd surface")
                }}
              />
            ) : (
              <Detail session={selected} onOpenDocument={() => setActiveTab("document")} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const isEntryPoint =
  typeof Bun !== "undefined"
    ? Bun.isStandaloneExecutable || Bun.main === import.meta.path
    : typeof window !== "undefined"

if (isEntryPoint) {
  render(<App />, {
    title: "GPUI Pie Liner",
    width: 1100,
    height: 720,
    titlebarTransparent: true,
    windowBackground: "blurred",
    trafficLightX: 16,
    trafficLightY: 17,
    focus: typeof process === "undefined" || process.env.GPUIX_BACKGROUND !== "1",
  })
}
