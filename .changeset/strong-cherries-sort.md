---
"@itwin/presentation-hierarchies": minor
---

Added hierarchy filtering helper to make hierarchy filtering easier to implement.

The helper can be created using the `createHierarchyFilteringHelper` function and supplying it the root level filtering paths and parent node. From there, filtering information for specific hierarchy level is determined and an object with the following attributes is returned:

- `hasFilter` tells if the hierarchy level has a filter applied.
- `hasFilterTargetAncestor` tells if there's a filter target ancestor node up in the hierarchy.
- `getChildNodeFilteringIdentifiers()` returns an array of hierarchy node identifiers that apply specifically for this hierarchy level.
- `createChildNodeProps()` and `createChildNodePropsAsync()` return attributes that should be applied to nodes in filtered hierarchy levels, after applying the filter.

See the [Implementing hierarchy filtering support](./learning/CustomHierarchyProviders.md#implementing-hierarchy-filtering-support) learning page for a usage example.

In addition, deprecated a few APIs that are replaced by filtering helper:

- `extractFilteringProps` function,
- `HierarchyNodeFilteringProps.create` function.
