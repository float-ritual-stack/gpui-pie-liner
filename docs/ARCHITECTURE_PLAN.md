# GPUI Pie Liner — architecture plan

## Recommendation

Build this as a **single native GPUIX window backed by a separate Bun/SQLite service**.

Do not port the terminal pane topology. Preserve the outliner's domain model, query semantics, canonical block graph, optimistic mutations, and agent-facing RPC. Replace Tree and Detail processes with two React surfaces inside one GPUIX window.

```text
┌──────────────────────── GPUIX desktop process ────────────────────────┐
│ App shell                                                             │
│  ├─ filter/command bar                                                │
│  ├─ TreeSurface (flattened physical + projected occurrence rows)      │
│  ├─ resizable divider                                                 │
│  └─ DetailSurface (Markdown preview / native textarea editor)         │
│                                                                      │
│ WorkspaceClient → query cache → React application model               │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ JSON-lines RPC + event subscription
┌──────────────────────────────▼─────────────────────────────────────────┐
│ Bun service                                                           │
│ normalized queries · canonical mutations · subscriptions · SQLite     │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
                    workspace-scoped SQLite database

External clients: CLI · Pi/OMP tools · future launchers
```

The service should remain out-of-process because:

- agents and the CLI need the workspace when the window is closed;
- GPUIX hot reload remounts React and must not own persistence lifetime;
- one process remains the SQLite writer and event sequencer;
- a UI crash cannot corrupt or strand in-memory canonical state.

## What to preserve from `pi-herdr-outliner`

### Load-bearing invariants

1. **One canonical block graph.** A projected row points to a canonical block; it is not copied content.
2. **Service-owned persistence.** The UI owns presentation state only.
3. **Stable occurrence identity.** Use `blockId` for physical rows and `occurrence:<viewId>:<blockId>` for projections.
4. **Optimistic mutations.** Save using `expectedUpdatedAt`; keep the editor buffer on conflict.
5. **Bounded reads.** Every result reports `complete` or `truncated`; the UI never treats truncation as absence.

### Presentation state that belongs in the desktop process

- selected occurrence, not only selected canonical ID;
- collapsed physical block IDs;
- expanded multiline occurrence IDs;
- active filter and in-progress filter draft;
- tree scroll anchor/window;
- divider position and detail visibility;
- Detail preview/edit mode and unsaved buffer;
- per-window navigation history.

The canonical workspace-context selection remains service-owned so agents and external clients can see it.

## Filter semantics: preserve these exactly

The existing filter language is deliberately small:

```text
priority
status=open
status::"in progress"
status=open project=pie priority
```

| Input | Meaning |
|---|---|
| `key` | property is present |
| `key=value` | case-insensitive exact property value |
| `key::value` | same equality operation; accepted authoring syntax |
| whitespace | positive AND between clauses, except inside quotes |
| `"..."` | value containing spaces; only `\\` and `\"` escapes |

Explicit non-features are OR, NOT, grouping, ranges, aggregation, sorting, and reference traversal. `and`, `or`, and `not` are rejected as keys rather than silently misread.

### Normalization contract

Keep `BlockSearchQuery` as the sole semantic query shape:

```ts
interface BlockSearchQuery {
  filters?: Array<{ key: string; value?: string }>
  text?: string
  subtreeRootId?: string
  rankViewId?: string
  includeDeleted?: "roots" | "all"
  limit: number
}
```

Normalization must continue to:

- require an integer limit from 1 through 1000, never clamp;
- lowercase and validate property keys;
- trim only outer value whitespace while preserving interior spaces;
- compare equality values case-insensitively;
- remove exact duplicate clauses;
- translate legacy `deleted=true` into `includeDeleted: "roots"`;
- keep text, subtree, deletion mode, ranking context, and limit out of the human property-expression grammar.

### Important behavior in the existing implementation

A normal filtered snapshot walks the canonical graph in preorder and returns **matching blocks only**. It does not include nonmatching ancestors merely to provide context. Each result retains its canonical depth.

