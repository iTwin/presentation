---
"@itwin/unified-selection": minor
---

Selection events API cleanup:

- Remove the second `StorageSelectionChangesListener` argument, which represented the `SelectionStorage` where the selection change happened. As a replacement, added it as a property to `StorageSelectionChangeEventArgs`, which is the first and now the only argument of the listener.

- Remove `SelectionChangeEvent` interface in favor of `Event<StorageSelectionChangesListener>`.
