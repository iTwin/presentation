- - -

## "@itwin/presentation-hierarchies": minor

Rename full‑hierarchy "filtering" to "search" across the package; keep hierarchy‑level "filtering".
Properties and APIs were renamed accordingly to clarify the distinction and avoid confusion between hierarchy‑wide search and per‑level filtering.

Notable API changes:

* `createHierarchyFilteringHelper` => `createHierarchySearchHelper`
* type & namespace `HierarchyNodeFilteringProps` => `HierarchyNodeSearchProps`
* type & namespace `HierarchyFilteringPath` => `HierarchySearchPath`
* `HierarchyFilteringPathOptions`=> `HierarchySearchPathOptions`
* `HierarchyProvider` property `setHierarchyFilter` renamed to `setHierarchySearch`
* `IModelHierarchyProviderProps` property `filtering` renamed to `search`
* `NonGroupingHierarchyNode` property `filtering` renamed to `search`
* `FilteringPathRevealDepthInHierarchy` => `SearchPathRevealDepthInHierarchy`
* `FilteringPathRevealDepthInPath` => `SearchPathRevealDepthInPath`
* Removed `extractFilteringProps`