A ranked virtual-branch query is different: it orders rows with persisted branch-local ranks first, then unranked rows in deterministic canonical order. The rank changes only that branch's projection.

Most ordinary queries currently load the complete graph and property index into memory before matching. Only ranked branch queries use SQL predicates directly. Preserve semantics first; optimize execution only after profiling realistic workspaces.

## Filter UX for GPUIX

Use one filter model, not separate ad hoc logic for the toolbar, virtual branches, and agents.

```ts
interface FilterState {
  appliedExpression: string
  draftExpression: string
  parsedFilters: PropertyFilter[] | null
  syntaxError: { message: string; index: number } | null
  completion: FilterCompletion | null
  requestGeneration: number
}
```

### Interaction

1. `/` or `⌘K` focuses the filter input with the current expression.
2. Parse on each edit for immediate diagnostics and completion targeting.
3. Apply only the latest syntactically valid draft after a short debounce, or immediately on Enter.
4. Escape restores the last applied expression; a second Escape clears the applied filter.
5. Show `N results` plus a visible `truncated at N` badge when incomplete.

A syntax error should underline or mark the character position returned by `BlockQuerySyntaxError`. Invalid input must never become an accidental broad or empty query.

### Completion

Reuse the existing cursor-aware `filterCompletionTargetAtCursor` behavior:

- before a separator, query the property catalog for keys;
- after `=` or `::`, query values for the normalized key;
- replace only the current clause range;
- render counts beside candidates;
- serialize spaced/escaped values through `serializePropertyFilterValue`.

Use GPUIX's headless `Combobox`/anchored layer for the completion popup. Keep the list bounded and avoid placing a nested vertical scroller inside another scrolling surface.

### Graphical context improvement

The filtered list can show a compact breadcrumb above or beside each match. That adds context without inserting fake ancestor rows or changing query semantics. Selection and mutations still target the canonical block.

## Virtual branches in the desktop app

Virtual branches remain canonical blocks configured by text properties:

```text
[type::virtual-branch]
[query::status="in progress" project=pie]
[limit::20]
[create::status="in progress"]
[create-parent::<uuid>]
```

Rules to retain:

- exactly one `type=virtual-branch` and one `query` token;
- default limit 200, maximum 1000;
- invalid query configuration produces an inline diagnostic and no query;
- missing or invalid creation configuration makes the branch read-only;
- creating under a writable branch creates a canonical child under `create-parent` and patches the configured property;
- occurrences cannot indent, outdent, collapse, or own children;
- editing/deleting an occurrence targets its canonical block;
- branch-local reorder persists occurrence ranks without changing canonical sibling order;
- exclude the branch definition itself and duplicate canonical matches before applying the visible limit.

### Projection pipeline

```text
complete physical snapshot
  ├─ prune locally collapsed physical descendants
  ├─ identify visible virtual-branch definitions
  ├─ parse each branch config
  ├─ query valid, expanded branches in parallel
  ├─ apply branch-local ranks and limits
  └─ splice occurrence rows immediately after each definition
```

Add a cache keyed by `{ serviceSequence, normalizedQuery, rankViewId }`. Ignore responses whose request generation is older than the current filter/snapshot generation. This prevents rapid filter edits from painting stale rows and avoids re-querying identical branches during unrelated React state changes.

## Proposed repository shape

```text
gpui-pie-liner/
  apps/
    desktop/
      app.tsx
      components/
        app-shell.tsx
        filter-bar.tsx
        tree-surface.tsx
        tree-row.tsx
        detail-surface.tsx
        status-bar.tsx
        ui/                 # styled GPUIX Select/Combobox/Tooltip wrappers
      model/
        workspace-store.ts
        selection-model.ts
        filter-model.ts
        projection-cache.ts
      automation/
  packages/
    domain/
      block-query.ts
      properties.ts
      virtual-branches.ts
      references.ts
      types.ts
    protocol/
      messages.ts
      client.ts
    service/
      store.ts
      server.ts
      migrations.ts
      main.ts
    cli/
  docs/
    ARCHITECTURE_PLAN.md
```

