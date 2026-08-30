export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export interface SourceRange {
  start: SourcePosition
  end: SourcePosition
}

export interface MarkdownAstNode {
  kind: "markdown"
  source: string
  range: SourceRange
}

export interface DirectiveAstNode {
  kind: "directive"
  name: string
  attributes: Record<string, string>
  children: DocumentAstNode[]
  range: SourceRange
}

export type DocumentAstNode = MarkdownAstNode | DirectiveAstNode

export interface DocumentAst {
  source: string
  nodes: DocumentAstNode[]
}

export type TemplateSegment =
  | { kind: "text"; value: string }
  | { kind: "binding"; path: string; range: SourceRange }

export interface CompiledTextTemplate {
  segments: TemplateSegment[]
}

export interface ValidatedMarkdownNode {
  kind: "markdown"
  template: CompiledTextTemplate
  range: SourceRange
}

export interface ValidatedBoxNode {
  kind: "component"
  component: "box"
  props: Record<string, string>
  children: ValidatedNode[]
  range: SourceRange
}

export interface ValidatedSelectNode {
  kind: "component"
  component: "select"
  props: Record<string, string>
  children: []
  range: SourceRange
}

export interface ValidatedKeyBindingNode {
  kind: "key-binding"
  key: string
  action: string
  range: SourceRange
}

export type ValidatedNode =
  | ValidatedMarkdownNode
  | ValidatedBoxNode
  | ValidatedSelectNode
  | ValidatedKeyBindingNode

export interface ValidatedDocument {
  nodes: ValidatedNode[]
  keyBindings: ReadonlyMap<string, string>
}

export class DocumentDiagnostic extends Error {
  constructor(
    message: string,
    readonly range: SourceRange,
  ) {
    super(`line ${range.start.line}, column ${range.start.column}\n\n${message}`)
    this.name = "DocumentDiagnostic"
  }
}

export interface ActionRegistryShape {
  readonly actions: ReadonlySet<string>
  readonly version: string
}
