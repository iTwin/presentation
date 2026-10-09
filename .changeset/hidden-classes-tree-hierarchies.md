---
"@itwin/presentation-hierarchies": major
---

`createIModelHierarchyProvider`: The `createFilterClauses` function, passed to hierarchy definitions through `DefineHierarchyLevelProps`, no longer excludes instances of classes, hidden through `CoreCustomAttributes.HiddenClass` or `CoreCustomAttributes.HiddenSchema` custom attributes. It only applies the given instance filter, and returns the content class with empty `joins` and `where` clauses when there's no filter.

Hierarchy definitions that need to exclude instances of hidden classes have to do that explicitly, using `ECSql.createHiddenClassesFilter` from `@itwin/presentation-shared`. Use the content class as the filter's base class, even when the instance filter specializes the `from` class, and exclude the same instances in custom `hasChildren` selectors. Example:

```ts
const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ imodelAccess, instanceFilter, createSelectClause, createFilterClauses }) {
    const [filterClauses, hiddenClassesFilter] = await Promise.all([
      createFilterClauses({ filter: instanceFilter, contentClass: { fullName: "BisCore.PhysicalElement", alias: "this" } }),
      ECSql.createHiddenClassesFilter({ schemaProvider: imodelAccess, baseClassName: "BisCore.PhysicalElement" }),
    ]);
    const conditions = [filterClauses.where, hiddenClassesFilter.createWhereClause("this")].filter((condition) => !!condition);
    return [
      {
        fullClassName: "BisCore.PhysicalElement",
        query: {
          ecsql: `
            SELECT ${await createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: { selector: "this.UserLabel" },
            })}
            FROM ${filterClauses.from} this
            ${filterClauses.joins}
            ${conditions.length ? `WHERE ${conditions.map((condition) => `(${condition})`).join(" AND ")}` : ""}
          `,
        },
      },
    ];
  },
};
```
