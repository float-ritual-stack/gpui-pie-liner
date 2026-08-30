import { useSyncExternalStore } from "react"
import {
  getWorkspaceRuntime,
  type WorkspaceLayoutCommand,
} from "../../../packages/workspace-layout"

const runtime = getWorkspaceRuntime()
void runtime.starting.catch((error) => {
  console.error(`[gpui-pie-liner] workspace control server failed: ${String(error)}`)
})

export function useWorkspaceLayout() {
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
