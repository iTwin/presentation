---
"@itwin/presentation-hierarchies": minor
---

Enhance `HierarchySearchTree.createBuilder()` by allowing it to process resulting hierarchy.

Example:

```ts
const builder = HierarchySearchTree.createBuilder<{ heat?: number }>();
builder.accept({
  subTree,
  handler: {
    onEntryHandled: ({ treeEntry, parentEntries }) => {
      // Assign some extra information to the entry and its ancestors. This will allow us to test
      // that we can use that information in `getTree` method to filter out entries.
      [...parentEntries, treeEntry].forEach((entry) => {
        entry.extras.heat ? entry.extras.heat++ : (entry.extras.heat = 1);
      });
    },
  },
});
const tree = builder.getTree({
  // Only include branches with heat > 5
  processEntry: ({ treeEntry }) => ((treeEntry.extras.heat ?? 0) > 5 ? treeEntry : undefined),
});
```
