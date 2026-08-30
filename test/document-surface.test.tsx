import { describe, expect, test, vi } from "vitest"
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing"
import { DocumentSurface } from "../apps/desktop/documents/render-document"

const describeNative = hasNativeTestRenderer ? describe : describe.skip

const source = `# Picker

::select{source="$sessions" label="title" value="id" action="session.open"}

:::box{title="Selected"}
**{{ selected.title }}**
:::

::key{key="r" action="sessions.refresh"}
::key{key="escape" action="document.close"}
`

describeNative("GPUIX .tmd surface", () => {
  test("mounts native Markdown, Select, Box, and named key actions", () => {
    const refresh = vi.fn()
    const close = vi.fn()
    const { render, renderer } = createTestRoot()
    render(
      <DocumentSurface
        source={source}
        data={{
          sessions: [{ id: "one", title: "First", summary: "Ready" }],
          selected: { id: "one", title: "First", summary: "Ready" },
        }}
        registry={{
          version: "test",
          actions: {
            "session.open": vi.fn(),
            "sessions.refresh": refresh,
            "document.close": close,
          },
        }}
        onClose={close}
      />,
    )

    expect(renderer.getPaintedText()).toContain("Picker")
    expect(renderer.getPaintedText()).toContain("First")
    expect(renderer.findByTestId("tmd-select-trigger")).toBeDefined()

    const surface = renderer.findByTestId("tmd-surface")
    expect(surface).toBeDefined()
    renderer.nativeSimulateKeystrokes(surface!.id, "r")
    renderer.nativeSimulateKeystrokes(surface!.id, "escape")
    expect(refresh).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