Start by extracting/copying the tested pure modules and their tests from `pi-herdr-outliner`. Do not import files across repository boundaries long-term. Keep protocol types in a package consumed by the desktop, service, CLI, and agent adapter.

## Desktop application model

Use a small external workspace store exposed through `useSyncExternalStore`, rather than putting the complete snapshot into one top-level React `useState`.

```ts
interface WorkspaceViewState {
  sequence: number
  physicalById: ReadonlyMap<string, VisibleBlock>
  rows: readonly TreeRow[]
  branchStates: ReadonlyMap<string, VirtualBranchState>
  completeness: BlockCollectionCompleteness
  selectedRowId: string | null
  workspaceContextBlockId: string | null
  connection: "connecting" | "ready" | "offline"
}
```

Responsibilities:

- connect, subscribe, and reconnect to the service;
- coalesce content events into one snapshot refresh;
- discard snapshot/query responses older than the latest generation;
- preserve row identity and local selection across refreshes;
- publish canonical selection only when the selected canonical ID changes;
- keep an edit buffer stable while marking incoming content as pending;
- expose typed commands rather than allowing components to issue arbitrary RPC.

Split subscriptions so `TreeSurface`, `DetailSurface`, and the filter bar do not all rerender when unrelated state changes.

Workspace layout control uses persisted layout as its cross-process arbiter. CLI commands take an interprocess lock, rebase on the latest snapshot, and atomically persist; the native app observes external changes on a 50 ms cadence. This replaced an app-owned control socket after native GPUIX smoke testing showed connections opening while post-mount server data callbacks were not pumped reliably. Agent control therefore does not depend on the window process serving requests.

## GPUIX rendering plan

### App shell, tabs, and panels

Removing Herdr removes **process/pane orchestration**, not tabs, panels, splits, or workspaces. Those become application-owned layout rather than terminal-multiplexer-owned layout.

The initial shell has:

- transparent or standard titlebar;
- top toolbar/filter bar;
- resizable Tree and workspace panels;
- a workspace tab strip for Block Detail and `.tmd` documents;
- draggable dividers implemented with `onMouseDown`, `onMouseMove`, and `onMouseUp` on the same element;
- bottom/status chrome for connection, result completeness, conflicts, and branch errors.

The scalable layout model should be explicit and serializable:

```ts
type LayoutNode =
  | { kind: "split"; axis: "horizontal" | "vertical"; ratio: number; first: LayoutNode; second: LayoutNode }
  | { kind: "tabs"; activeId: string; tabs: WorkspaceTab[] }
  | { kind: "panel"; panelId: "outline" | "references" | "properties" | "agent" }

interface WorkspaceTab {
  id: string
  kind: "block-detail" | "tmd-document" | "file" | "search"
  title: string
  target?: string
}
```

React may render only the active tab, but tab state lives outside the mounted subtree so switching tabs does not lose editor drafts, scroll anchors, or navigation state.

GPUIX supplies the primitives rather than a complete dock manager: flex layout, stable focus handles, pointer capture, overlays, cursors, motion, and virtual lists. If freeform drag-and-drop docking becomes load-bearing, evaluate a narrow native bridge or a compatible port from `gpui-component`; do not block ordinary tabs and resizable splits on that decision.

No multiplexer registry or external pane placement is needed. `focusElement()` and refs replace Herdr focus commands.

### Scrolling rules for panels

- Each sibling panel may own one top-level vertical scroller.
- Never nest a vertical `overflow: "scroll"`, `<virtual-list>`, or scrolling `<diff>` inside another vertical scroller; GPUI sends the same wheel event to both hitboxes.
- Horizontal scrolling is allowed inside a vertical pane when restricted to the X axis.
- Frozen headers or panes that must move pixel-perfectly together cannot follow a native scroll callback one frame later. React owns their offset and translates memoized/cut-down child layers.
- A real overlay uses anchored/deferred rendering and `pointerEvents: "auto"` so wheel input does not reach an unrelated pane behind it.
- Long Tree/results surfaces use `<virtual-list>` with stable keyed row roots; very large sets also use `itemCount`, `windowStart`, and an application-owned React window.

