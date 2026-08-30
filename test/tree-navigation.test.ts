import { describe, expect, test } from "vitest"
import { navigateTree, visibleTreeItems } from "../apps/desktop/model/tree-navigation"

const items = [
  { id: "root", parentId: null, depth: 0, children: true },
  { id: "first", parentId: "root", depth: 1 },
  { id: "second", parentId: "root", depth: 1, children: true },
  { id: "grandchild", parentId: "second", depth: 2 },
  { id: "after", parentId: null, depth: 0 },
]

describe("tree keyboard navigation", () => {
  test("moves through visible rows and supports home/end", () => {
    expect(navigateTree(items, "first", new Set(), "down").selectedId).toBe("second")
    expect(navigateTree(items, "first", new Set(), "up").selectedId).toBe("root")
    expect(navigateTree(items, "first", new Set(), "end").selectedId).toBe("after")
    expect(navigateTree(items, "after", new Set(), "home").selectedId).toBe("root")
  })

  test("collapses, expands, enters children, and returns to parents", () => {
    const collapsed = navigateTree(items, "root", new Set(), "left").collapsed
    expect([...collapsed]).toEqual(["root"])
    expect(visibleTreeItems(items, collapsed).map((item) => item.id)).toEqual(["root", "after"])
    expect(navigateTree(items, "root", collapsed, "right").collapsed.size).toBe(0)
    expect(navigateTree(items, "root", new Set(), "right").selectedId).toBe("first")
    expect(navigateTree(items, "first", new Set(), "left").selectedId).toBe("root")
  })

  test("Enter requests Detail without changing selection", () => {
    expect(navigateTree(items, "second", new Set(), "enter")).toMatchObject({
      selectedId: "second",
      openDetail: true,
    })
  })
})
