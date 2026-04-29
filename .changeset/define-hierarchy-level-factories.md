---
"@itwin/presentation-hierarchies": major
---

**Breaking:** `createNodesQueryClauseFactory` and `NodeSelectClauseColumnNames` are no longer part of the public API.

The `NodesQueryClauseFactory` is now created internally by `createIModelHierarchyProvider` and its methods (`createSelectClause`, `createFilterClauses`) are passed directly as props to `HierarchyDefinition.defineHierarchyLevel`.

- Added `instanceLabelSelectClauseFactory` option to `createIModelHierarchyProvider` and `createMergedIModelHierarchyProvider` props, allowing consumers to override the default instance label select clause factory. Defaults to the result of `createIModelInstanceLabelSelectClauseFactory`.

- Added `{ of: ... }` variant to `NodeSelectClauseProps.nodeLabel`, which delegates label select clause creation to the `IInstanceLabelSelectClauseFactory` used by the provided `createSelectClause` function. This replaces the previous pattern of manually calling `instanceLabelSelectClauseFactory.createSelectClause()` and wrapping the result in a selector.

Before:

```ts
const labelSelectClauseFactory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess });
const nodeSelectClauseFactory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory: labelSelectClauseFactory });
const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel() {
    return [
      {
        fullClassName: "SomeClass",
        query: {
          ecsql: `
            SELECT ${await nodeSelectClauseFactory.createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: { selector: await labelSelectClauseFactory.createSelectClause({ classAlias: "this", className: "SomeClass" }) },
            })}
            FROM SomeClass this
          `,
        },
      },
    ];
  },
};
```

After:

```ts
// Note: if a custom `IInstanceLabelSelectClauseFactory` is needed, it should be supplied to `createIModelHierarchyProvider`
// and will be used by the `createSelectClause` function provided to `defineHierarchyLevel`.
const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ createSelectClause }) {
    return [
      {
        fullClassName: "SomeClass",
        query: {
          ecsql: `
            SELECT ${await createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              // Use `{ of: ... }` to delegate label creation to the instance label select clause factory
              nodeLabel: { of: { classAlias: "this", className: "SomeClass" } },
            })}
            FROM SomeClass this
          `,
        },
      },
    ];
  },
};
```
