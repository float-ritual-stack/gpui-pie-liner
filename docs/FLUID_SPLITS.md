# Fluid splits interaction contract

GPUI Pie Liner targets the Replit Splits interaction model, not merely a serializable split tree.

## Core object physics

- A pane owns an ordered tab strip and one active tab.
- A tab in a multi-tab pane moves independently.
- The only tab in a pane acts as the handle for the entire pane.
- Closing a pane's final tab removes the pane; remaining siblings fill the space.
- A drag is interruptible. Releasing without a valid target leaves the layout unchanged.
- User gestures and agent commands reduce through the same canonical layout operations.

## Drop model

Every pane exposes five targets during a drag:

1. Header — merge the dragged tab or pane into the target tab strip.
2. Left — split to the target's left.
3. Right — split to the target's right.
4. Top — split above the target.
5. Bottom — split below the target.

The four body targets are conical sections projected from the pane center rather than small rectangular edge strips. The pointer's angle communicates intent while preserving large hit areas. The active target is always painted before release.

A multi-tab pane uses an 8 px threshold before a tab detaches. A single-tab pane uses a 50 px radius before the whole pane detaches, reducing accidental structural moves.

## Interaction principles

- **Explainable over magical:** always paint drag state and destination geometry.
- **Direct manipulation:** the tab or pane being moved becomes visually ghosted; there is no modal layout editor.
- **Immediate feedback:** dividers resize continuously and drop targets update on every captured pointer move.
- **Low-cost mistakes:** invalid or cancelled drops preserve the original layout. Layout undo/redo is part of the target, not optional polish.
- **Simple default, deep ceiling:** the initial two-pane workspace remains understandable without hiding power-user capability.

## Delivery sequence

### Landed

- serialized nested split layout shared by UI and agents;
- draggable split dividers;
- conical header/side drop targeting;
- tab-to-header merge;
- tab-to-quadrant pane creation;
- whole-pane movement through the final-tab handle;
- final-tab deletion removes its pane;
- explicit drop preview and drag ghosting;
- pointer capture and cancelled-drop preservation.

### Next

- normalize same-axis siblings into a weighted multi-node split model;
- pane `…` menu exposing move, split, merge, maximize, float, and close without requiring drag;
- persisted maximize and floating pane layers;
- layout undo/redo and history receipts;
- file-tree items as the same draggable payload type;
- saved layouts, layout links, copy/paste, and natural-language commands.

The items under **Next** are committed product scope. They are not evidence that the current binary split tree is “close enough.”
