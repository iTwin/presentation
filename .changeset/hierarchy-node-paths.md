---
"@itwin/presentation-hierarchies": minor
---

Added `createHierarchyNodePaths` function, which loads hierarchy nodes along the given search paths - objects with a `path` of instance keys, like the ones yielded by tree definitions' `createInstanceKeyPaths`. A caller-supplied `createMinimalNode` callback creates a minimal node for every instance key in the paths, and those nodes are used as parent nodes when requesting hierarchy levels from a `HierarchyProvider`. Minimal nodes of nodes that are hidden in the hierarchy must have `processingParams.hideInHierarchy` set, the same as nodes returned by `HierarchyProvider.getNodes`.

For every search path, the function yields a `{ searchPath, nodesPath }` object, where `nodesPath` contains the same nodes that `HierarchyProvider.getNodes` returns when the hierarchy is loaded from the root down to the path's target.
