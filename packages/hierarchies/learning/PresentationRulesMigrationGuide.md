# Migration guide from Presentation Rules

This package replaces the part of the [Presentation Rules](https://www.itwinjs.org/presentation/) system that is intended for building hierarchies. The Presentation Rules are a convenient way to define a hierarchy in a declarative way, but the system has a number of limitations:

- Internal hierarchy cache hosted by the backend service makes the library less scalable.
- The declarative nature of the rules makes any custom logic or query optimizations hard to implement and often requires library changes.
- The library attempts to handle hierarchies of any size, which makes it very complex, but doesn't completely solve the large hierarchies' performance issues.

The new package is designed to address these limitations. It's completely stateless and doesn't require any caching on the backend - this makes the library more scalable. The code runs in the same process as consumer's code, which allows for more flexibility and customizations. Finally, the library at its core is designed with the idea that the size of hierarchy levels should not be limitless - this simplifies it, makes it more performant, and we believe - provides more value for end users through additional filtering capabilities.

The purpose of this document is to help consumers, who used to build hierarchies using Presentation Rules system, migrate to the new library.

## Basic concept differences

The way hierarchies are defined and created in the two libraries are actually very similar from consumer's point of view. Both libraries require an iModel to query the data from and _something_ that defines the hierarchy. In case of Presentation Rules system, that _something_ is a Presentation Ruleset, while in this library it's a `HierarchyDefinition` object.

Finally, the APIs used to create hierarchies are also slightly different:

- In the Presentation Rules system, consumers can use `PresentationManager` to request individual hierarchy levels. Generally, the `PresentationManager` is accessed through the globally initialized `Presentation.presentation` accessor:

  ```ts
  // The Presentation system has to first be statically initialized by calling `Presentation.initialize`
  for await (const node of Presentation.presentation.getNodesIterator({ imodel, rulesetOrId: ruleset, parentKey: undefined })) {
    // do something with the node
  }
  ```

- In this library consumers first have to create an instance of `HierarchyProvider` and then use it to create individual hierarchy levels:

  <!-- [[include: [Presentation.Hierarchies.Migration.HierarchyProviderImports, Presentation.Hierarchies.Migration.HierarchyProviderUsage], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";

  const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
  for await (const node of provider.getNodes({ parentNode: undefined })) {
    // do something with the node
  }
  ```

  <!-- END EXTRACTION -->

## Migrating hierarchy rules

The Presentation Rules system has 2 types of rules for defining hierarchy:

- [RootNodeRule](https://www.itwinjs.org/presentation/hierarchies/rootnoderule/) is used for creating root level nodes.
- [ChildNodeRule](https://www.itwinjs.org/presentation/hierarchies/childnoderule/) is used for creating child level nodes. It generally uses the `ParentNode` ECExpression symbol available in `condition` attribute to select which parent node to create children for.

Most commonly, child node rules are only checking parent instance node's class or custom node's type in their condition - if that's the case across the whole Presentation Ruleset, the recommended approach to define root and child nodes using this library is using the `createPredicateBasedHierarchyDefinition` function:

Example ruleset:

```json
{
  "id": "Example",
  "rules": [
    {
      "ruleType": "RootNodes",
      "specifications": [
        /* define root node specifications here */
      ]
    },
    {
      "ruleType": "ChildNodes",
      "condition": "ParentNode.Type = \"MyCustomParentNode\"",
      "specifications": [
        /* specifications for "MyCustomParentNode" parent node's children go here */
      ]
    },
    {
      "ruleType": "ChildNodes",
      "condition": "ParentNode.IsOfClass(\"BisCore\", \"Model\")",
      "specifications": [
        /* specifications for `BisCore.Model` parent node's children go here */
      ]
    }
  ]
}
```

Matching hierarchy definition, created using `createPredicateBasedHierarchyDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.PredicateBasedHierarchyDefinitionImports, Presentation.Hierarchies.Migration.PredicateBasedHierarchyDefinitionUsage], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createPredicateBasedHierarchyDefinition } from "@itwin/presentation-hierarchies";

const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
  classHierarchyInspector: imodelAccess,
  hierarchy: {
    rootNodes: async () => [
      /* define root node specifications here */
    ],
    childNodes: [
      {
        parentGenericNodePredicate: async (parentKey) => parentKey.id === "MyCustomParentNodeKey",
        definitions: async () => [
          /* definitions for "MyCustomParentNode" parent node's children go here */
        ],
      },
      {
        parentInstancesNodePredicate: async () => true,
        definitions: async () => [
          /* definitions for all instances' parent nodes children go here */
        ],
      },
      {
        parentInstancesNodePredicate: "BisCore.Model",
        definitions: async () => [
          /* definitions for `BisCore.Model` parent node's children go here */
        ],
      },
    ],
  },
});
```

<!-- END EXTRACTION -->

Or, for full control over how child nodes are created, a hierarchy definition may be created manually:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodeImport, Presentation.Hierarchies.Migration.ManualHierarchyDefinitionImports, Presentation.Hierarchies.Migration.ManuallyCreatingHierarchyDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchyNode } from "@itwin/presentation-hierarchies";

import { HierarchyDefinition } from "@itwin/presentation-hierarchies";

const hierarchyDefinition: HierarchyDefinition = {
  defineHierarchyLevel: async ({ parentNode }) => {
    if (!parentNode) {
      return [
        /* define root node specifications here */
      ];
    }
    if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "MyCustomParentNodeKey") {
      return [
        /* definitions for "MyCustomParentNode" parent node's children go here */
      ];
    }
    if (HierarchyNode.isInstancesNode(parentNode)) {
      // depending on whether the hierarchy definition requests node merging, an instances node may have one or more
      // instance keys; here, for simplicity, let's assume all nodes only have one instance key
      if (await imodelAccess.classDerivesFrom(parentNode.key.instanceKeys[0].className, "BisCore.Model")) {
        return [
          /* definitions for `BisCore.Model` parent node's children go here */
        ];
      }
    }
    return [];
  },
};
```

