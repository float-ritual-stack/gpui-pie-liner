import { useEffect, useSyncExternalStore } from "react"
import {
  getWorkspaceRuntime,
  type WorkspaceLayoutCommand,
} from "../../../packages/workspace-layout"

const runtime = getWorkspaceRuntime()
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
      return runtime.store.dispatch(command)
    },
  }
}