### Tree

Use `<virtual-list>` with stable keyed row roots. For large workspaces, use `itemCount`, `windowStart`, `estimatedItemHeight`, and `onVisibleRange`, rendering a bounded React slice.

When a filter changes the item count, explicitly reset/widen the React window; GPUIX intentionally provides no generic `VirtualList` wrapper because only the app knows that the collection changed.

Tree rows should support:

- disclosure icon and indentation for physical rows;
- diamond marker and branch styling for occurrences;
- selected, hovered, agent-authored, deleted, and conflict states;
- inline single-line edit with native `<input>`;
- multiline expansion in-flow, never as a nested vertical scroller;
- first-class keyboard navigation: Up/Down, Home/End, Left/Right parent/collapse/child behavior, Space toggle, Enter Detail, and later reorder/indent commands;
- mouse selection without making keyboard navigation secondary.

Canonical identity is **contextual chrome**, not a permanent subtitle. Tree rows show the human title and an assigned Work ID when one exists. The full UUID appears in Detail, properties/inspect surfaces, copy-link actions, conflicts, ambiguous search results, and destructive confirmations—places where exact identity carries information. It does not consume a line beneath every row.

### Detail

> **Initial optimistic editor shipped 2026-08-30:** raw canonical textarea, captured `updatedAt`, `⌘S`/`Ctrl+S`, preserved conflict drafts, externally retained per-block editor state across tab unmounts, and matching agent CLI updates.

Use sibling panes, each with its own top-level scrolling surface; GPUIX's restriction is nested scrolling, not separate sibling scrollers.

- preview: native `<markdown>` inside one Detail scroll parent;
- edit: native `<textarea>` with controlled canonical raw text;
- save: optimistic `expectedUpdatedAt` update;
- conflict: preserve the draft and offer reload/copy/overwrite only through explicit actions;
- links: route exact block/page references through the workspace command layer.

Start without file annotation editing. Add it after block preview/edit and filter behavior are stable.

### Keyboard routing

Give the Tree root a persistent focus handle. Route keys through a mode-aware command dispatcher:

```text
browse → tree/navigation commands
filter input → filter editor + completion commands
inline input → text editor commands
Detail textarea → native editing commands
modal/overlay → overlay commands, then restore prior focus
```

Do not duplicate terminal key parsing. Define semantic commands (`MoveSelectionDown`, `BeginFilter`, `IndentBlock`) and map native GPUIX key events to them.

## Can `gpui-component` be used with GPUIX?

### Directly: no

`gpui-component` is a Rust GPUI component framework. GPUIX application code renders a fixed React host-element protocol (`div`, `text`, `input`, `textarea`, `anchored`, `virtual-list`, `markdown`, and related native elements). A Rust `Button`, `DockArea`, or `Input` is not a React component and cannot be imported into TypeScript.

The local clones also target different GPUI revisions:

- GPUIX pins its `remorses/zed` submodule at `8b94defe…`;
- the current `gpui-component` lockfile resolves Zed/GPUI at `f66ed399…`.

Two incompatible GPUI versions cannot safely share one window/entity graph.

### Technically possible: custom native host elements

A specific `gpui-component` widget could be exposed by:

1. rebasing/forking `gpui-component` onto GPUIX's exact GPUI fork;
2. initializing `gpui-component` in the GPUIX native host;
3. adding a retained-tree host type and serialized prop/event contract;
4. adapting the Rust widget's entity, focus, theme, and lifecycle to stable React host IDs;
5. adding N-API/test-renderer/automation coverage.

That is framework integration work, not ordinary application composition. It also increases GPUIX fork maintenance.

### Recommendation

For v1, use GPUIX's headless `Select`, `Combobox`, and `Tooltip`, then build local styled wrappers. Recreate buttons, badges, dividers, dialogs, and menus from GPUIX primitives.

