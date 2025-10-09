---
"@itwin/unified-selection": patch
---

Fix `enableUnifiedSelectionSyncWithIModel` not updating selection & hilite sets, after selection set is changed directly in a way that doesn't cause a selection storage change.

A specific example:

1. `enableUnifiedSelectionSyncWithIModel` is set up to use `assembly` selection scope.
2. User clicks on an assembly part in the graphics view, causing its parent element (assembly) to be added to selection storage, and selection & hilite sets to be updated with all assembly parts.
3. User clicks on another part of the same assembly, causing selection storage to remain unchanged (still contains the assembly), and selection & hilite sets to NOT be updated with all assembly parts. As a result, the latter sets now contain only the newly clicked part, which is incorrect.
