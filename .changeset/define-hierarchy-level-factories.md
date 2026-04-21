---
"@itwin/presentation-hierarchies": major
---

`HierarchyDefinition.defineHierarchyLevel` props (`DefineHierarchyLevelProps`) now includes two new properties: `instanceLabelSelectClauseFactory` and `nodeSelectClauseFactory`.

These factories are automatically created and cached per-iModel by `createIModelHierarchyProvider` and passed to `HierarchyDefinition.defineHierarchyLevel` calls. Consumers may use these factories from props instead of creating their own, unless some custom behavior is required - consumers who need custom behavior can ignore the provided factories and create their own inside `defineHierarchyLevel`.

While this change can be considered **breaking** as it adds two new required parameters to `defineHierarchyLevel`, it would only affect anyone calling `defineHierarchyLevel` directly, which is not a common scenario as this method is usually called by the presentation hierarchies framework. For typical consumers who are implementing `HierarchyDefinition` and defining `defineHierarchyLevel`, it should not cause any compile-time errors, as the new parameters are passed as a single object and can be easily ignored by using rest/spread operator.

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
          // use `labelSelectClauseFactory` and `nodeSelectClauseFactory` from the outer scope
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
const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ instanceLabelSelectClauseFactory, nodeSelectClauseFactory }) {
    return [
      {
        fullClassName: "SomeClass",
        query: {
          // use `instanceLabelSelectClauseFactory` and `nodeSelectClauseFactory` from props
          ecsql: `
            SELECT ${await nodeSelectClauseFactory.createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: { selector: await instanceLabelSelectClauseFactory.createSelectClause({ classAlias: "this", className: "SomeClass" }) },
            })}
            FROM SomeClass this
          `,
        },
      },
    ];
  },
};
```
