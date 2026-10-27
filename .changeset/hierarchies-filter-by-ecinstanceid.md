---
"@itwin/presentation-hierarchies": minor
---

`NodesQueryClauseFactory`: Added support for filtering by `ECInstanceId` in `createFilterClauses`. Previously, `GenericInstanceFilter` rules referencing the `ECInstanceId` system property resulted in no instances being returned.

The rule's `value.rawValue` is expected to be an `Id64String`, for example:

```ts
const nodes = provider.getNodes({
  parentNode: undefined,
  instanceFilter: {
    propertyClassNames: ["BisCore.Element"],
    relatedInstances: [],
    rules: {
      sourceAlias: "this",
      propertyName: "ECInstanceId",
      operator: "is-equal",
      propertyTypeName: "long",
      value: { rawValue: "0x123", displayValue: "0x123" },
    },
  },
});
```

Supported operators are `is-equal`, `is-not-equal`, `less`, `less-or-equal`, `greater`, `greater-or-equal`, `is-null` and `is-not-null`.
