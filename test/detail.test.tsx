import { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { connectTest } from "@gpuix/react/automation"
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing"
import {
  Detail,
  initialDetailEditorState,
  type DetailEditorState,
} from "../apps/desktop/components/detail"

const describeNative = hasNativeTestRenderer ? describe : describe.skip
const session = {
  id: "full-canonical-guid",
  title: "Editable block",
  summary: "Summary",
  rawText: "Original text",
  updatedAt: "version-1",
}

function deferred() {
  return Promise.withResolvers<void>()
}

function Harness({ onSave }: { onSave: Parameters<typeof Detail>[0]["onSave"] }) {
  const [editor, setEditor] = useState<DetailEditorState>(() => initialDetailEditorState(session))
  return (
    <Detail
      session={session}
      editor={editor}
      onEditorChange={setEditor}
      onOpenDocument={() => undefined}
      onSave={onSave}
    />
  )
}

function RetainedHarness() {
  const [editor, setEditor] = useState<DetailEditorState>(() => initialDetailEditorState(session))
  const [visible, setVisible] = useState(true)
  return (
    <div>
      <div testId="toggle-detail" onClick={() => setVisible((current) => !current)}>toggle</div>
      {visible ? (
        <Detail
          session={session}
          editor={editor}
          onEditorChange={setEditor}
          onOpenDocument={() => undefined}
          onSave={async () => undefined}
        />
      ) : null}
    </div>
  )
}

describeNative("Detail optimistic editing", () => {
  test("saves with the captured version and returns to preview", async () => {
    const save = vi.fn(async () => undefined)
    const root = createTestRoot()
    root.render(<Harness onSave={save} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("edit-block").click()
    await app.getByTestId("detail-editor").fill("Updated text")
    await app.getByTestId("save-block").click()
    for (let attempt = 0; attempt < 20 && root.renderer.findByTestId("detail-editor"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    expect(save).toHaveBeenCalledWith(session, "Updated text", "version-1")
    expect(root.renderer.findByTestId("detail-editor")).toBeUndefined()
    expect(root.renderer.getPaintedText()).toContain("Original text")
  })

  test("preserves a newer draft when a pending save resolves", async () => {
    const pending = deferred()
    const root = createTestRoot()
    root.render(<Harness onSave={() => pending.promise} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("edit-block").click()
    await app.getByTestId("detail-editor").fill("Submitted draft")
    await app.getByTestId("save-block").click()
    await app.getByTestId("detail-editor").fill("Newer draft")
    pending.resolve()
    await vi.waitFor(() => {
      expect(root.renderer.findByTestId("detail-editor")?.customProps?.value).toBe("Newer draft")
    })
  })

  test("preserves a newer draft when a pending save rejects", async () => {
    const pending = deferred()
    const root = createTestRoot()
    root.render(<Harness onSave={() => pending.promise} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("edit-block").click()
    await app.getByTestId("detail-editor").fill("Submitted draft")
    await app.getByTestId("save-block").click()
    await app.getByTestId("detail-editor").fill("Newer draft")
    pending.reject(new Error("Block changed since editing began"))
    await app.getByText("Block changed since editing began").waitFor()

    expect(root.renderer.findByTestId("detail-editor")?.customProps?.value).toBe("Newer draft")
  })

  test("retains a draft when its tab subtree unmounts", async () => {
    const root = createTestRoot()
    root.render(<RetainedHarness />)
    const app = await connectTest(root.renderer)
    await app.getByTestId("edit-block").click()
    await app.getByTestId("detail-editor").fill("Retained across tabs")
    await app.getByTestId("toggle-detail").click()
    await app.getByTestId("toggle-detail").click()
    await app.getByTestId("detail-editor").waitFor()
    expect(root.renderer.findByTestId("detail-editor")?.customProps?.value).toBe("Retained across tabs")
  })

  test("preserves the draft and displays an optimistic conflict", async () => {
    const save = vi.fn(async () => {
      throw new Error("Block changed since editing began")
    })
    const root = createTestRoot()
    root.render(<Harness onSave={save} />)
    const app = await connectTest(root.renderer)

    await app.getByTestId("edit-block").click()
    await app.getByTestId("detail-editor").fill("Unsaved local draft")
    await app.getByTestId("save-block").click()
    await app.getByText("Block changed since editing began").waitFor()

    expect(root.renderer.findByTestId("detail-editor")).toBeDefined()
    expect(root.renderer.getPaintedText()).toContain("Block changed since editing began")
  })
})
