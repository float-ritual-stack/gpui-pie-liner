# Agent workspace control

Anything the visible workspace can do is represented as a serializable command. The native app exposes those commands over a local JSON-lines Unix socket; the CLI uses the same protocol and writes the persisted layout directly when the app is closed.

There is no approval layer. Invalid IDs and structurally invalid operations fail; valid local workspace operations execute immediately.

## Inspect

```sh
bun run pie layout get
```

The response includes the complete split tree, panes, tab order, active tabs, split IDs, ratios, kinds, titles, and targets.

## Tabs

```sh
bun run pie tab create \
  --pane main \
  --id investigation \
  --kind empty \
  --title "Investigation"

bun run pie tab activate --pane main --tab investigation
bun run pie tab move --tab investigation --from main --to outline --index 0
bun run pie tab close --pane outline --tab investigation
```

Supported kinds:

```text
outline
block-detail
tmd-document
empty
```

A `.tmd` tab can carry a target:

```sh
bun run pie tab create \
  --pane main \
  --kind tmd-document \
  --title "Outliner picker" \
  --target builtin:outliner-picker
```

## Panes and splits

```sh
bun run pie pane split \
  --pane main \
  --direction down \
  --id research \
  --kind empty \
  --title "Research"

bun run pie pane resize --split split-root --ratio 0.4
bun run pie pane move --pane research --target-pane outline --direction right
bun run pie pane close --pane research --move-tabs-to main
```

Directions are `left`, `right`, `up`, and `down`. Ratios are clamped to `0.1..0.9` so neither side becomes unreachable.

## Generic command

New protocol commands do not require a matching CLI wrapper before agents can use them:

```sh
bun run pie layout send '{"action":"pane.resize","splitId":"split-root","ratio":0.35}'
```

## Canonical block editing

The visible Detail editor and agents both use the outliner service's optimistic `update` action:

```sh
bun run pie block list
bun run pie block get --id <uuid>
bun run pie block select --id <uuid>
printf 'replacement canonical text' | bun run pie block update --id <uuid> --stdin
```

`block update` reads the current `updatedAt` and submits it as `expectedUpdatedAt`. Pass `--expected <timestamp>` when the caller already holds a version and wants a real stale-write check. Conflicts fail without replacing the local draft.

## Persistence and lifecycle

Default paths:

```text
~/.local/state/gpui-pie-liner/workspace-layout.json
~/.local/state/gpui-pie-liner/control.sock
```

Override both with:

```sh
GPUI_PIE_STATE_DIR=/path/to/state bun run dev
```

Or override only the socket:

```sh
GPUI_PIE_CONTROL_SOCKET=/path/to/control.sock bun run dev
```

When the app is running, commands update the live React workspace through `useSyncExternalStore`. When it is closed, the CLI applies the same reducer to the persisted layout; the next launch opens that state.