<!-- END EXTRACTION -->

See the [hierarchy definitions learning page](./HierarchyDefinitions.md) for more information on how to create hierarchy definitions.

## Migrating hierarchy specifications

Each hierarchy rule contains a `specifications` attribute, which defines how / what nodes to create for the hierarchy level. A matching concept of that in this library is the `HierarchyLevelDefinition` type, which is simply a list of `HierarchyNodesDefinition` objects, that define either a custom node or a query for creating instance-based nodes.

The Presentation Rules system has 4 types of specifications for building hierarchies: [Custom node specification](https://www.itwinjs.org/presentation/hierarchies/customnode/), [Instance nodes of specific classes specification](https://www.itwinjs.org/presentation/hierarchies/instancenodesofspecificclasses/), [Related instance nodes specification](https://www.itwinjs.org/presentation/hierarchies/relatedinstancenodes/) and [Custom query instance nodes specification](https://www.itwinjs.org/presentation/hierarchies/customqueryinstancenodes/). Below are examples of how to migrate each of them to the new library.

### Migrating custom node specification

The purpose of a custom node specification in Presentation Rules is ask the library to return a node that doesn't depend on any data in the iModel. So you define various attributes in the specification and the library maps them to the custom node. The new library makes this more flexible by simply allowing you to return the node itself, without any intermediate data structure.

Example of a custom node specification in Presentation Rules:

```json
{
  "specType": "CustomNode",
  "type": "MyCustomNode",
  "label": "My custom node",
  "description": "This is a custom node"
}
```

Matching `HierarchyNodesDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.CustomNodeDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const definition: HierarchyNodesDefinition = {
  node: {
    key: { type: "generic", id: "MyCustomNode" },
    label: "My custom node",
    extendedData: {
      description: "This is a custom node",
    },
  },
};
```

<!-- END EXTRACTION -->

### Migrating instance nodes of specific classes specification

The purpose of an instance nodes of specific classes specification in Presentation Rules is to ask the library to query specific ECClass instances, possibly with some additional filters, and map the results to instance nodes. With this library consumers are required to specify an ECSQL query, which may look more complex at first, but provides more flexibility and control over the query.

Example of an instance nodes of specific classes specification in Presentation Rules:

```json
{
  "specType": "InstanceNodesOfSpecificClasses",
  "classes": { "schemaName": "BisCore", "classNames": ["GeometricModel"] },
  "excludeClasses": { "schemaName": "BisCore", "classNames": ["GeometricModel2d"] },
  "relatedInstances": [
    {
      "relationshipPath": [
        {
          "relationship": { "schemaName": "BisCore", "className": "ModelModelsElement" },
          "direction": "Forward",
          "targetClass": { "schemaName": "BisCore", "className": "InformationPartitionElement" }
        }
      ],
      "alias": "partition",
      "isRequired": true
    }
  ],
  "instanceFilter": "this.IsPrivate = false",
  "groupByClass": true,
  "groupByLabel": true,
  "hasChildren": "Always"
}
```

Matching `HierarchyNodesDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.InstanceNodesOfSpecificClassesDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const definition: HierarchyNodesDefinition = {
  fullClassName: "BisCore.GeometricModel",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricModel", classAlias: "this" }) },
        hasChildren: true,
        grouping: {
          byClass: true,
          byLabel: {
            action: "group",
            hideIfNoSiblings: true,
            hideIfOneGroupedNode: true,
          },
        },
      })}
      FROM BisCore.GeometricModel [this]
      INNER JOIN BisCore.InformationPartitionElement [partition] ON [partition].[ECInstanceId] = [this].[ModeledElement].[Id]
      WHERE NOT [this].[IsPrivate] AND [this].[ECClassId] IS NOT (BisCore.GeometricModel2d)
    `,
  },
};
```

<!-- END EXTRACTION -->

### Migrating related instance nodes specification

The purpose of a related instance nodes specification in Presentation Rules is to ask the library to query instances that are related to the parent instance node through some ECRelationship, possibly with some additional filters, and map the results to instance nodes. With this library consumers are required to specify an ECSQL query, which provides more flexibility and control over the query - for example, the children don't necessarily need to use an ECRelationship to find relevant instances.

Example of a related instance nodes specification in Presentation Rules:

```json
{
  "specType": "RelatedInstanceNodes",
  "relationshipPaths": [
    {
      "relationship": { "schemaName": "BisCore", "className": "ModelContainsElements" },
      "direction": "Forward",
      "targetClass": { "schemaName": "BisCore", "className": "GeometricElement3d" }
    }
  ],
  "relatedInstances": [
    {
      "relationshipPath": [
        {
          "relationship": { "schemaName": "BisCore", "className": "GeometricElement3dIsInCategory" },
          "direction": "Forward"
        }
      ],
      "alias": "category",
      "isRequired": true
    }
  ],
  "instanceFilter": "this.TypeDefinition != NULL AND NOT category.IsPrivate",
  "groupByClass": false,
  "groupByLabel": false
}
```

Matching `HierarchyNodesDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodeImport, Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.RelatedInstanceNodesDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchyNode } from "@itwin/presentation-hierarchies";

