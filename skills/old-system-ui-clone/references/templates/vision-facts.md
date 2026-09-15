# Vision Facts — <state-id>

## Source

| Field | Value |
|---|---|
| sourceType | screenshot-only |
| screenshot | source/screenshots/<state-id>.png |
| viewport | unknown / estimated |
| confidence | high / medium / low |

## Visible Layout

| Region | Visible facts | Confidence |
|---|---|---|
| app-shell |  |  |
| toolbar |  |  |
| content |  |  |
| table/form |  |  |

## Visible Text

| Type | Text | Notes |
|---|---|---|
| title |  | visible |
| button |  | visible |
| tableColumn |  | visible |
| formLabel |  | visible |

## Estimated Visual Tokens

| Token | Value | Evidence |
|---|---|---|
| rowHeight |  | estimated-from-screenshot |
| tableGrid |  | estimated-from-screenshot |
| surfaceBg |  | estimated-from-screenshot |
| borderRadius |  | estimated-from-screenshot |

## Unknowns

| Gap | Why it matters | Needed evidence |
|---|---|---|
| hidden table columns | 无法确认完整列数 | 横向滚动截图或 DOM |
| dropdown options | 无法还原 open 态 | open-state 截图或 CDP |
| button behavior | 截图无法证明交互 | 录屏、说明或 live page |
