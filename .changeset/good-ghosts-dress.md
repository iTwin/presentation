---
"@itwin/unified-selection": minor
---

Expose `CLEAR_SELECTION_STORAGE_SOURCE` constant that is used as selection change event source when selection storage is cleared. This should allow consumers to detect when selection change happened due to selection storage being cleared.

```ts
import { createStorage, CLEAR_SELECTION_STORAGE_SOURCE } from "@itwin/unified-selection";

const storage = createStorage();
storage.selectionChangeEvent.addListener((args) => {
  if (args.source === CLEAR_SELECTION_STORAGE_SOURCE) {
    // ignore change if it was caused by clearing selection storage
  }
  // handle selection change
})
```
