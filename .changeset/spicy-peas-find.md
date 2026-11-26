---
"@itwin/presentation-hierarchies": minor
---

`InstanceNodesQueryDefinition`: Added support for alternative queries. Setting `query` to `{ race: [...] }` runs all given queries in parallel, takes nodes from the one that responds first and cancels the others.

This is useful when different queries perform better on different iModels. All alternatives are expected to return the same nodes.

```ts
const hierarchyDefinition: HierarchyDefinition = {
  defineHierarchyLevel: async () => [
    {
      fullClassName: "BisCore.Element",
      query: { race: [{ ecsql: QUERY_1 }, { ecsql: QUERY_2 }] },
    },
  ],
};
```
