import { useCallback, useEffect, useRef, useState } from "react"
import {
  OutlinerClient,
  resolveOutlinerTarget,
  type BlockCollectionCompleteness,
  type VisibleBlock,
  type WorkspaceSnapshot,
} from "../../../packages/outliner"

export interface OutlinerWorkspaceModel {
  blocks: readonly VisibleBlock[]
  selectedId: string | null
  completeness: BlockCollectionCompleteness
  sequence: number
  connection: "connecting" | "ready" | "offline"
  target: string
  error: string | null
  refresh(): Promise<void>
  select(blockId: string): Promise<void>
}

const EMPTY_COMPLETENESS: BlockCollectionCompleteness = { kind: "complete" }

export function useOutlinerWorkspace(): OutlinerWorkspaceModel {
  const [blocks, setBlocks] = useState<readonly VisibleBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [completeness, setCompleteness] = useState<BlockCollectionCompleteness>(EMPTY_COMPLETENESS)
  const [sequence, setSequence] = useState(0)
  const [connection, setConnection] = useState<OutlinerWorkspaceModel["connection"]>("connecting")
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState("discovering outliner service")
  const clientRef = useRef<OutlinerClient | null>(null)
  const mountedRef = useRef(true)
  const generationRef = useRef(0)

  const refresh = useCallback(async () => {
    const client = clientRef.current
    if (!client) return
    const generation = ++generationRef.current
    try {
      const snapshot = await client.request<WorkspaceSnapshot>({ action: "workspace.snapshot" })
      if (!mountedRef.current || generation !== generationRef.current) return
      setBlocks(snapshot.physical.blocks)
      setCompleteness(snapshot.physical.completeness)
      setSelectedId(snapshot.selection.selected?.id ?? snapshot.physical.blocks[0]?.id ?? null)
      setSequence(snapshot.sequence)
      setConnection("ready")
      setError(null)
    } catch (cause) {
      if (!mountedRef.current || generation !== generationRef.current) return
      setConnection("offline")
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const select = useCallback(async (blockId: string) => {
    const client = clientRef.current
    if (!client) return
    setSelectedId(blockId)
    try {
      await client.request({ action: "selection.set", blockId })
      if (mountedRef.current) setError(null)
    } catch (cause) {
      if (!mountedRef.current) return
      setError(cause instanceof Error ? cause.message : String(cause))
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    mountedRef.current = true
    let watcher: ReturnType<OutlinerClient["watch"]> | null = null
    try {
      const resolved = resolveOutlinerTarget()
      setTarget(`${resolved.source}: ${resolved.socketPath}`)
      const client = new OutlinerClient(resolved.socketPath)
      clientRef.current = client
      watcher = client.watch(crypto.randomUUID(), {
        onConnect: refresh,
        onDisconnect: () => {
          if (mountedRef.current) setConnection("offline")
        },
        onEvent: async (event) => {
          if (!mountedRef.current) return
          setSequence((current) => Math.max(current, event.sequence))
          if (event.domain === "selection") {
            setSelectedId(event.blockId ?? null)
          } else if (event.domain === "content" || event.domain === "view") {
            await refresh()
          }
        },
        onError: (cause) => {
          if (!mountedRef.current) return
          setError(cause.message)
          setConnection("offline")
        },
      })
      void refresh()
    } catch (cause) {
      setConnection("offline")
      setError(cause instanceof Error ? cause.message : String(cause))
    }

    return () => {
      mountedRef.current = false
      watcher?.stop()
      clientRef.current = null
    }
  }, [refresh])

  return {
    blocks,
    selectedId,
    completeness,
    sequence,
    connection,
    target,
    error,
    refresh,
    select,
  }
}
