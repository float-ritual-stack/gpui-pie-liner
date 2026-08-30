import { C, FONT } from "../theme"

export interface DetailSession {
  id: string
  title: string
  summary: string
  rawText?: string
  workId?: string
  updatedAt: string
}

export interface DetailEditorState {
  mode: "preview" | "edit"
  draft: string
  baseUpdatedAt: string
  saving: boolean
  error: string | null
}

export function initialDetailEditorState(session: DetailSession): DetailEditorState {
  return {
    mode: "preview",
    draft: session.rawText ?? "",
    baseUpdatedAt: session.updatedAt,
    saving: false,
    error: null,
  }
}

export function Detail({
  session,
  editor,
  onEditorChange,
  onOpenDocument,
  onSave,
}: {
  session: DetailSession
  editor: DetailEditorState
  onEditorChange(update: (editor: DetailEditorState) => DetailEditorState): void
  onOpenDocument: () => void
  onSave(session: DetailSession, text: string, expectedUpdatedAt: string): Promise<void>
}) {
  const patch = (next: Partial<DetailEditorState>) => onEditorChange((current) => ({ ...current, ...next }))
  const beginEdit = () => patch({
    mode: "edit",
    draft: session.rawText ?? "",
    baseUpdatedAt: session.updatedAt,
    saving: false,
    error: null,
  })
  const save = async () => {
    if (editor.saving) return
    const savedDraft = editor.draft
    patch({ saving: true, error: null })
    try {
      await onSave(session, savedDraft, editor.baseUpdatedAt)
      onEditorChange((current) => current.draft === savedDraft
        ? { ...current, mode: "preview", saving: false, error: null }
        : { ...current, saving: false, error: null })
    } catch (cause) {
      patch({ saving: false, error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          minHeight: 52,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 18,
          paddingRight: 14,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <text style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}>{editor.mode === "edit" ? "Editing" : "Detail"}</text>
          <text style={{ color: C.tertiary, fontFamily: FONT, fontSize: 10 }}>{session.id}</text>
        </div>
        {editor.error ? <text style={{ color: C.danger, fontFamily: FONT, fontSize: 10 }}>{editor.error}</text> : null}
        {editor.mode === "preview" ? (
          <div testId="edit-block" onClick={beginEdit} style={{ padding: 9, borderRadius: 7, cursor: "pointer", hover: { backgroundColor: C.overlay } }}>
            <text style={{ color: C.secondary, fontFamily: FONT, fontSize: 12 }}>Edit</text>
          </div>
        ) : (
          <>
            <div testId="cancel-edit" onClick={() => patch({ mode: "preview", error: null })} style={{ padding: 9, borderRadius: 7, cursor: "pointer", hover: { backgroundColor: C.overlay } }}>
              <text style={{ color: C.secondary, fontFamily: FONT, fontSize: 12 }}>Cancel · Esc</text>
            </div>
            <div testId="save-block" onClick={() => void save()} style={{ padding: 9, paddingLeft: 12, paddingRight: 12, borderRadius: 7, backgroundColor: C.accent, cursor: "pointer" }}>
              <text style={{ color: "#171717", fontFamily: FONT, fontSize: 12 }}>{editor.saving ? "Saving…" : "Save · ⌘S"}</text>
            </div>
          </>
        )}
        <div testId="open-tmd" onClick={onOpenDocument} style={{ padding: 9, borderRadius: 7, cursor: "pointer", hover: { backgroundColor: C.overlay } }}>
          <text style={{ color: C.secondary, fontFamily: FONT, fontSize: 12 }}>Open .tmd</text>
        </div>
      </div>
      {editor.mode === "edit" ? (
        <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 18 }}>
          <textarea
            testId="detail-editor"
            autoFocus
            value={editor.draft}
            minRows={12}
            maxRows={1000}
            onChange={(event) => patch({ draft: event.value ?? "" })}
            onKeyDown={(event) => {
              if (event.key === "escape") patch({ mode: "preview", error: null })
              else if (event.key === "s" && (event.modifiers?.cmd || event.modifiers?.ctrl)) void save()
            }}
            style={{ flexGrow: 1, minHeight: 0, padding: 14, borderRadius: 9, borderWidth: 1, borderColor: editor.error ? C.danger : C.border, backgroundColor: C.panel, color: C.text, fontFamily: "Menlo", fontSize: 13 }}
            theme={{ caret: C.accent }}
          />
        </div>
      ) : (
        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "scroll", padding: 24 }}>
          <markdown
            source={session.rawText ?? `# ${session.title}\n\n${session.summary}`}
            style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}
          />
        </div>
      )}
    </div>
  )
}
