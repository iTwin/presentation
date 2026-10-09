---
"@itwin/presentation-shared": major
---

`ECSchemaProvider`: Add a required `getHiddenClassesTree` method, which returns a tree of classes, derived from the given class, whose visibility is changed through `CoreCustomAttributes.HiddenClass` or `CoreCustomAttributes.HiddenSchema` custom attributes. Building the tree requires traversing the whole derived classes' hierarchy, so implementations are expected to cache the result and refresh it when the iModel's schemas change.

Additions:

- `HiddenClassesTreeNode` describes a node of the tree. Root nodes are the outermost hidden derived classes, their children are derived classes that are explicitly shown, and so on. The selected class itself is always considered visible.
- `createHiddenClassesTree` builds the tree using the given schema provider. It doesn't cache the result, and is meant for implementing `ECSchemaProvider.getHiddenClassesTree`.
- `ECSql.createHiddenClassesWhereClause` creates an ECSQL condition, selecting only instances that are visible according to the given tree. Returns an empty string when the tree doesn't restrict anything.

Custom `ECSchemaProvider` implementations need to implement the new method. The one created by `createECSchemaProvider` from `@itwin/presentation-core-interop` already does that. Example of a custom implementation:

```ts
const hiddenClassesTrees = new Map<string, Promise<HiddenClassesTreeNode[]>>();
const schemaProvider: ECSchemaProvider = {
  getSchema: async (schemaName) => getMySchema(schemaName),
  classDerivesFrom: async (derivedClassName, baseClassName) => myClassDerivesFrom(derivedClassName, baseClassName),
  getHiddenClassesTree: async (selectClassName) => {
    let tree = hiddenClassesTrees.get(selectClassName);
    if (!tree) {
      tree = createHiddenClassesTree({ schemaProvider, selectClassName });
      tree.catch(() => hiddenClassesTrees.delete(selectClassName));
      hiddenClassesTrees.set(selectClassName, tree);
    }
    return tree;
  },
};
```