import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const createDefinition = async ({ parentNode }: { parentNode: HierarchyNode & { key: InstancesNodeKey } }): Promise<HierarchyNodesDefinition> => ({
  fullClassName: "BisCore.GeometricElement3d",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricElement3d", classAlias: "this" }) },
      })}
      FROM BisCore.GeometricElement3d [this]
      INNER JOIN BisCore.SpatialCategory [category] ON [category].[ECInstanceId] = [this].[Category].[Id]
      WHERE
        [this].[Model].[Id] IN (${parentNode.key.instanceKeys.map(() => "?").join(",")})
        AND [this].[TypeDefinition] IS NOT NULL
        AND NOT [category].[IsPrivate]
    `,
    bindings: parentNode.key.instanceKeys.map((key) => ({ type: "id", value: key.id })),
  },
});
```

<!-- END EXTRACTION -->

### Migrating custom query instance nodes specification

The purpose of a custom query instance nodes specification in Presentation Rules is to ask the library to query instances using the given ECSQL query. This is the primary way to define instance nodes in this library, so the migration is straightforward. The specification has two ways to define the query

- By defining the ECSQL string directly in the specification - this is very similar to how it's done in this library - you just return an ECSQL query as part of the hierarchy definition. See [Migrating instance nodes of specific classes specification](#migrating-instance-nodes-of-specific-classes-specification) and other sections for an example.

