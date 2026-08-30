import { describe, expect, test } from "vitest"
import {
  DocumentDiagnostic,
  parseDocument,
  renderStaticReceipt,
  renderTextTemplate,
  resolvePath,
  resolveTypedReference,
  validateDocument,
} from "../packages/document"

const registry = {
  version: "test-1",
  actions: new Set(["session.open", "sessions.refresh", "document.close"]),
}

const source = `# Outliner

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
`

describe(".tmd parser and validator", () => {
  test("parses interleaved Markdown, leaf directives, and containers", () => {
    const ast = parseDocument(source)
    expect(ast.nodes.map((node) => node.kind === "markdown" ? "markdown" : node.name)).toEqual([
      "markdown",
      "select",
      "box",
      "key",
      "key",
    ])
    const box = ast.nodes[2]
    expect(box).toMatchObject({ kind: "directive", name: "box", attributes: { title: "Selected" } })
    if (box?.kind !== "directive") throw new Error("Expected box")
    expect(box.children).toHaveLength(1)
  })

  test("compiles named actions and key declarations before mount", () => {
    const document = validateDocument(parseDocument(source), registry)
    expect(document.keyBindings).toEqual(new Map([
      ["r", "sessions.refresh"],
      ["escape", "document.close"],
    ]))
    expect(document.nodes[1]).toMatchObject({
      kind: "component",
      component: "select",
      props: { source: "$sessions", action: "session.open" },
    })
  })

  test("reports unknown actions with a source position and suggestion", () => {
    const bad = source.replace("session.open", "session.opne")
    expect(() => validateDocument(parseDocument(bad), registry)).toThrow(DocumentDiagnostic)
    expect(() => validateDocument(parseDocument(bad), registry)).toThrow(
      /line 3, column 1[\s\S]*Unknown action:[\s\S]*session\.opne[\s\S]*session\.open/,
    )
  })

  test("rejects unknown properties before rendering", () => {
    const bad = source.replace('action="session.open"', 'grow="1" action="session.open"')
    expect(() => validateDocument(parseDocument(bad), registry)).toThrow(
      /Invalid property "grow" on ::select[\s\S]*visibleRows/,
    )
  })
})

describe("safe bindings", () => {
  test("renders own-property scalar paths as escaped Markdown", () => {
    const document = validateDocument(parseDocument(source), registry)
    const box = document.nodes[2]
    if (box?.kind !== "component") throw new Error("Expected box")
    const markdown = box.children[0]
    if (markdown?.kind !== "markdown") throw new Error("Expected Markdown")
    expect(renderTextTemplate(markdown.template, {
      selected: { title: "Use *literal* [text]", summary: "Ready" },
    })).toContain("Use \\*literal\\* \\[text\\]")
  })

  test("blocks poison keys, inherited values, and functions", () => {
    expect(() => resolveTypedReference("$constructor", {})).toThrow(/Invalid typed reference/)
    const inherited = Object.create({ secret: "nope" }) as Record<string, unknown>
    expect(resolvePath(inherited, "secret")).toBeUndefined()
    expect(() => resolvePath({ action: () => undefined }, "action")).toThrow(/function/)
  })

  test("produces a static receipt without pretending controls remain interactive", () => {
    const document = validateDocument(parseDocument(source), registry)
    const receipt = renderStaticReceipt(document, {
      selected: { title: "GPUX spike", summary: "Validated and mounted." },
    })
    expect(receipt).toContain("Interactive select: session.open")
    expect(receipt).toContain("GPUX spike")
    expect(receipt).not.toContain("sessions.refresh")
  })
})
