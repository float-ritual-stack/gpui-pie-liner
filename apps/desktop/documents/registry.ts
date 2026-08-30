export interface DocumentActionEvent {
  action: string
  value?: unknown
}

export type DocumentAction = (event: DocumentActionEvent) => Promise<void> | void

export interface DocumentCapabilityRegistry {
  actions: Record<string, DocumentAction>
  version: string
}

export function registryShape(registry: DocumentCapabilityRegistry) {
  return {
    actions: new Set(Object.keys(registry.actions)),
    version: registry.version,
  }
}
