---
"@itwin/presentation-hierarchies": minor
---

Fix hierarchy search only handling a single (latest) iModel results when searching multi-iModel hierarchies.

Notable API changes:

- Exposed `IModelInstanceKey` type, which extends `InstanceKey` with an optional `imodelKey` prop. This type is used in iModel-based instance nodes and is useful outside of this package, too.
- `NodeParser` (type of `HierarchyDefinition.parseNode` function) now, in addition to ECSQL row and parent node, also gets an imodel key argument.
- Props for `HierarchyDefinition.defineHierarchyLevel` now include an `imodelKey` prop, identifying the iModel for which the hierarchy level is being requested. This change extends into `createPredicateBasedHierarchyDefinition` - it's props for defining root and child nodes also get the new prop.