Consider a custom Rust bridge only for a capability that is genuinely expensive to recreate—most plausibly the `gpui-component` code editor or dock layout. The outliner needs neither for its first useful release: a two-pane flex layout and GPUIX's native textarea are sufficient.

Use `gpui-component` as a design and interaction reference, not a runtime dependency.

## Delivery plan

### Phase 1 — vertical slice (2–3 days)

- scaffold Bun + React + GPUIX app;
- run/connect to a headless service and open a workspace database;
- render physical rows in a virtual list;
- select with mouse/keyboard and show Markdown Detail;
- add native textarea editing with optimistic save.

**Exit:** one native window can browse and edit the same canonical blocks as the CLI.

### Phase 2 — filters and projections (3–4 days)

- port query parser/normalizer tests unchanged;
- implement filter bar, positioned diagnostics, catalog completion, and completeness badges;
- port virtual-branch parsing/projection tests unchanged;
- render occurrences, branch errors, read-only state, create-under-branch, and branch-local reorder;
- add stale-response generations and query cache.

**Exit:** filter and virtual-branch behavior matches `pi-herdr-outliner` semantically.

### Phase 3 — outliner interactions (3–5 days)

- collapse, add child/sibling, indent/outdent, reorder, delete/restore;
- occurrence-aware selection fallback after mutations;
- goto, references, back/forward history, quick capture;
- resizable panes and focus restoration.

**Exit:** the native app can replace the terminal Tree/Detail pair for daily use.

### Phase 4 — agent/external integration (2–3 days)

- package shared protocol types;
- retain CLI and Pi/OMP tools against the same service;
- route external reveal/edit/focus commands into the single window;
- verify selection context and conflict behavior across simultaneous human/agent edits.

**Exit:** human and agents collaborate through one canonical substrate without Herdr.

### Later, only after dogfood

- file viewer and line annotations;
- page/work-ID link creation and richer completion;
- native menus and command palette polish;
- SQL query optimization for large workspaces;
- optional custom Rust host element spike for advanced editor/docking.

## Verification strategy

### Pure/domain tests

Port the existing tests for:

- filter parsing, quoting, escapes, normalization, diagnostics, and completion ranges;
- property parsing/patching;
- virtual-branch config, projection identity, rank isolation, limits, and creation text;
- selection fallback and optimistic conflict behavior.

### Service contract tests

- desktop and CLI receive identical results for the same structured query;
- every bounded query reports completeness;
- event sequence advances atomically with mutations;
- reconnect reconstructs canonical state without overwriting local drafts;
- old response generations never replace newer filter results.

### GPUIX tests

Use `createTestRoot()` for component and keyboard behavior, then real-window automation for a small smoke suite:

- enter `status="in progress" project=pie` and verify exact rows;
- malformed quote shows the expected character-position diagnostic and does not apply;
- key/value completion replaces only the active clause;
- the same canonical block can appear physically and in two branches with three row identities;
- editing one occurrence updates all occurrences after the service event;
- filtering from many rows to few resets the virtual-list window correctly;
- Detail editing survives an unrelated content event and reports a real conflict on save.

Add a 10,000-row performance fixture. Measure first mount, filter application, chrome updates, and scroll separately with `renderer.flush()` included for paint timings.

## Declarative `.tmd` document spike

> **Initial spike shipped 2026-08-30:** parser, positioned validation, safe text/typed bindings, named actions and keys, static receipts, native Markdown/Select/Box rendering, GPUIX test-renderer coverage, and a reactive client for the existing outliner service's physical graph and shared selection. Canonical create/edit/move mutations remain the next vertical slice.

A small interpreted document layer is a strong companion spike for the GPUIX outliner. It should share the safe language and compiler concepts being explored for Pi, while using a **GPUIX-specific mount adapter**.

The target is not JSX, MDX, or a general application framework:

> A safe interpreted document language for declaring GPUIX component trees and invoking host-provided capabilities.

### GPUIX pipeline

