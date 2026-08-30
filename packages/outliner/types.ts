export interface BlockProperty {
  key: string
  value: string
}

export interface VisibleBlock {
  id: string
  parentId: string | null
  position: number
  text: string
  author: "user" | "agent" | "system"
  createdAt: string
  updatedAt: string
  deletedAt?: string
  effectiveDeletedRootId?: string
  properties: BlockProperty[]
  depth: number
  hasChildren: boolean
  displayText: string
}

export type BlockCollectionCompleteness =
  | { kind: "complete" }
  | { kind: "truncated"; limit: number }

export interface VisibleBlockCollection {
  blocks: VisibleBlock[]
  completeness: BlockCollectionCompleteness
}

export interface SelectionContext {
  selected: VisibleBlock | null
  ancestors: VisibleBlock[]
  children: VisibleBlock[]
}

export interface WorkspaceSnapshot {
  visible: VisibleBlockCollection
  physical: VisibleBlockCollection
  selection: SelectionContext
  sequence: number
}

export interface OutlinerEvent {
  id: string
  domain: "content" | "selection" | "view" | "ui"
  action: string
  sequence: number
  blockId?: string
}

export interface OutlinerResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
  sequence: number
}

export interface OutlinerEventEnvelope {
  event: OutlinerEvent
}

export type OutlinerRequestInput =
  | { action: "ping" }
  | { action: "workspace.snapshot" }
  | {
      action: "blocks.query"
      query: {
        filters?: Array<{ key: string; value?: string }>
        text?: string
        limit: number
      }
    }
  | {
      action: "create"
      parentId?: string | null
      text: string
      author?: "user" | "agent" | "system"
      provenance?: { actorId: string; sessionId?: string; taskId?: string }
    }
  | { action: "update"; blockId: string; text: string; expectedUpdatedAt?: string }
  | { action: "selection.set"; blockId: string | null }
  | {
      action: "events.subscribe"
      client: { clientId: string; role: "tree" | "detail" }
    }
