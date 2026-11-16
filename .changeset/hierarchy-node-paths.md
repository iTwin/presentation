---
"@itwin/presentation-hierarchies": minor
---

Added `createHierarchyNodePaths` function, which loads hierarchy nodes along the given search paths - objects with a `path` of instance keys, like the ones yielded by tree definitions' `createInstanceKeyPaths`.

The hierarchy definition, passed through `hierarchyProviderProps`, receives a `path` of instance keys from the root to the parent node instead of a parent node - `HierarchyDefinition<{ path: DeepReadonly<IModelInstanceKey[]> }>`. The definition should apply the `instanceFilter` it receives. Nodes that are hidden in the hierarchy have to be included in the search paths - they're included in the resulting node paths with the `isHidden` flag. Generic nodes can't have children.

The function resolves with a `{ searchPath, nodesPath }` object for every search path, where `nodesPath` contains the same nodes that `HierarchyProvider.getNodes` returns when the hierarchy is loaded from the root down to the path's target, plus the hidden nodes. Search paths whose target isn't found or is hidden are omitted.
