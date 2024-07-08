# Localization

For the most part, the results created by the APIs in this package depend either on `HierarchyDefinition` or iModel data, both of which come from package consumers. However, for the few user-facing strings that the library does create, we provide a way to localize them.

The library doesn't enforce any particular localization strategy. Instead, the `createHierarchyProvider` function accepts a `localizedStrings` object that provides the localized strings used by the library, and consumers can choose the most suitable way to localize these strings. If the `localizedStrings` is not provided or provided only partially, the library uses the default English strings.

Example:

<!-- [[include: [Presentation.Hierarchies.Localization.Imports, Presentation.Hierarchies.Localization.PropertyGroupsLocalizationExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async () => [
      // the hierarchy definition returns nodes for `myPhysicalObjectClassName` element type, grouped by `IntProperty` property value,
      // with options to create groups for out-of-range and unspecified values - labels of those grouping nodes get localized
      {
        fullClassName: myPhysicalObjectClassName,
        query: {
          ecsql: `
            SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
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
    ],
  },
  localizedStrings: {
    other: "Kita",
    unspecified: "Nenurodyta",
  },
});

// The iModel has four elements of `myPhysicalObjectClassName` type:
//
// | No. of element | Value of `IntProperty` | Grouping node | Localized grouping node |
// | -------------- | ---------------------- | ------------- | ----------------------- |
// | 1              | 2                      | 1 - 5         | 1 - 5                   |
// | 2              | 4                      | 1 - 5         | 1 - 5                   |
// | 3              | 6                      | Other         | Kita                    |
// | 4              | undefined              | Unspecified   | Nenurodyta              |
//
// As shown in the above table, we expect to get 3 grouping nodes: "1 - 5", "Other", and "Unspecified". The
// latter two strings are localized using the `localizedStrings` object, provided to `createHierarchyProvider`.
const nodes = hierarchyProvider.getNodes({ parentNode: undefined });
```

<!-- END EXTRACTION -->
