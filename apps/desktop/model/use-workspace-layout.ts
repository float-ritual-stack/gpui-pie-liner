import { useEffect, useSyncExternalStore } from "react"
import {
  getWorkspaceRuntime,
  type WorkspaceLayoutCommand,
  type WorkspaceLayoutStore,
} from "../../../packages/workspace-layout"

const runtime = getWorkspaceRuntime()

export function dispatchWorkspaceCommandFromUi(store: WorkspaceLayoutStore, command: WorkspaceLayoutCommand) {
  try {
    return store.dispatch(command)
  } catch (error) {
    console.error(`[gpui-pie-liner] rejected workspace command ${command.action}: ${error instanceof Error ? error.message : String(error)}`)
    return store.getSnapshot()
  }
}

export function useWorkspaceLayout() {
  useEffect(() => {
    const timer = setInterval(() => runtime.store.refreshFromDisk(), 50)
    return () => clearInterval(timer)
  }, [])
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
    runtime.store.getSnapshot,
  )
  return {
    state,
    dispatch(command: WorkspaceLayoutCommand) {
      return dispatchWorkspaceCommandFromUi(runtime.store, command)
    },
  }
}