```text
.tmd source
  ├─ Markdown          prose
  ├─ directives        components/layout
  ├─ {{ bindings }}    inert data lookup
  └─ named actions     host capabilities
        │
        ▼
parse → DocumentAst
        │
        ▼
validate → ValidatedDocument
        │
        ▼
render adapter → React element tree
        │
        ▼
GPUIX document surface inside the existing native window
```

Unlike Pi's `ctx.ui.custom()` surface, the GPUIX host already owns a React root. A document opens as a dedicated Detail tab, modal/anchored overlay, or later a document route. React should remain responsible for component lifecycle and reconciliation.

### Share the compiler, not the mounted component contract

The parser, AST, validator, binding resolver, action declarations, diagnostics, persistence envelope, and conformance fixtures can be runtime-neutral and shared conceptually with the Pi experiment.

Do **not** force Pi's imperative `MountedNode` directly onto GPUIX:

```ts
// Useful at the Pi boundary, but unnecessary as the primary GPUIX contract.
interface MountedNode {
  component: Component
  update?(props: unknown): void
  handleInput?(data: string): boolean
  setFocused?(focused: boolean): void
  dispose?(): void
}
```

React already supplies update and disposal semantics. The GPUIX boundary should be declarative:

```ts
interface GpuixDocumentComponent<Props> {
  name: string
  schema: ComponentSchema<Props>
  render(props: Props, context: DocumentRenderContext): React.ReactNode
}

interface DocumentRenderContext {
  data: unknown
  state: Readonly<Record<string, unknown>>
  dispatch(action: string, payload?: unknown): Promise<void>
  setState(patch: Record<string, unknown>): void
  close(): void
}
```

Only add an imperative mounted wrapper for a future native host element that genuinely needs one. Ordinary `box`, `select`, `hstack`, `vstack`, Markdown, input, and key bindings should remain normal React components.

### Initial language

The first fixture should stay intentionally small:

```md
# Outliner

::select{
  source="$sessions"
  label="title"
  value="id"
  action="session.open"
}

:::box{title="Selected"}
**{{ selected.title }}**

{{ selected.summary }}
:::

::key{key="r" action="sessions.refresh"}
::key{key="escape" action="document.close"}
```

Slice 1 supports only:

- Markdown chunks;
- `::select`;
- `:::box`;
- `::key` declarations;
- text bindings;
- typed `$name` data references;
- named host actions.

Slice 2 can add `hstack`, `vstack`, input, scroll regions, visibility, and repeated data. Fractional layout maps directly onto GPUIX flex styles:

```text
1fr → { flexBasis: 0, flexGrow: 1 }
2fr → { flexBasis: 0, flexGrow: 2 }
```

Keep one vertical scroll owner per document surface. A future `scroll` directive must be rejected when it would create a nested vertical scroller.

### Markdown/component interleaving

Do not ask GPUIX's native `<markdown>` element to understand directives. Parse the document into ordered block nodes:

```ts
type ValidatedNode =
  | { kind: "markdown"; source: CompiledTextTemplate }
  | { kind: "component"; component: string; props: ValidatedProps; children: ValidatedNode[] }
  | { kind: "key-binding"; key: string; action: string }
```

The adapter resolves each Markdown template to escaped Markdown text and renders it through `<markdown source={...} />`. Directive nodes become React components from the validated registry. Key nodes compile into document-level keymap metadata and do not render a visible element.

### Validation and diagnostics

Validation must complete before the document surface mounts. Diagnostics carry source ranges and remain compiler-like:

```text
line 14, column 3

Unknown action:
  session.destory

Did you mean:
  session.destroy
```

```text
line 8, column 5

Invalid property "grow" on ::select.

Allowed:
  source
  label
  value
  action
  visibleRows
```

Validate all of the following before render:

- known directive and action names;
- exact allowed properties per directive;
- required properties and property types;
- nesting rules;
- duplicate/conflicting key bindings;
- typed references versus text templates;
- vertical scroll ownership;
- optional action payload shape.

