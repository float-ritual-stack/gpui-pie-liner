import { useMemo, useState, type ReactNode } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@gpuix/react"
import {
  parseDocument,
  renderTextTemplate,
  resolvePath,
  resolveTypedReference,
  validateDocument,
  type ValidatedNode,
} from "../../../packages/document"
import { C, FONT } from "../theme"
import { registryShape, type DocumentCapabilityRegistry } from "./registry"

interface DocumentSurfaceProps {
  source: string
  data: unknown
  registry: DocumentCapabilityRegistry
  onClose: () => void
}

function scalarField(item: unknown, field: string): string {
  const value = resolvePath(item, field)
  if (!["string", "number", "boolean", "bigint"].includes(typeof value)) {
    throw new Error(`Field ${field} must resolve to a scalar`)
  }
  return String(value)
}

function DocumentSelect({
  node,
  data,
  dispatch,
}: {
  node: Extract<ValidatedNode, { kind: "component"; component: "select" }>
  data: unknown
  dispatch: (action: string, value?: unknown) => void
}) {
  const source = resolveTypedReference(node.props.source!, data)
  if (!Array.isArray(source)) throw new Error(`Select source must resolve to an array: ${node.props.source}`)
  const selected = resolvePath(data, "selected")
  const externalValue = selected && typeof selected === "object"
    ? scalarField(selected, node.props.value!)
    : undefined
  const [localValue, setLocalValue] = useState<string | undefined>(externalValue)
  const value = externalValue ?? localValue

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        setLocalValue(nextValue)
        dispatch(node.props.action!, nextValue)
      }}
      style={{ width: "100%" }}
    >
      <SelectTrigger
        testId="tmd-select-trigger"
        style={(state) => ({
          width: "100%",
          minHeight: 38,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 12,
          paddingRight: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: state.open ? C.accent : C.border,
          backgroundColor: C.raised,
          cursor: "pointer",
        })}
      >
        <SelectValue placeholder={<text style={{ color: C.tertiary }}>Choose a session</text>}>
          {value ? (
            <text style={{ color: C.text, fontFamily: FONT, fontSize: 13 }}>
              {source.find((item) => scalarField(item, node.props.value!) === value)
                ? scalarField(
                    source.find((item) => scalarField(item, node.props.value!) === value),
                    node.props.label!,
                  )
                : value}
            </text>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        sideOffset={6}
        style={{
          width: 360,
          maxHeight: 260,
          overflowY: "scroll",
          padding: 5,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.panel,
        }}
      >
        {source.map((item) => {
          const itemValue = scalarField(item, node.props.value!)
          const label = scalarField(item, node.props.label!)
          return (
            <SelectItem
              key={itemValue}
              value={itemValue}
              textValue={label}
              style={(state) => ({
                minHeight: 34,
                paddingLeft: 10,
                paddingRight: 10,
                display: "flex",
                alignItems: "center",
                borderRadius: 6,
                opacity: state.disabled ? 0.4 : 1,
                backgroundColor: state.highlighted
                  ? C.overlay
                  : state.selected
                    ? C.accentSoft
                    : C.panel,
              })}
            >
              <text style={{ color: C.text, fontFamily: FONT, fontSize: 13 }}>{label}</text>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

function renderNodes(
  nodes: readonly ValidatedNode[],
  data: unknown,
  dispatch: (action: string, value?: unknown) => void,
): ReactNode[] {
  return nodes.flatMap((node) => {
    if (node.kind === "key-binding") return []
    if (node.kind === "markdown") {
      return [
        <markdown
          key={`markdown-${node.range.start.offset}`}
          source={renderTextTemplate(node.template, data)}
          style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}
        />,
      ]
    }
    if (node.component === "select") {
      return [
        <DocumentSelect
          key={`select-${node.range.start.offset}`}
          node={node}
          data={data}
          dispatch={dispatch}
        />,
      ]
    }
    return [
      <div
        key={`box-${node.range.start.offset}`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.panel,
        }}
      >
        {node.props.title ? (
          <text style={{ color: C.secondary, fontFamily: FONT, fontSize: 12 }}>
            {node.props.title}
          </text>
        ) : null}
        {renderNodes(node.children, data, dispatch)}
      </div>,
    ]
  })
}

export function compileDocument(source: string, registry: DocumentCapabilityRegistry) {
  return validateDocument(parseDocument(source), registryShape(registry))
}

export function DocumentSurface({ source, data, registry, onClose }: DocumentSurfaceProps) {
  const document = useMemo(
    () => compileDocument(source, registry),
    [source, registry.version],
  )
  const dispatch = (action: string, value?: unknown) => {
    const capability = registry.actions[action]
    if (!capability) throw new Error(`Action disappeared after validation: ${action}`)
    void capability({ action, value })
  }

  return (
    <div
      testId="tmd-surface"
      tabIndex={0}
      autoFocus
      onKeyDown={(event) => {
        const action = document.keyBindings.get(event.key ?? "")
        if (action) dispatch(action)
      }}
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
          height: 48,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 16,
          paddingRight: 12,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <text style={{ flexGrow: 1, color: C.secondary, fontFamily: FONT, fontSize: 12 }}>
          Interpreted .tmd · registry {registry.version}
        </text>
        <div
          testId="tmd-close"
          onClick={onClose}
          style={{ padding: 8, borderRadius: 7, cursor: "pointer", hover: { backgroundColor: C.overlay } }}
        >
          <text style={{ color: C.secondary, fontFamily: FONT, fontSize: 12 }}>Close · Esc</text>
        </div>
      </div>
      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: "scroll",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 22,
        }}
      >
        {renderNodes(document.nodes, data, dispatch)}
      </div>
    </div>
  )
}
