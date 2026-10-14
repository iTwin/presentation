---
"@itwin/presentation-hierarchies": major
---

Change `NodePreProcessor` and `NodePostProcessor` function types to take a props object instead of a node.

In addition, the props object now contains the `parentNode` property, which provides access to the parent node of the current node being processed. This allows for more context-aware processing of nodes within the hierarchy.

The change breaks consumers that have `HierarchyDefinition` implementations with `preProcessNode` or `postProcessNode` functions defined. Reacting to the change is straightforward:

```ts
const myHierarchyDefinition: HierarchyDefinition = {
  // Before:
  preProcessNode: async (node) => {
    // process node
  },
  postProcessNode: async (node) => {
    // process node
  },

  // After:
  preProcessNode: async ({ node, parentNode }) => {
    // process node with access to parentNode
  },
  postProcessNode: async ({ node, parentNode }) => {
    // process node with access to parentNode
  },

  // ... the rest of implementation
};
```