- By defining name of parent instance node's property, whose value is the ECSQL that should be used to query children. While it's not recommended to store ECSQL queries in the iModel, it's still possible to achieve the same behavior:

  ```json
  [
    {
      "ruleType": "RootNodes",
      "specifications": [
        {
          "specType": "InstanceNodesOfSpecificClasses",
          "classes": { "schemaName": "MyDomain", "classNames": ["MyParentElement"] },
          "groupByClass": false,
          "groupByLabel": false
        }
      ]
    },
    {
      "ruleType": "ChildNodes",
      "condition": "ParentNode.IsOfClass(\"MyParentElement\", \"MyDomain\")",
      "specifications": [
        {
          "specType": "CustomQueryInstanceNodes",
          "queries": [
            {
              "specType": "ECPropertyValue",
              "class": { "schemaName": "MyDomain", "className": "MyChildElement" },
              "parentPropertyName": "ChildrenQuery"
            }
          ],
          "groupByClass": false,
          "groupByLabel": false
        }
      ]
    }
  ]
  ```

  Matching `HierarchyDefinition`:

  <!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodeImport, Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.CustomQueryInstanceNodesDefinition], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { HierarchyNode } from "@itwin/presentation-hierarchies";

  import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
  import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

  const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
  const selectClauseFactory = createNodesQueryClauseFactory({
    imodelAccess,
    instanceLabelSelectClauseFactory: labelsFactory,
  });
  const createDefinition = async ({ parentNode }: { parentNode: HierarchyNode & { key: InstancesNodeKey } }): Promise<HierarchyLevelDefinition> => {
    if (await imodelAccess.classDerivesFrom(parentNode.key.instanceKeys[0].className, `${schema.schemaName}.MyParentElement`)) {
      // load the query from the MyParentElement instance
      async function loadChildrenQuery() {
        for await (const row of imodelAccess.createQueryReader({
          ecsql: `SELECT ChildrenQuery FROM ${schema.schemaName}.MyParentElement WHERE ECInstanceId = ?`,
          bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
        })) {
          return row.ChildrenQuery as string;
        }
        return undefined;
      }
      const childrenQuery = await loadChildrenQuery();
      // if the parent instance has the query - return a definition for the children, otherwise - return an empty definitions list
      return childrenQuery
        ? [
            {
              fullClassName: `${schema.schemaName}.MyChildElement`,
              query: {
                ecsql: `
                  SELECT ${await selectClauseFactory.createSelectClause({
                    ecClassId: { selector: "this.ECClassId" },
                    ecInstanceId: { selector: "this.ECInstanceId" },
                    nodeLabel: {
                      selector: await labelsFactory.createSelectClause({ className: `${schema.schemaName}.MyChildElement`, classAlias: "this" }),
                    },
                  })}
                  FROM ${schema.schemaName}.MyChildElement this
                  WHERE this.ECInstanceId IN (
                    SELECT ECInstanceId FROM (${childrenQuery})
                  )
                `,
              },
            },
          ]
        : [];
    }
    return [];
  };
  ```

  <!-- END EXTRACTION -->

## Migrating grouping specifications

The Presentation Rules system provides a [Grouping rule](https://www.itwinjs.org/presentation/hierarchies/groupingrule/) to implement advanced grouping in addition to [groupByClass](https://www.itwinjs.org/presentation/hierarchies/instancenodesofspecificclasses/#attribute-groupbyclass) and [groupByLabel](https://www.itwinjs.org/presentation/hierarchies/instancenodesofspecificclasses/#attribute-groupbylabel) attributes on hierarchy specifications. Depending on the grouping type, the behavior of when and how the grouping nodes are created is different - for example, label grouping nodes are only created when they group more than one child node.

This library puts all grouping specifications in one place an unifies grouping configuration. The order in which groupings are applied stays the same as with Presentation Rules - base class grouping goes first, then class, property and label groupings respectively.

### Migrating base class grouping

With base class grouping you can specify classes whose instances should be grouped under the grouping nodes. In case multiple classes are specified and they derive one from another - a hierarchy of class groupings is created.

Example of base class grouping specifications in Presentation Rules:

```json
[
  {
    "ruleType": "RootNodes",
    "specifications": [
      {
        "specType": "InstanceNodesOfSpecificClasses",
        "classes": { "schemaName": "BisCore", "classNames": ["GeometricElement"], "arePolymorphic": true },
        "groupByClass": false,
        "groupByLabel": false
      }
    ],
    "customizationRules": [
      {
        "ruleType": "Grouping",
        "class": { "schemaName": "BisCore", "className": "GeometricElement" },
        "groups": [
          {
            "specType": "Class",
            "baseClass": { "schemaName": "BisCore", "className": "GeometricElement3d" }
          }
        ]
      },
      {
        "ruleType": "Grouping",
        "class": { "schemaName": "BisCore", "className": "GeometricElement" },
        "groups": [
          {
            "specType": "Class",
            "baseClass": { "schemaName": "BisCore", "className": "PhysicalElement" }
          }
        ]
      }
    ]
  }
]
```

Matching `HierarchyDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.BaseClassGrouping], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const definition: HierarchyNodesDefinition = {
  fullClassName: "BisCore.GeometricElement",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricElement", classAlias: "this" }) },
        grouping: {
          byBaseClasses: {
            fullClassNames: ["BisCore.GeometricElement3d", "BisCore.PhysicalElement"],
          },
        },
      })}
      FROM BisCore.GeometricElement [this]
    `,
  },
};
```

