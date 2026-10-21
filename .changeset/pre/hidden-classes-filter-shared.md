---
"@itwin/presentation-shared": major
---

`ECSchemaProvider`: Add a required `getHiddenClassesTree` method, which returns a tree of classes, derived from the given class, whose visibility is changed through `CoreCustomAttributes.HiddenClass` or `CoreCustomAttributes.HiddenSchema` custom attributes. Building the tree requires traversing the whole derived classes' hierarchy, so implementations are expected to cache the result and refresh it when the iModel's schemas change.

Additions:

- `HiddenClassesTreeNode` describes a node of the tree. Root nodes are the outermost hidden derived classes, their children are derived classes that are explicitly shown, and so on. The selected class itself is always considered visible.
- `createHiddenClassesTree` builds the tree using the given schema provider. It doesn't cache the result, and is meant for implementing `ECSchemaProvider.getHiddenClassesTree`.
- `ECSql.createHiddenClassesFilter` creates a filter that excludes instances of classes, derived from the given base class and hidden through the above custom attributes. The tree is requested from the given schema provider once, and the filter's `createWhereClause` creates an ECSQL condition for the given class alias. The condition is an empty string when nothing needs to be excluded.

  ```ts
  const filter = await ECSql.createHiddenClassesFilter({ schemaProvider, baseClassName: "BisCore.GeometricElement3d" });
  const condition = filter.createWhereClause("e");
  const ecsql = `SELECT e.ECInstanceId FROM BisCore.GeometricElement3d e ${condition ? `WHERE ${condition}` : ""}`;
  ```

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
