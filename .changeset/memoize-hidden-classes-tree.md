---
"@itwin/presentation-hierarchies": patch
---

Improved hierarchy load performance by memoizing the hidden-classes tree per selected class, avoiding repeated traversal of large derived-class hierarchies (notably improving the models tree).

The memoization persists for the lifetime of the hierarchy provider's query factories. When iModel schemas may have changed, `createIModelHierarchyProvider` now re-creates its per-iModel factories in response to the `imodelChanged` event.
