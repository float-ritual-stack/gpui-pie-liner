import {
  DocumentDiagnostic,
  type DirectiveAstNode,
  type DocumentAst,
  type DocumentAstNode,
  type SourcePosition,
  type SourceRange,
} from "./types"

function positionAt(source: string, offset: number): SourcePosition {
  const before = source.slice(0, offset)
  const lastNewline = before.lastIndexOf("\n")
  return {
    line: before.split("\n").length,
    column: offset - lastNewline,
    offset,
  }
}

function rangeAt(source: string, start: number, end = start + 1): SourceRange {
  return { start: positionAt(source, start), end: positionAt(source, end) }
}

function nextLineOffset(source: string, offset: number): number {
  const newline = source.indexOf("\n", offset)
  return newline < 0 ? source.length : newline + 1
}

function lineAt(source: string, offset: number): string {
  const newline = source.indexOf("\n", offset)
  return source.slice(offset, newline < 0 ? source.length : newline)
}

function parseAttributes(
  source: string,
  raw: string,
  rawOffset: number,
): Record<string, string> {
  const attributes: Record<string, string> = {}
  let cursor = 0
  const fail = (message: string, at = cursor): never => {
    throw new DocumentDiagnostic(message, rangeAt(source, rawOffset + at))
  }

  while (cursor < raw.length) {
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1
    if (cursor >= raw.length) break

    const keyStart = cursor
    if (!/[A-Za-z]/.test(raw[cursor] ?? "")) fail("Expected a property name")
    cursor += 1
    while (/[A-Za-z0-9_.-]/.test(raw[cursor] ?? "")) cursor += 1
    const key = raw.slice(keyStart, cursor)
    if (Object.hasOwn(attributes, key)) fail(`Duplicate property "${key}"`, keyStart)

    while (/\s/.test(raw[cursor] ?? "")) cursor += 1
    if (raw[cursor] !== "=") fail(`Expected = after property "${key}"`)
    cursor += 1
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1
    if (raw[cursor] !== '"') fail(`Property "${key}" must use a quoted value`)
    cursor += 1

    let value = ""
    let closed = false
    while (cursor < raw.length) {
      const character = raw[cursor]!
      if (character === '"') {
        cursor += 1
        closed = true
        break
      }
      if (character === "\\") {
        const escaped = raw[cursor + 1]
        if (escaped !== "\\" && escaped !== '"') {
          fail('Only \\\\ and \\" escapes are supported in properties')
        }
        value += escaped
        cursor += 2
        continue
      }
      value += character
      cursor += 1
    }
    if (!closed) fail(`Unterminated value for property "${key}"`, keyStart)
    attributes[key] = value
  }

  return attributes
}

interface ParsedHeader {
  name: string
  attributes: Record<string, string>
  container: boolean
  start: number
  nextOffset: number
  headerEnd: number
}

function parseDirectiveHeader(source: string, lineOffset: number): ParsedHeader {
  const line = lineAt(source, lineOffset)
  const leading = line.length - line.trimStart().length
  const start = lineOffset + leading
  const container = source.startsWith(":::", start)
  const prefixLength = container ? 3 : 2
  let cursor = start + prefixLength
  const nameStart = cursor
  while (/[A-Za-z0-9-]/.test(source[cursor] ?? "")) cursor += 1
  const name = source.slice(nameStart, cursor)
  if (!name) {
    throw new DocumentDiagnostic("Expected a directive name", rangeAt(source, cursor))
  }
  while (/\s/.test(source[cursor] ?? "") && source[cursor] !== "\n") cursor += 1
  if (source[cursor] !== "{") {
    throw new DocumentDiagnostic(
      `Directive ::${container ? ":" : ""}${name} requires { properties }`,
      rangeAt(source, cursor),
    )
  }

  const attributesStart = cursor + 1
  cursor += 1
  let quoted = false
  let escaped = false
  while (cursor < source.length) {
    const character = source[cursor]!
    if (quoted) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === "}") break
    cursor += 1
  }
  if (cursor >= source.length) {
    throw new DocumentDiagnostic(
      `Unterminated properties for directive ${name}`,
      rangeAt(source, start),
    )
  }

  const headerEnd = cursor + 1
  const endOfClosingLine = nextLineOffset(source, cursor)
  const trailing = source.slice(headerEnd, endOfClosingLine).trim()
  if (trailing) {
    throw new DocumentDiagnostic(
      `Unexpected text after directive ${name}`,
      rangeAt(source, headerEnd),
    )
  }

  return {
    name,
    attributes: parseAttributes(
      source,
      source.slice(attributesStart, cursor),
      attributesStart,
    ),
    container,
    start,
    nextOffset: endOfClosingLine,
    headerEnd,
  }
}

interface ParseNodesResult {
  nodes: DocumentAstNode[]
  nextOffset: number
  closed: boolean
}

function parseNodes(source: string, from: number, insideContainer: boolean): ParseNodesResult {
  const nodes: DocumentAstNode[] = []
  let cursor = from
  let markdownStart = from

  const flushMarkdown = (end: number) => {
    if (end <= markdownStart) return
    const markdown = source.slice(markdownStart, end)
    if (!markdown.trim()) return
    nodes.push({ kind: "markdown", source: markdown, range: rangeAt(source, markdownStart, end) })
  }

  while (cursor < source.length) {
    const line = lineAt(source, cursor)
    const trimmed = line.trim()
    if (trimmed === ":::") {
      if (!insideContainer) {
        throw new DocumentDiagnostic("Unexpected container closing marker", rangeAt(source, cursor))
      }
      flushMarkdown(cursor)
      return { nodes, nextOffset: nextLineOffset(source, cursor), closed: true }
    }

    const lineLeading = line.length - line.trimStart().length
    const directiveStart = cursor + lineLeading
    const startsDirective =
      source.startsWith(":::", directiveStart) || source.startsWith("::", directiveStart)
    if (!startsDirective) {
      cursor = nextLineOffset(source, cursor)
      continue
    }

    flushMarkdown(cursor)
    const header = parseDirectiveHeader(source, cursor)
    let children: DocumentAstNode[] = []
    let end = header.nextOffset
    if (header.container) {
      const result = parseNodes(source, header.nextOffset, true)
      if (!result.closed) {
        throw new DocumentDiagnostic(
          `Container directive ${header.name} is missing its closing :::`,
          rangeAt(source, header.start, header.headerEnd),
        )
      }
      children = result.nodes
      end = result.nextOffset
    }

    const node: DirectiveAstNode = {
      kind: "directive",
      name: header.name,
      attributes: header.attributes,
      children,
      range: rangeAt(source, header.start, end),
    }
    nodes.push(node)
    cursor = end
    markdownStart = end
  }

  flushMarkdown(source.length)
  return { nodes, nextOffset: source.length, closed: false }
}

export function parseDocument(source: string): DocumentAst {
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
  const result = parseNodes(normalized, 0, false)
  return { source: normalized, nodes: result.nodes }
}
