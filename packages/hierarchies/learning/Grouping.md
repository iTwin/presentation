# Grouping

Sometimes it's important in hierarchies to group nodes based on some common criteria. The library supports grouping by label, class and property values and a combination of these groupings, resulting in a hierarchy of grouping nodes.

## Grouping by label

It's encouraged to always set up the hierarchy in such a way that node labels are unique. However, in some cases, it's not possible to ensure this. For such situations, the library provides a way to group nodes with the same label - either by placing them under a common grouping node, or by merging them together into a single node.

### Grouping

When using the `grouping` action, the library will create a new grouping node for each unique label and place all nodes with that label under it. The grouping node will have the same label as the nodes it groups:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.LabelGroupingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.PhysicalElement` nodes to be return as
        // root nodes and have them grouped by label
        return [
          {
            fullClassName: "BisCore.PhysicalElement",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byLabel: true,
                    // alternatively, could use this:
                    // byLabel: {
                    //   action: "group",
                    //   // could specify extra options here
                    // },
                  },
                })}
                FROM BisCore.PhysicalElement this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has two elements of `BisCore.PhysicalElement` class, both with the same "Example element" label.
// As requested by hierarchy definition, the provider returns them grouped under a label grouping node:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // the label grouping node
    label: "Example element",
    children: [
      // the two grouped `BisCore.PhysicalElement` instance nodes
      { label: "Example element" },
      { label: "Example element" },
    ],
  },
]);
```

<!-- END EXTRACTION -->

### Merging

When using the `merging` action, the library merges all nodes with the same label into a single node. The node has the same label as the nodes it merges. In addition, its `key.instanceKeys` list contains instance keys of all nodes that were merged:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.LabelMergingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.PhysicalElement` nodes to be returned as root
        // nodes and have them merged based on label
        return [
          {
            fullClassName: "BisCore.PhysicalElement",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byLabel: {
                      action: "merge",
                    },
                  },
                })}
                FROM BisCore.PhysicalElement this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has two elements of `BisCore.PhysicalElement` class, both with the same "Example element" label.
// As requested by hierarchy definition, the provider returns them merged into a single node:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // the merged node has "Example element" label and instance keys of both elements in `key.instanceKeys` list
    label: "Example element",
  },
]);
```

<!-- END EXTRACTION -->

## Grouping by class

The library provides two ways for grouping nodes by class. The most commonly used way is to group nodes by their specific class. The other, less common way, is to group nodes by one or more of their base classes.

### Grouping by node's class

When grouping by node's class, the library creates a new grouping node for each unique class and places all nodes of that class under it.

Example:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.ClassGroupingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.Category` nodes to be returned as root nodes and have
        // them grouped by class.
        return [
          {
            fullClassName: "BisCore.Category",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.CodeValue" },
                  grouping: {
                    byClass: true,
                    // alternatively, could use this:
                    // byClass: {
                    //   // could specify extra options here
                    // },
                  },
                })}
                FROM BisCore.Category this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has two elements of `BisCore.Category` class - one `SpatialCategory` and one `DrawingCategory`.
// As requested by hierarchy definition, the provider returns them grouped under class grouping nodes:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // the `BisCore.DrawingCategory` class grouping node
    label: "Drawing Category",
    children: [
      // the `BisCore.DrawingCategory` instance node
      { label: "Example drawing category" },
    ],
  },
  {
    // the `BisCore.SpatialCategory` class grouping node
    label: "Spatial Category",
    children: [
      // the `BisCore.SpatialCategory` instance node
      { label: "Example spatial category" },
    ],
  },
]);
```

<!-- END EXTRACTION -->

### Grouping by base classes

To group nodes by base classes, hierarchy definition has to specify the classes to group by. When the node's class derives from one of the specified base classes, the node is placed under the base class grouping node. No grouping nodes are created if none of them are base for the created nodes. Additionally, when the classes derive from each other, a multi-level grouping is created - from the most base class to the most derived one.

