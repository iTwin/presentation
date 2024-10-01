---
"@itwin/presentation-hierarchies": minor
---

Added utilities for custom hierarchy filtering handling:

- `extractFilteringProps` function, given root level hierarchy filtering paths and a parent node, returns props required to filter particular hierarchy level.

- `HierarchyFilteringPath` interface is now public and there's also a similarly-named namespace with the following utilities:
  - `mergeOptions` merges filtering options of two paths. This is useful for cases when there are multiple paths targeting the same node, but with different options.
  - `normalize` takes `HierarchyFilteringPath`, which may be either a pure path or an object with a path and options, and returns normalized version of it - an object with `path` and `options` attributes.
