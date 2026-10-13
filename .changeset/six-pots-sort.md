---
"@itwin/presentation-hierarchies": minor
---

`HierarchySearchTree`: Added support for `DeepReadonly<HierarchySearchPath>` inputs in `createBuilder` and `createFromPathsList`, allowing readonly paths in both array and object forms without casts or copies. `HierarchySearchPath` remains mutable; `HierarchySearchPath.normalize` accepts readonly paths and returns a readonly normalized object.
