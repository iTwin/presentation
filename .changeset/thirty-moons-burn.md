---
"@itwin/presentation-components": minor
---

Expand the `usePresentationTableWithUnifiedSelection()` hook to additionally return:

- an `onSelect()` callback which will update the `unifiedSelection` one level above it (+1) with the keys that are passed to it.
- `selectedRows` which is updated every time `unifiedSelection` changes one level above the table component.
