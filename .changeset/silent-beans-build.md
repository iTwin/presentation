---
"@itwin/unified-selection": minor
---

Changed `iModel` in attribute names to `imodel`. The change was made to be consistent with other Presentation packages and affects the following APIs:

- `SelectionStorage` methods now accept `imodelKey` prop rather than `iModelKey`. It's `selectionChangeEvent` is also now raised with `imodelKey` prop in `StorageSelectionChangeEventArgs`.

- `CachingHiliteSetProvider.getHiliteSet` now accepts an `imodelKey` prop rather than `iModelKey`.

- `createCachingHiliteSetProvider` props now accept `imodelProvider` callback rather than `iModelProvider`.
