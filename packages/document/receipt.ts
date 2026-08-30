import { renderTextTemplate } from "./bindings"
import type { ValidatedDocument, ValidatedNode } from "./types"

function nodeReceipt(node: ValidatedNode, data: unknown): string[] {
  if (node.kind === "markdown") return [renderTextTemplate(node.template, data)]
  if (node.kind === "key-binding") return []
  if (node.component === "select") return [`_Interactive select: ${node.props.action}_`]
  return [node.props.title ? `## ${node.props.title}` : "", ...node.children.flatMap((child) => nodeReceipt(child, data))]
}

export function renderStaticReceipt(document: ValidatedDocument, data: unknown): string {
  return document.nodes.flatMap((node) => nodeReceipt(node, data)).filter(Boolean).join("\n\n")
}