Example:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.BaseClassGroupingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.Category` nodes to be grouped by the following classes:
        // - `BisCore.Element`
        // - `BisCore.DefinitionElement`
        return [
          {
            fullClassName: "BisCore.Category",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.CodeValue" },
                  grouping: {
                    byBaseClasses: {
                      // The order of base classes is not important - the provider orders them from the most
                      // base one to the most derived one
                      fullClassNames: ["BisCore.Element", "BisCore.DefinitionElement"],
                      // could specify extra options here
                    },
                  },
                })}
                FROM BisCore.Category this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has two elements of `BisCore.Category` class - one `SpatialCategory` and one `DrawingCategory`.
// As requested by hierarchy definition, the provider returns them grouped under 2 class grouping nodes:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // the `BisCore.Element` class grouping node
    label: "Element",
    children: [
      {
        // the `BisCore.DefinitionElement` class grouping node
        label: "Definition Element",
        children: [
          // the `BisCore.Category` instance nodes
          { label: "Example drawing category" },
          { label: "Example spatial category" },
        ],
      },
    ],
  },
]);
```

<!-- END EXTRACTION -->

## Grouping by property values

The library allows grouping nodes by properties of the instances they represent. The grouping is done by the formatted property value - either exact or by a range (only for numeric and date/time ones). In addition, it's possible to specify multiple properties to group by, in which case a hierarchy of groupings is created, starting with the first property as the first grouping level.

### Grouping by formatted value

When grouping by value, as opposed by a range of values, the value is first formatted using hierarchy provider's formatter. This makes sure that the grouping node's label is properly formatted and all instances with only slightly different values, that result in the same formatted string, are grouped together.

By default, when an instance doesn't have a value for the property, it's not grouped at all and is displayed as a sibling to other grouping nodes. This behavior can be changed by setting the `createGroupForUnspecifiedValues` option to `true`. In this case, all such instances are placed under a special "Not specified" grouping node.

Example:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.PropertyValueGroupingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
        // them grouped by the `Format` property.
        return [
          {
            fullClassName: "BisCore.RepositoryLink",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byProperties: {
                      propertiesClassName: "BisCore.RepositoryLink",
                      propertyGroups: [
                        {
                          propertyClassAlias: "this",
                          propertyName: "Format",
                        },
                      ],
                      // create a grouping node for instances whose `Format` property value is not specified
                      createGroupForUnspecifiedValues: true,
                    },
                  },
                })}
                FROM BisCore.RepositoryLink this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has four elements of `BisCore.RepositoryLink` class:
//
// | Element's label             | `Format` property value |
// | --------------------------- | ----------------------- |
// | Example iModel link 1       | iModel                  |
// | Example iModel link 2       | iModel                  |
// | Example DGN link            | DGN                     |
// | Example link with no format |                         |
//
// As requested by hierarchy definition, the provider returns them grouped by `Format` property value:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // the `Format="DGN"` property grouping node
    label: "DGN",
    children: [
      // the grouped repository link with Format="DGN"
      { label: "Example DGN link" },
    ],
  },
  {
    // the `Format="iModel"` property grouping node
    label: "iModel",
    children: [
      // the grouped repository links with Format="iModel"
      { label: "Example iModel link 1" },
      { label: "Example iModel link 2" },
    ],
  },
  {
    // the property grouping node for instances that don't have `Format` property value specified
    label: "Not specified",
    children: [{ label: "Example link with no format" }],
  },
]);
```

<!-- END EXTRACTION -->

### Grouping by value ranges

Range grouping is great for numeric and date/time properties. It allows grouping instances based on the range of values they have for the property. The range is defined by the `fromValue` and `toValue` properties of the grouping specification. The library will create a grouping node for each range and place all instances with values in that range under it.

Each range may be assigned a label. If the label is not provided, the library will use the range's `fromValue` and `toValue` as the label in the format of `fromValue - toValue`.

By default, when there are instances with property values that don't fit into any of the given ranges, they are not grouped at all and are displayed as siblings to other grouping nodes. This behavior can be changed by setting the `createGroupForOutOfRangeValues` option to `true`. In this case, all such instances are placed under a special "Other" grouping node.

Example:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.PropertyValueRangesGroupingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.PhysicalMaterial` nodes to be returned as root nodes and have
        // them grouped by the `Density` property value in given ranges.
        return [
          {
            fullClassName: "BisCore.PhysicalMaterial",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byProperties: {
                      propertiesClassName: "BisCore.PhysicalMaterial",
                      propertyGroups: [
                        {
                          propertyClassAlias: "this",
                          propertyName: "Density",
                          ranges: [
                            { fromValue: 0, toValue: 10, rangeLabel: "Low density" },
                            // when `rangeLabel` is not specified, it's created in the format of `fromValue - toValue`
                            { fromValue: 10, toValue: 100 },
                          ],
                        },
                      ],
                      // create a grouping node for instances whose `Density` doesn't fall into any of the given ranges
                      createGroupForOutOfRangeValues: true,
                    },
                  },
                })}
                FROM BisCore.PhysicalMaterial this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has five elements of `BisCore.PhysicalMaterial` class:
