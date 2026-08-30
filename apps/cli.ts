#!/usr/bin/env bun
import {
  sendWorkspaceCommand,
  WorkspaceLayoutStore,
  type SplitDirection,
  type WorkspaceLayoutCommand,
  type WorkspaceTabKind,
} from "../packages/workspace-layout"

const args = process.argv.slice(2)

function help(): never {
  console.log(`gpui-pie-liner workspace control

Usage:
  bun run pie layout get
  bun run pie layout reset
  bun run pie layout send '<command-json>'

  bun run pie tab create --pane <id> --kind <kind> --title <title> [--id <id>] [--target <target>] [--no-activate]
  bun run pie tab activate --pane <id> --tab <id>
  bun run pie tab close --pane <id> --tab <id>
  bun run pie tab move --tab <id> --from <pane> --to <pane> [--index <n>]

  bun run pie pane split --pane <id> --direction <left|right|up|down> [--id <id>] [--kind <kind> --title <title> --target <target>]
  bun run pie pane move --pane <id> --target-pane <id> --direction <left|right|up|down>
  bun run pie pane close --pane <id> [--move-tabs-to <id>]
  bun run pie pane resize --split <id> --ratio <0.1..0.9>

Tab kinds: outline, block-detail, tmd-document, empty

Every command goes directly to the running app's local Unix socket. There is no approval layer.`)
  process.exit(0)
}

function option(name: string, required = false): string | undefined {
  const index = args.indexOf(`--${name}`)
  const value = index >= 0 ? args[index + 1] : undefined
  if (required && (!value || value.startsWith("--"))) throw new Error(`Missing --${name}`)
  return value && !value.startsWith("--") ? value : undefined
}

function has(name: string): boolean {
  return args.includes(`--${name}`)
}

function direction(): SplitDirection {
  const value = option("direction", true)
  if (value !== "left" && value !== "right" && value !== "up" && value !== "down") {
    throw new Error(`Invalid direction: ${value}`)
  }
  return value
}

function tabKind(required = true): WorkspaceTabKind | undefined {
  const value = option("kind", required)
  if (value === undefined) return undefined
  if (value !== "outline" && value !== "block-detail" && value !== "tmd-document" && value !== "empty") {
    throw new Error(`Invalid tab kind: ${value}`)
  }
  return value
}

function commandFromArgs(): WorkspaceLayoutCommand {
  const [group, action] = args
  if (!group || group === "help" || group === "--help" || group === "-h") help()
  if (group === "layout") {
    if (action === "get") return { action: "layout.get" }
    if (action === "reset") return { action: "layout.reset" }
    if (action === "send") {
      const raw = args[2]
      if (!raw) throw new Error("layout send requires JSON")
      return JSON.parse(raw) as WorkspaceLayoutCommand
    }
  }
  if (group === "tab") {
    if (action === "create") {
      return {
        action: "tab.create",
        paneId: option("pane", true)!,
        tab: {
          id: option("id"),
          kind: tabKind()!,
          title: option("title", true)!,
          target: option("target"),
        },
        activate: !has("no-activate"),
      }
    }
    if (action === "activate") return { action: "tab.activate", paneId: option("pane", true)!, tabId: option("tab", true)! }
    if (action === "close") return { action: "tab.close", paneId: option("pane", true)!, tabId: option("tab", true)! }
    if (action === "move") {
      const rawIndex = option("index")
      return {
        action: "tab.move",
        tabId: option("tab", true)!,
        fromPaneId: option("from", true)!,
        toPaneId: option("to", true)!,
        ...(rawIndex === undefined ? {} : { index: Number(rawIndex) }),
      }
    }
  }
  if (group === "pane") {
    if (action === "split") {
      const kind = tabKind(false)
      const title = option("title")
      return {
        action: "pane.split",
        paneId: option("pane", true)!,
        direction: direction(),
        newPaneId: option("id"),
        ...(kind && title ? { tab: { kind, title, target: option("target") } } : {}),
      }
    }
    if (action === "move") {
      return {
        action: "pane.move",
        paneId: option("pane", true)!,
        targetPaneId: option("target-pane", true)!,
        direction: direction(),
      }
    }
    if (action === "close") {
      return {
        action: "pane.close",
        paneId: option("pane", true)!,
        moveTabsToPaneId: option("move-tabs-to"),
      }
    }
    if (action === "resize") {
      return {
        action: "pane.resize",
        splitId: option("split", true)!,
        ratio: Number(option("ratio", true)),
      }
    }
  }
  throw new Error(`Unknown command: ${args.join(" ")}`)
}

try {
  const command = commandFromArgs()
  let result
  try {
    result = await sendWorkspaceCommand(command)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error
    const store = new WorkspaceLayoutStore()
    result = store.dispatch(command)
    console.error("[gpui-pie-liner] app offline; updated persisted workspace layout directly")
  }
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
