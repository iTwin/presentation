---
"@itwin/presentation-hierarchies": minor
---

Fix hierarchy search only handling a single (latest) iModel results when searching multi-iModel hierarchies.

Notable API changes:

- **BREAKING:** `NodeParser` (type of `HierarchyDefinition.parseNode` function) now gets a single props argument instead of multiple arguments. In addition, the props object now also contains an imodel key argument.

  ```ts
  // old:
  function myParser(row: [columnName: string]: any, parentNode?: HierarchyDefinitionParentNode) {
    // implementation...
  }
  // new:
  function myParser(props: { row: [columnName: string]: any; parentNode?: HierarchyDefinitionParentNode; imodelKey: string; }) {
    // implementation...
  }
  ```

- Exposed `IModelInstanceKey` type, which extends `InstanceKey` with an optional `imodelKey` prop. This type is used in iModel-based instance nodes and is useful outside of this package, too.

- Props for `HierarchyDefinition.defineHierarchyLevel` now include an `imodelKey` prop, identifying the iModel for which the hierarchy level is being requested. This change extends into `createPredicateBasedHierarchyDefinition` - it's props for defining root and child nodes also get the new prop.
