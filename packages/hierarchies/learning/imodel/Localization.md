# Localization

For the most part, the results created by the APIs in this package depend either on `HierarchyDefinition` or iModel data, both of which come from package consumers. However, for the few user-facing strings that the library does create, we provide a way to localize them.

The library doesn't enforce any particular localization strategy. Instead, the `createIModelHierarchyProvider` function accepts a `localizedStrings` object that provides the localized strings used by the library, and consumers can choose the most suitable way to localize these strings. If the `localizedStrings` is not provided or provided only partially, the library uses the default English strings.

Example:

<!-- [[include: [Presentation.Hierarchies.Localization.Imports, Presentation.Hierarchies.Localization.PropertyGroupsLocalizationExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const hierarchyProvider = createIModelHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition returns nodes for `myPhysicalObjectClassName` element type, grouped by `IntProperty` property value,
        // with options to create groups for out-of-range and unspecified values - labels of those grouping nodes get localized
        return [
          {
            fullClassName: myPhysicalObjectClassName,
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({
                  imodelAccess,
                  instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byProperties: {
                      propertiesClassName: myPhysicalObjectClassName,
                      propertyGroups: [
                        {
                          propertyClassAlias: "this",
                          propertyName: "IntProperty",
                          ranges: [{ fromValue: 1, toValue: 5 }],
                        },
                      ],
                      createGroupForOutOfRangeValues: true,
                      createGroupForUnspecifiedValues: true,
                    },
                  },
                })}
                FROM ${myPhysicalObjectClassName} this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
  localizedStrings: {
    other: "Kita",
    unspecified: "Nenurodyta",
  },
});

// The iModel has four elements of `myPhysicalObjectClassName` type:
//
// | Element's label | Value of `IntProperty` | Grouping node | Localized grouping node |
// | --------------- | ---------------------- | ------------- | ----------------------- |
// | Element 1       | 2                      | 1 - 5         | 1 - 5                   |
// | Element 2       | 4                      | 1 - 5         | 1 - 5                   |
// | Element 3       | 6                      | Other         | Kita                    |
// | Element 4       | undefined              | Unspecified   | Nenurodyta              |
//
// As shown in the above table, we expect to get 3 grouping nodes: "1 - 5", "Other", and "Unspecified". The
// latter two strings are localized using the `localizedStrings` object, provided to `createIModelHierarchyProvider`.
expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
  { label: "1 - 5", children: [{ label: "Element 1" }, { label: "Element 2" }] },
  { label: "Kita", children: [{ label: "Element 3" }] },
  { label: "Nenurodyta", children: [{ label: "Element 4" }] },
]);
```

<!-- END EXTRACTION -->
