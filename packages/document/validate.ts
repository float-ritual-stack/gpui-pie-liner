import { compileTextTemplate, validatePath } from "./bindings"
import {
  DocumentDiagnostic,
  type ActionRegistryShape,
  type DirectiveAstNode,
  type DocumentAst,
  type DocumentAstNode,
  type ValidatedDocument,
  type ValidatedNode,
} from "./types"

interface DirectiveSpec {
  allowed: readonly string[]
  required: readonly string[]
  container: boolean
}

const SPECS: Record<string, DirectiveSpec> = {
  box: { allowed: ["title"], required: [], container: true },
  select: {
    allowed: ["source", "label", "value", "action", "visibleRows"],
    required: ["source", "label", "value", "action"],
    container: false,
  },
  key: { allowed: ["key", "action"], required: ["key", "action"], container: false },
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0]!
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex]!
      row[rightIndex] = Math.min(
        row[rightIndex]! + 1,
        row[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return row[right.length]!
}

function suggestion(value: string, candidates: Iterable<string>): string | null {
  const ranked = [...candidates]
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .sort((left, right) => left.distance - right.distance)
  return ranked[0] && ranked[0].distance <= 3 ? ranked[0].candidate : null
}

function validateAction(node: DirectiveAstNode, action: string, registry: ActionRegistryShape): void {
  if (registry.actions.has(action)) return
  const close = suggestion(action, registry.actions)
  throw new DocumentDiagnostic(
    `Unknown action:\n  ${action}${close ? `\n\nDid you mean:\n  ${close}` : ""}`,
    node.range,
  )
}

function validateDirective(node: DirectiveAstNode, registry: ActionRegistryShape): ValidatedNode {
  const spec = SPECS[node.name]
  if (!spec) {
    const close = suggestion(node.name, Object.keys(SPECS))
    throw new DocumentDiagnostic(
      `Unknown directive:\n  ${node.name}${close ? `\n\nDid you mean:\n  ${close}` : ""}`,
      node.range,
    )
  }

  for (const property of Object.keys(node.attributes)) {
    if (!spec.allowed.includes(property)) {
      throw new DocumentDiagnostic(
        `Invalid property "${property}" on ::${node.name}.\n\nAllowed:\n${spec.allowed.map((name) => `  ${name}`).join("\n")}`,
        node.range,
      )
    }
  }
  for (const property of spec.required) {
    if (!node.attributes[property]) {
      throw new DocumentDiagnostic(
        `Missing required property "${property}" on ::${node.name}.`,
        node.range,
      )
    }
  }
  if (!spec.container && node.children.length > 0) {
    throw new DocumentDiagnostic(`Directive ::${node.name} cannot contain children.`, node.range)
  }
  if (node.name === "box" && node.children.length === 0) {
    throw new DocumentDiagnostic("Container :::box cannot be empty.", node.range)
  }

  if (node.name === "select") {
    const source = node.attributes.source!
    if (!source.startsWith("$")) {
      throw new DocumentDiagnostic('Property "source" on ::select must be a typed $reference.', node.range)
    }
    validatePath(source.slice(1), node.range)
    validateAction(node, node.attributes.action!, registry)
    if (node.attributes.visibleRows !== undefined) {
      const visibleRows = Number(node.attributes.visibleRows)
      if (!Number.isInteger(visibleRows) || visibleRows < 1 || visibleRows > 20) {
        throw new DocumentDiagnostic('Property "visibleRows" must be an integer from 1 through 20.', node.range)
      }
    }
    return {
      kind: "component",
      component: "select",
      props: node.attributes,
      children: [],
      range: node.range,
    }
  }

  if (node.name === "key") {
    validateAction(node, node.attributes.action!, registry)
    return {
      kind: "key-binding",
      key: node.attributes.key!.toLowerCase(),
      action: node.attributes.action!,
      range: node.range,
    }
  }

  return {
    kind: "component",
    component: "box",
    props: node.attributes,
    children: node.children.map((child) => validateNode(child, registry)),
    range: node.range,
  }
}

function validateNode(node: DocumentAstNode, registry: ActionRegistryShape): ValidatedNode {
  return node.kind === "markdown"
    ? { kind: "markdown", template: compileTextTemplate(node.source, node.range), range: node.range }
    : validateDirective(node, registry)
}

function collectKeyBindings(nodes: readonly ValidatedNode[], bindings: Map<string, string>): void {
  for (const node of nodes) {
    if (node.kind === "key-binding") {
      if (bindings.has(node.key)) {
        throw new DocumentDiagnostic(`Duplicate key binding:\n  ${node.key}`, node.range)
      }
      bindings.set(node.key, node.action)
    } else if (node.kind === "component") {
      collectKeyBindings(node.children, bindings)
    }
  }
}

export function validateDocument(
  ast: DocumentAst,
  registry: ActionRegistryShape,
): ValidatedDocument {
  const nodes = ast.nodes.map((node) => validateNode(node, registry))
  const keyBindings = new Map<string, string>()
  collectKeyBindings(nodes, keyBindings)
  return { nodes, keyBindings }
}
