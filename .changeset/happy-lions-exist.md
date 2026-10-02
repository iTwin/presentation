---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: Added an optional `excludeHiddenEntries` search flag to omit hidden model entries from paths returned by `createInstanceKeyPaths` and trees returned by `createSearchTree`. Hidden models remain included by default, and existing subject-visibility behavior is unchanged.
