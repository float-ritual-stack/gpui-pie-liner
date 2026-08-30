export interface NavigableTreeItem {
  id: string
  parentId: string | null
  depth: number
  children?: boolean
}

export interface TreeNavigationResult {
  selectedId: string | null
  collapsed: ReadonlySet<string>
  openDetail: boolean
}

export function visibleTreeItems<T extends NavigableTreeItem>(
  items: readonly T[],
  collapsed: ReadonlySet<string>,
): T[] {
  const visible: T[] = []
  let hiddenBelowDepth: number | null = null
  for (const item of items) {
    if (hiddenBelowDepth !== null && item.depth > hiddenBelowDepth) continue
    hiddenBelowDepth = null
    visible.push(item)
    if (collapsed.has(item.id)) hiddenBelowDepth = item.depth
  }
  return visible
}

export function navigateTree(
  items: readonly NavigableTreeItem[],
  selectedId: string | null,
  collapsedInput: ReadonlySet<string>,
  key: string,
): TreeNavigationResult {
  const collapsed = new Set(collapsedInput)
  const currentIndex = Math.max(0, items.findIndex((item) => item.id === selectedId))
  const current = items[currentIndex]
  let nextId: string | null = current?.id ?? items[0]?.id ?? null
  let openDetail = false

  if (key === "up") nextId = items[Math.max(0, currentIndex - 1)]?.id ?? nextId
  else if (key === "down") nextId = items[Math.min(items.length - 1, currentIndex + 1)]?.id ?? nextId
  else if (key === "home") nextId = items[0]?.id ?? null
  else if (key === "end") nextId = items.at(-1)?.id ?? null
  else if (key === "enter") openDetail = true
  else if (key === "space" && current?.children) {
    if (!collapsed.delete(current.id)) collapsed.add(current.id)
  } else if (key === "left" && current) {
    if (current.children && !collapsed.has(current.id)) collapsed.add(current.id)
    else if (current.parentId) nextId = current.parentId
  } else if (key === "right" && current) {
    if (current.children && collapsed.delete(current.id)) {
      // The first Right expands. A second Right enters the first child.
    } else {
      const child = items.find((item) => item.parentId === current.id)
      if (child) nextId = child.id
    }
  }

  return { selectedId: nextId, collapsed, openDetail }
}
