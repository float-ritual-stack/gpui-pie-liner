# GPUI Pie Liner

Native GPUIX spike for a persistent block outliner and safe interpreted `.tmd` document surfaces.

## Run

```sh
bun install
bun run dev
```

The current vertical slice renders:

- the existing `pi-herdr-outliner` service's canonical physical graph;
- reactive content and shared-selection updates over its JSON-lines Unix socket;
- keyboard-first Tree navigation and collapse behavior;
- contextual identity chrome: titles/Work IDs in Tree, full UUID in Detail;
- a fixture fallback when no service is available;
- a native Markdown Detail surface with optimistic raw-text editing, `⌘S`/`Ctrl+S`, conflict preservation, and drafts retained across tab switches;
- an interpreted `.tmd` picker using Markdown, `::select`, `:::box`, bindings, and named key actions;
- safe validation before mount and static receipt generation.

## Service discovery

The app uses the first explicit option, or discovers one active local socket:

```sh
OUTLINER_SOCKET=/path/to/outliner.sock bun run dev
OUTLINER_WORKSPACE_ROOT=/path/to/workspace bun run dev
bun run dev # succeeds automatically when exactly one local service socket exists
```

When multiple sockets exist, set one of the explicit variables rather than allowing the app to guess.

## Agent and CLI workspace control

Tabs, panes, splits, movement, activation, closing, and resizing use one serializable command model shared by the UI and agents:

```sh
bun run pie layout get
bun run pie tab create --pane main --kind empty --title "Investigation"
bun run pie pane split --pane main --direction down --id research --kind empty --title "Research"
bun run pie pane resize --split split-root --ratio 0.4
```

Commands update the live app over its local socket, or update persisted layout directly while the app is closed. Block reads, selection, and optimistic updates are exposed through the same CLI:

```sh
bun run pie block get --id <uuid>
printf 'replacement text' | bun run pie block update --id <uuid> --stdin
```

See [`docs/AGENT_CONTROL.md`](docs/AGENT_CONTROL.md).

## Verify

```sh
bun run typecheck
bun test
```

Architecture and delivery plan: [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md).

## Dogfood project state

The live plan is also represented in the outliner under canonical block:

```text
7f866212-9e96-40b7-bb7c-5f3bc794c393 · GPUI Pie Liner
```

Project blocks use `[project::gpui-pie-liner]` plus typed metadata such as `type`, `status`, `work-stage`, `priority`, and `decision-area`. `Next GPUI Pie Liner work` is a virtual branch over:

```text
project=gpui-pie-liner work-stage=next
```

Keep active state and small decisions current there while retaining deep architecture detail in this repository.
