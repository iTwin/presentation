---
"@itwin/presentation-hierarchies": minor
---

Added `createStreamingIModelHierarchyProvider` for creating a hierarchy provider that streams iModel-based hierarchy levels, loading them in pages.

The provider implements the `HierarchyProvider` interface, but doesn't group, sort or merge nodes - it returns them in hierarchy definition order. Instead of requesting all nodes of a hierarchy level at once, the provider requests them page by page as they're read, so a hierarchy level of any size can be loaded in full. The page size defaults to 1k rows and can be changed through the `pageSize` prop. The iterator returned by `getNodes` has a `getContinuationToken` function that returns a token, identifying the last node it returned. The token can be passed to `getNodes` to continue loading the hierarchy level from the node that follows it. Similarly, the iterator returned by `getNodeInstanceKeys` has a `getContinuationToken` function for continuing to load instance keys:

```ts
using provider = createStreamingIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });

// read the first 100 root nodes
const nodes = [];
const iterator = provider.getNodes({ parentNode: undefined });
for await (const node of iterator) {
  nodes.push(node);
  if (nodes.length === 100) {
    break;
  }
}

// later, continue from the node that follows the last one
for await (const node of provider.getNodes({ parentNode: undefined, continuationToken: iterator.getContinuationToken() })) {
  nodes.push(node);
}
```

`getNodes` fails with the new `InvalidContinuationTokenError` when the given `continuationToken` can't be used - it's malformed, was created for a different iModel, parent node, instance filter or hierarchy search, or was created before an iModel change. It fails with the new `HierarchyRequestInterruptedError` when the hierarchy changes or the provider is disposed before all nodes are loaded.
