import { describe, expect, test, vi } from "vitest"
import { updateBlockAndSnapshot } from "../apps/desktop/model/use-outliner-workspace"

describe("outliner workspace updates", () => {
  test("rejects when the post-update snapshot fails", async () => {
    const refreshFailure = new Error("Snapshot unavailable")
    const request = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(refreshFailure)

    await expect(updateBlockAndSnapshot(
      { request },
      "block-id",
      "Updated text",
      "version-1",
    )).rejects.toBe(refreshFailure)
    expect(request).toHaveBeenNthCalledWith(1, {
      action: "update",
      blockId: "block-id",
      text: "Updated text",
      expectedUpdatedAt: "version-1",
    })
    expect(request).toHaveBeenNthCalledWith(2, { action: "workspace.snapshot" })
  })
})
