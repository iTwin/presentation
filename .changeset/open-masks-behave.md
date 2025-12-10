---
"@itwin/presentation-hierarchies": minor
---

Rename full‑hierarchy "filtering" to "search" across the package.

Properties and APIs were renamed accordingly to clarify the distinction and avoid confusion between hierarchy‑wide search and per-hierarchy‑level filtering.

**Breaking changes:**

- Removed deprecated `extractFilteringProps`.
- Removed deprecated `HierarchyNodeFilteringProps.create`.
- Renamed `createHierarchyFilteringHelper` to `createHierarchySearchHelper`. It's return type was also adjusted for the rename:
  - `hasFilter` renamed to `hasSearch`,
  - `hasFilterTargetAncestor` renamed to `hasSearchTargetAncestor`, 
  - `getChildNodeFilteringIdentifiers` renamed to `getChildNodeSearchIdentifiers`.
- Renamed `HierarchyChangedEventArgs.filterChange` to `searchChange`.
- Renamed `HierarchyProvider.setHierarchyFilter` to `setHierarchySearch`.
- Renamed `createMergedIModelHierarchyProvider` prop `filtering` to `search.
- Renamed `HierarchyFilteringPath` to `HierarchySearchPath`.
- Renamed `HierarchyFilteringPathOptions` to `HierarchySearchPathOptions`.
- Renamed `NonGroupingHierarchyNode.filtering` to `search`. It's type was also adjusted for the rename:
  - `hasFilterTargetAncestor` renamed to `hasSearchTargetAncestor`,
  - `filteredChildrenIdentifierPaths` renamed to `childrenTargetPaths`,
  - `isFilterTarget` renamed to `isSearchTarget`,
  - `filterTargetOptions` renamed to `searchTargetOptions`.