//
// | Element's label | Density value |
// |-----------------|---------------|
// | Material 1      | 4             |
// | Material 2      | 7             |
// | Material 3      | 11            |
// | Material 4      | 200           |
//
// As requested by hierarchy definition, the provider returns them grouped by the `Density` property value:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // the `10 - 100` range property grouping node
    label: "10 - 100",
    children: [{ label: "Material 3" }],
  },
  {
    // the `Low density` range property grouping node
    label: "Low density",
    children: [{ label: "Material 1" }, { label: "Material 2" }],
  },
  {
    // the property grouping node for instances that don't fall into any of the given ranges
    label: "Other",
    children: [{ label: "Material 4" }],
  },
]);
```

<!-- END EXTRACTION -->

## Grouping by a combination of label, class and property values

Using a combination of the grouping types described above is also possible. The library will create a hierarchy of grouping nodes, starting with the base class grouping, followed by class grouping, property value grouping and, finally, label grouping:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.MultiLevelGroupingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
        // them grouped by the `Format` property.
        return [
          {
            fullClassName: "BisCore.RepositoryLink",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    // create two levels of class grouping
                    byBaseClasses: {
                      fullClassNames: ["BisCore.Element", "BisCore.UrlLink"],
                    },
                    // create a level for specific element's class
                    byClass: true,
                    // create a level of Format property value grouping
                    byProperties: {
                      propertiesClassName: "BisCore.RepositoryLink",
                      propertyGroups: [
                        {
                          propertyClassAlias: "this",
                          propertyName: "Format",
                        },
                      ],
                    },
                    // create a level of label grouping
                    byLabel: true,
                  },
                })}
                FROM BisCore.RepositoryLink this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has four elements of `BisCore.RepositoryLink` class:
//
// | Element's label       | `Format` property value |
// | --------------------- | ----------------------- |
// | Example iModel link   | iModel                  |
// | Example iModel link   | iModel                  |
// | Example DGN link 1    | DGN                     |
// | Example DGN link 2    | DGN                     |
//
// As requested by hierarchy definition, the provider returns them grouped under a hierarchy of grouping nodes:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  // a class grouping node for `BisCore.Element` base class
  {
    label: "Element",
    children: [
      // a class grouping node for `BisCore.UrlLink` base class
      {
        label: "URL Link",
        children: [
          // a class grouping node for `BisCore.RepositoryLink` class
          {
            label: "Repository Link",
            children: [
              // the `Format="DGN"` property grouping node
              {
                label: "DGN",
                children: [
                  // label grouping node for the first DGN link
                  {
                    label: "Example DGN link 1",
                    children: [
                      // the grouped repository link
                      { label: "Example DGN link 1" },
                    ],
                  },
                  // label grouping node for the second DGN link
                  {
                    label: "Example DGN link 2",
                    children: [
                      // the grouped repository link
                      { label: "Example DGN link 2" },
                    ],
                  },
                ],
              },
              // the `Format="iModel"` property grouping node
              {
                label: "iModel",
                children: [
                  // the label grouping node
                  {
                    label: "Example iModel link",
                    children: [
                      // the two grouped repository links
                      { label: "Example iModel link" },
                      { label: "Example iModel link" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
```

