---
"@itwin/presentation-hierarchies": patch
---

**BREAKING:** Added mandatory `instanceLabelSelectClauseFactory` parameter to `createNodesQueryClauseFactory`, this enables grouping by navigation property.

Migration example:

*Before:*

```ts
const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess });
```

*After:*

```ts
const selectQueryFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
});
```
