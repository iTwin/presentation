---
"@itwin/unified-selection": patch
---

Fix `enableUnifiedSelectionSyncWithIModel` not properly syncing `SelectionSet` and `SelectionStorage` with 4.x `itwinjs-core`.

When the selection change was made by a tool in graphics view (through the `SelectionSet`), the `SelectionStorage` was updated correctly, but the `IModelConnection.hiliteSet` - wasn't. As a result, clearing selection through graphics view wouldn't clear the hilite set and keep the elements hilited.
