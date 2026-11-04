---
"@itwin/presentation-hierarchies": minor
---

Added `NodesLimitExceededError`, which allows consumers to get hierarchy nodes when a hierarchy level exceeds the size limit.

Hierarchy providers, created using `createIModelHierarchyProvider` or `createMergedIModelHierarchyProvider`, now throw `NodesLimitExceededError` from `getNodes` when the hierarchy level size limit is exceeded. In addition to `limit`, the error contains `nodes` - hierarchy nodes created from the rows that were read before the limit was exceeded, processed the same way as nodes returned by `getNodes`. When a hierarchy level is created from multiple queries, only the query that exceeded the limit contributes to the `nodes` list.

The error extends `RowsLimitExceededError`, so existing checks for `RowsLimitExceededError` keep working. In addition, `RowsLimitExceededError` now contains `rows` - the rows that were read before the limit was exceeded. The executor, created using `createLimitingECSqlQueryExecutor`, includes up to `limit` rows.

`RowsLimitExceededError` got a new constructor overload that takes a `{ limit, rows }` props object. The constructor that only takes `limit` is deprecated - errors created with it have an empty `rows` list.

```ts
try {
  for await (const node of provider.getNodes({ parentNode: undefined, hierarchyLevelSizeLimit: 100 })) {
    // handle node
  }
} catch (e) {
  if (e instanceof NodesLimitExceededError) {
    // up to 100 hierarchy nodes
    const nodes = e.nodes;
  }
}
```