<!-- END EXTRACTION -->

### Migrating class grouping

Class grouping option simply puts instance nodes under class grouping nodes of their class. In Presentation Rules this grouping is set at hierarchy specification level:

```json
{
  "specType": "InstanceNodesOfSpecificClasses",
  "classes": { "schemaName": "BisCore", "classNames": ["Element"], "arePolymorphic": true },
  "groupByClass": true
}
```

Matching `HierarchyDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.ClassGrouping], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const definition: HierarchyNodesDefinition = {
  fullClassName: "BisCore.Element",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.Element", classAlias: "this" }) },
        grouping: {
          byClass: true,
        },
      })}
      FROM BisCore.Element [this]
    `,
  },
};
```

<!-- END EXTRACTION -->

### Migrating property grouping

Property grouping allows grouping by a property of the instance by value or by given ranges of values. In case multiple property groups are specified - a hierarchy of property groupings is created.

Example of property grouping specifications in Presentation Rules:

```json
[
  {
    "ruleType": "RootNodes",
    "specifications": [
      {
        "specType": "InstanceNodesOfSpecificClasses",
        "classes": { "schemaName": "BisCore", "classNames": ["GeometricElement3d"], "arePolymorphic": true }
      }
    ],
    "customizationRules": [
      {
        "ruleType": "Grouping",
        "class": { "schemaName": "BisCore", "className": "GeometricElement3d" },
        "groups": [
          {
            "specType": "Property",
            "propertyName": "Yaw",
            "ranges": [
              {
                "fromValue": "0",
                "toValue": "0",
                "label": "Zero"
              },
              {
                "fromValue": "-360",
                "toValue": "0",
                "label": "Negative"
              },
              {
                "fromValue": "0",
                "toValue": "360",
                "label": "Positive"
              }
            ]
          }
        ]
      }
    ]
  }
]
```

Matching `HierarchyDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.PropertyGrouping], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const definition: HierarchyNodesDefinition = {
  fullClassName: "BisCore.GeometricElement3d",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricElement3d", classAlias: "this" }) },
        grouping: {
          byProperties: {
            propertiesClassName: "BisCore.GeometricElement3d",
            createGroupForOutOfRangeValues: true,
            createGroupForUnspecifiedValues: true,
            propertyGroups: [
              {
                propertyClassAlias: "this",
                propertyName: "Yaw",
                ranges: [
                  { fromValue: 0, toValue: 0, rangeLabel: "Zero" },
                  { fromValue: -360, toValue: 0, rangeLabel: "Negative" },
                  { fromValue: 0, toValue: 360, rangeLabel: "Positive" },
                ],
              },
            ],
          },
        },
      })}
      FROM BisCore.GeometricElement3d [this]
    `,
  },
};
```

