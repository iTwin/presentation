---
"@itwin/unified-selection": minor
---

Export `SelectionScope` type to make it easier for consumers to define "active scope" type.

APIs that use this type:

- The `scope` prop of `computeSelection` function.
- Return type of `activeScopeProvider` callback prop of `enableUnifiedSelectionSyncWithIModel` function.