### Security boundary

`{{ path }}` is always inert text lookup, never expression evaluation.

```text
{{ selected.name }}
        ↓
resolve own-property path only
        ↓
reject __proto__ / prototype / constructor and functions
        ↓
convert approved scalar to text
        ↓
sanitize controls
        ↓
escape Markdown
        ↓
render as text
```

Typed component data is a separate grammar:

```text
source="$sessions"
```

A typed reference may resolve arrays or plain objects for an adapter. It cannot call functions, index arbitrary prototypes, execute JavaScript, interpolate inside another expression, or dynamically select an action.

Named actions are capabilities supplied by the host:

```ts
interface DocumentCapabilityRegistry {
  actions: Record<string, (event: DocumentActionEvent) => Promise<void> | void>
  components: Record<string, GpuixDocumentComponent<unknown>>
  version: string
}
```

A document cannot access RPC, the filesystem, environment variables, the renderer, or process APIs except through explicitly registered actions.

### State and persistence

The document runtime owns ephemeral controlled state such as selected values and input drafts. Actions update that store; React rerenders bindings and components without reparsing or remounting the whole document.

Use an explicit persistence envelope:

```ts
interface PersistedDocument {
  formatVersion: 1
  source: string
  state?: Record<string, unknown>
  snapshot?: Record<string, unknown>
  registryVersion: string
}
```

The host chooses whether each data source reopens live, from a durable snapshot, or from a mixture. Do not serialize the complete runtime data graph by default.

### Outliner integration

The first real document should be an **Outliner picker**, not a declarative rewrite of the entire app.

Host capabilities:

```text
sessions.refresh
session.select
session.open
document.close
```

Host data:

```ts
{
  sessions: Array<{ id: string; title: string; summary: string }>,
  selected: { id: string; title: string; summary: string } | null
}
```

Open the document from the GPUIX command bar or toolbar as an anchored/modal surface. `session.open` selects and reveals the canonical block/session through the ordinary workspace command layer. The document receives no direct service client.

A static receipt can be produced by rendering only resolved Markdown and a compact action/result summary. It is durable output, not an interactive surface pretending it still owns focus.

### Kill-test acceptance criteria

Implement the same picker twice:

1. handwritten React/GPUIX;
2. `.tmd` plus a small host capability registry.

Measure:

- document authoring LOC;
- host glue LOC;
- imperative state transitions;
- UI structure clarity;
- agent-safe modification quality;
- GPUIX lifecycle details exposed to the author;
- mount/update behavior under theme and data changes.

Keep the experiment only if the declarative version materially reduces application plumbing. A useful target is roughly 30 lines of `.tmd` plus 20 lines of capabilities versus about 100–150 lines of handwritten component and state wiring.

The spike passes when it:

- parses and validates before mounting;
- renders Markdown, select, box, and key declarations;
- updates selection without reparsing or remounting document state;
- survives theme invalidation;
- restores focus when closed;
- emits understandable static receipt data;
- rejects unknown actions, bad props, poison binding paths, and nested scrolling;
- runs under `createTestRoot()` with no renderer changes.

### Spike placement and estimate

Add this after the Phase 1 physical-tree vertical slice and before the complete filter UI: **1–2 days**.

```text
packages/document/
  ast.ts
  parse.ts
  validate.ts
  bindings.ts
  diagnostics.ts
  persistence.ts

apps/desktop/documents/
  registry.ts
  runtime-store.ts
  render-document.tsx
  components/
    box.tsx
    select.tsx
  fixtures/
    outliner-picker.tmd
```

Do not add a GPUIX native host element for the spike. If `div`, `<markdown>`, headless Select/Combobox, anchored layers, and document-level keyboard handling cannot support it, record that as the result rather than expanding the renderer mid-experiment.

## First implementation decision

Build against published `@gpuix/react` first, with the cloned GPUIX repository linked only when a renderer change is proven necessary. Do not fork GPUIX or integrate `gpui-component` during the vertical slice or the `.tmd` spike.