<!-- END EXTRACTION -->

### Migrating label grouping

Label grouping option, simply puts instance nodes under label grouping nodes based on node's label. In Presentation Rules this grouping is set at hierarchy specification level, similar to [class grouping](#migrating-class-grouping):

```json
{
  "specType": "InstanceNodesOfSpecificClasses",
  "classes": { "schemaName": "BisCore", "classNames": ["Element"], "arePolymorphic": true },
  "groupByLabel": true
}
```

Matching `HierarchyDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.LabelGrouping], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const definition: HierarchyNodesDefinition = {
  fullClassName: "BisCore.Element",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.Element", classAlias: "this" }) },
        grouping: {
          byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true },
        },
      })}
      FROM BisCore.Element [this]
    `,
  },
};
```

<!-- END EXTRACTION -->

### Migrating same label grouping

Same label grouping is different from other types of groupings, because it doesn't result in a grouping node being created. Instead, nodes with the same label get merged into a single instance node, which represents a merged set of instances. In the Presentation Rules system there are two options to choose from - grouping at query stage or at post-processing stage. The first one is more performant while the second one is more flexible.

In this library, same label grouping is much simpler to apply and doesn't require making hard decisions about when to apply it.

Example of same label grouping specifications in Presentation Rules:

```json
[
  {
    "ruleType": "RootNodes",
    "specifications": [
      {
        "specType": "InstanceNodesOfSpecificClasses",
        "classes": {
          "schemaName": "BisCore",
          "classNames": ["InformationPartitionElement", "Model"],
          "arePolymorphic": true
        }
      }
    ],
    "customizationRules": [
      {
        "ruleType": "Grouping",
        "class": { "schemaName": "BisCore", "className": "InformationPartitionElement" },
        "groups": [
          {
            "specType": "SameLabelInstance",
            "applicationStage": "PostProcess"
          }
        ]
      },
      {
        "ruleType": "Grouping",
        "class": { "schemaName": "BisCore", "className": "Model" },
        "groups": [
          {
            "specType": "SameLabelInstance",
            "applicationStage": "PostProcess"
          }
        ]
      }
    ]
  }
]
```

Matching `HierarchyDefinition`:

<!-- [[include: [Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports, Presentation.Hierarchies.Migration.SameLabelGrouping], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
const selectClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: labelsFactory,
});
const definition: HierarchyNodesDefinition = {
  fullClassName: "BisCore.Element",
  query: {
    ecsql: `
      SELECT ${await selectClauseFactory.createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.Element", classAlias: "this" }) },
        grouping: {
          byLabel: { action: "merge" },
        },
      })}
      FROM BisCore.Element [this]
    `,
  },
};
```

<!-- END EXTRACTION -->
