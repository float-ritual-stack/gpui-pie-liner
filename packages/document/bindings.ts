import {
  DocumentDiagnostic,
  type CompiledTextTemplate,
  type SourceRange,
} from "./types"

const SAFE_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/
const POISON_KEYS = new Set(["__proto__", "prototype", "constructor"])
const BINDING = /{{\s*([^{}]+?)\s*}}/g

function rangeWithin(base: SourceRange, start: number, end: number): SourceRange {
  const prefix = (offset: number) => {
    const relative = offset
    return {
      line: base.start.line,
      column: base.start.column + relative,
      offset: base.start.offset + relative,
    }
  }
  return { start: prefix(start), end: prefix(end) }
}

export function validatePath(path: string, range: SourceRange): string {
  const normalized = path.trim()
  if (!SAFE_PATH.test(normalized)) {
    throw new DocumentDiagnostic(`Invalid binding path:\n  ${path}`, range)
  }
  const poisoned = normalized.split(".").find((part) => POISON_KEYS.has(part))
  if (poisoned) {
    throw new DocumentDiagnostic(`Forbidden binding path segment:\n  ${poisoned}`, range)
  }
  return normalized
}

export function compileTextTemplate(source: string, range: SourceRange): CompiledTextTemplate {
  const segments: CompiledTextTemplate["segments"] = []
  let cursor = 0
  for (const match of source.matchAll(BINDING)) {
    const index = match.index
    if (index > cursor) segments.push({ kind: "text", value: source.slice(cursor, index) })
    const matchRange = rangeWithin(range, index, index + match[0].length)
    segments.push({ kind: "binding", path: validatePath(match[1]!, matchRange), range: matchRange })
    cursor = index + match[0].length
  }
  if (cursor < source.length) segments.push({ kind: "text", value: source.slice(cursor) })
  return { segments }
}

export function resolvePath(root: unknown, path: string): unknown {
  let value = root
  for (const segment of path.split(".")) {
    if (POISON_KEYS.has(segment)) throw new Error(`Forbidden binding path segment: ${segment}`)
    if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined
    if (!Object.hasOwn(value, segment)) return undefined
    value = (value as Record<string, unknown>)[segment]
  }
  if (typeof value === "function") throw new Error(`Binding path resolved to a function: ${path}`)
  return value
}

function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u009B]/g, "")
    .replace(/\u001B/g, "")
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*{}\[\]()<>#+\-.!_|])/g, "\\$1")
}

export function renderTextTemplate(template: CompiledTextTemplate, data: unknown): string {
  return template.segments.map((segment) => {
    if (segment.kind === "text") return segment.value
    const value = resolvePath(data, segment.path)
    if (value === undefined || value === null) return ""
    if (!["string", "number", "boolean", "bigint"].includes(typeof value)) {
      throw new Error(`Text binding must resolve to a scalar: ${segment.path}`)
    }
    return escapeMarkdown(sanitizeText(String(value)))
  }).join("")
}

export function resolveTypedReference(reference: string, data: unknown): unknown {
  if (!reference.startsWith("$")) throw new Error(`Typed reference must begin with $: ${reference}`)
  const path = reference.slice(1)
  if (!SAFE_PATH.test(path) || path.split(".").some((part) => POISON_KEYS.has(part))) {
    throw new Error(`Invalid typed reference: ${reference}`)
  }
  const value = resolvePath(data, path)
  if (typeof value === "function") throw new Error(`Typed reference resolved to a function: ${reference}`)
  return value
}