<!-- END EXTRACTION -->

## Customization options

All types of groupings have a few common customization options for when/how the grouping nodes are created or surface to the user:

- [`hideIfOneGroupedNode`](#avoid-grouping-if-theres-only-one-grouped-node)
- [`hideIfNoSiblings`](#avoid-grouping-if-therere-no-siblings)
- [`autoExpand`](#auto-expand-grouping-node)

### Avoid grouping if there's only one grouped node

In certain scenarios the purpose of grouping nodes is make hierarchy levels smaller and easier for users to handle, rather than carry some important information. In such cases, it makes sense to hide the grouping node if there's only one node under it. This can be achieved by setting the `hideIfOneGroupedNode` option to `true`:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.HideIfOneGroupedNodeExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
        // them grouped by label only if there's more than one instance with the same label.
        return [
          {
            fullClassName: "BisCore.RepositoryLink",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byLabel: {
                      action: "group",
                      hideIfOneGroupedNode: true,
                    },
                  },
                })}
                FROM BisCore.RepositoryLink this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has three elements of `BisCore.RepositoryLink` class:
//
// | Element's label |
// | --------------- |
// | Example link 1  |
// | Example link 2  |
// | Example link 2  |
//
// As requested by hierarchy definition, the provider didn't place "Example link 1" under a grouping node:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  { label: "Example link 1" },
  {
    label: "Example link 2",
    children: [{ label: "Example link 2" }, { label: "Example link 2" }],
  },
]);
```

<!-- END EXTRACTION -->

### Avoid grouping if there're no siblings

Similar to above, if the purpose of grouping to is to make hierarchy level smaller, creating a grouping node if it has no siblings may have little value. This can be avoided by setting the `hideIfNoSiblings` option to `true`:

<!-- [[include: [Presentation.Hierarchies.Grouping.Imports, Presentation.Hierarchies.Grouping.HideIfNoSiblingsExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";

const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
        // them grouped by class only if the grouping node has siblings.
        return [
          {
            fullClassName: "BisCore.RepositoryLink",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: "this.UserLabel" },
                  grouping: {
                    byClass: {
                      hideIfNoSiblings: true,
                    },
                  },
                })}
                FROM BisCore.RepositoryLink this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// The iModel has two elements of `BisCore.RepositoryLink` class:
//
// | Element's label |
// | --------------- |
// | Example link 1  |
// | Example link 2  |
//
// As requested by hierarchy definition, the provider didn't place them under a grouping node, because
// there're no sibling nodes:
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  // note: no class grouping node
  { label: "Example link 1" },
  { label: "Example link 2" },
]);
```

<!-- END EXTRACTION -->

### Auto-expand grouping node

In certain scenarios it may be required to automatically expand the grouping node as soon as the user loads it. This can be achieved by setting the `autoExpand` option to either `always` or `single-child`:

<!-- [[include: [Presentation.Hierarchies.Grouping.AutoExpandExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
`
  SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
    ecClassId: { selector: "this.ECClassId" },
    ecInstanceId: { selector: "this.ECInstanceId" },
    nodeLabel: { selector: "this.UserLabel" },
    grouping: {
      byClass: {
        // could also set to "single-child" to only auto-expand if there's only one grouped node
        autoExpand: "always",
      },
    },
  })}
  FROM BisCore.RepositoryLink this
`,
```

<!-- END EXTRACTION -->
