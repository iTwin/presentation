# @itwin/presentation-hierarchies

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-hierarchies` package provides APIs for creating hierarchical data structures based on data in an [iTwin.js iModel](https://www.itwinjs.org/learning/imodels/#imodel-overview).

The package doesn't depend on any backend, frontend or UI specific packages. As such, it can be used in both backend and frontend applications, and in case of the latter, it can be used with any UI framework. For React-based frontend applications, please see the `@itwin/presentation-hierarchies-react` package.

## Basic concepts

A hierarchy is an arrangement of items, called hierarchy nodes, which are represented as being "above", "below", or "at the same level as" one another:

![Sample hierarchy](./media/sample-hierarchy.png)

Here are definitions of some basic hierarchy-related concepts based on the above example:

- A hierarchy node is an item in the hierarchy, e.g. `Node 0`, `Node 1`, `Node 1-0` etc.
- A hierarchy level is a group of hierarchy nodes that are at the same level in the hierarchy. In the above example the root level contains `Node 0`, `Node 1` and `Node 2`. Child level of `Node 2` contains `Node 2-0`, `Node 2-1`.
- A hierarchy branch is a sub-hierarchy under specific parent node, including the parent itself. In the above example, the branch of `Node 2` contains `Node 2`, `Node 2-0`, `Node 2-1` and `Node 2-1-0`.

In the context of `@itwin/presentation-hierarchies` package, a hierarchy is built by requesting hierarchy levels from a [hierarchy provider](#hierarchy-provider). The provider knows how to create hierarchy levels based on the data in an iModel and a [hierarchy definition](#hierarchy-definition).

### Hierarchy nodes

A `HierarchyNode` interface in the package represents a single node in a hierarchy. It contains information about what the node represents in the iModel (through it's `key` property), label and other properties. There are multiple types of nodes:

- A custom node is not based on any iModel data and is created by the application. Its `key` is a string.
- An instances node is based on one or more ECInstance(s) in the iModel. Its `key` is an `InstancesNodeKey` and contains identifiers of those ECInstances.
- A grouping node groups one or more instances nodes. Its `key` is a `GroupingNodeKey` and contains the grouping criteria, which depends on the type of grouping:
  - Label grouping node keys have a label.
  - Class grouping nodes have a full class name.
  - Property grouping nodes have a full class name containing the property and property name. Also, depending on whether the grouping is based on value or a range of values, that information is also included.

`HierarchyNode` and `HierarchyNodeKey` namespaces contain type guards and utility functions for working with hierarchy nodes and their keys.

A `HierarchyNode` goes through several stages throughout its lifetime:

1. A node starts its life as a `ParsedHierarchyNode` when it's initially parsed from ECSQL query results or returned by a [hierarchy definition](#hierarchy-definition) as a custom node. This variation has no information about its ancestors (position in the hierarchy) and may have unformatted label. Parsed nodes may only be custom or instances nodes.

2. A node becomes a `ProcessedHierarchyNode` as soon as it starts being processed by a [hierarchy provider](#hierarchy-provider). During the processing, provider assigns a formatted label, handles node hiding, grouping, sorting and other operations. A [hierarchy definition](#hierarchy-definition) gets a chance to step into the process as well. In case of grouping, new grouping nodes may be created.

3. Finally, all the processing-related information is cleaned up from `ProcessedHierarchyNode` and it becomes a `HierarchyNode`, which is what consumers get from a [hierarchy provider](#hierarchy-provider).

### Hierarchy definition

A hierarchy definition is what describes the hierarchy by defining what child nodes to return for a given parent node. In this package that is achieved though the `HierarchyDefinition` interface, which has one required method - `defineHierarchyLevel`. The method's responsibility is to create a `HierarchyLevelDefinition` for a given parent node. A `HierarchyLevelDefinition` is actually just a set of `HierarchyNodesDefinition` objects, which either describe a single custom node, or an ECSQL query that returns a number of ECInstance nodes. When `HierarchyLevelDefinition` consists of more than 1 `HierarchyNodesDefinition`, the hierarchy level is combined from multiple sets of nodes.

In case of ECSQL queries for creating the hierarchy level, the definition may want to select some extra information and assign it to the nodes. For that purpose, there's an optional `HierarchyDefinition.parseNode` method, which lets the definition parse the query results handle those extra columns.

Finally, the library also allows hierarchy definitions to step into nodes processing chain through the optional `preProcessNode` and `postProcessNode` methods. These methods are called before and after the node is processed by a [hierarchy provider](#hierarchy-provider) respectively and allow hiding and customizing nodes.

In iTwin.js, the most common way to create hierarchies is based on EC data (schemas, classes, relationships) in iModels. To make consumers' life easier, the package provides an utility called `createClassBasedHierarchyDefinition`, which lets consumers define hierarchy levels based on parent nodes' class.

### Hierarchy provider

`HierarchyProvider` the core concept of the library - it's responsibility is to glue everything together, including evaluating hierarchy definition, running the queries, processing nodes and, finally, returning them to consumers. The package delivers the `createHierarchyProvider` function to create an instance of `HierarchyProvider`.

## Basic usage

Here's a simple example of how to create a hierarchy provider and build a hierarchy of Models and their Elements, with the latter grouped by class:

<!-- [[include: Presentation.Hierarchies.Readme.BasicExample, ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import {
  createClassBasedHierarchyDefinition,
  createHierarchyProvider,
  createLimitingECSqlQueryExecutor,
  createNodesQueryClauseFactory,
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyNode,
  HierarchyProvider,
} from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, createCachingECClassHierarchyInspector, ECSqlBinding } from "@itwin/presentation-shared";

// Not really part of the package, but we need SchemaContext to create a hierarchy provider. It's
// recommended to cache the schema context and reuse it across different application's components to
// avoid loading and storing same schemas multiple times.
const imodelSchemaContextsCache = new Map<string, SchemaContext>();
function getIModelSchemaContext(imodel: IModelConnection) {
  let context = imodelSchemaContextsCache.get(imodel.key);
  if (!context) {
    context = new SchemaContext();
    context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    imodelSchemaContextsCache.set(imodel.key, context);
    imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodel.key));
  }
  return context;
}

function createProvider(imodel: IModelConnection): HierarchyProvider {
  // First, set up access to the iModel
  const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
  const imodelAccess = {
    ...schemaProvider,
    // While caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
    // The second argument is the maximum number of rows the executor will return - this allows us to
    // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };

  // Create a factory for building nodes SELECT query clauses in a format understood by the provider
  const nodesQueryFactory = createNodesQueryClauseFactory({ imodelAccess });
  // Create a factory for building labels SELECT query clauses according to BIS conventions
  const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });

  // Then, define the hierarchy
  const hierarchyDefinition = createClassBasedHierarchyDefinition({
    classHierarchyInspector: imodelAccess,
    hierarchy: {
      // For root nodes, select all BisCore.GeometricModel3d instances
      rootNodes: async () => [
        {
          fullClassName: "BisCore.GeometricModel3d",
          query: {
            ecsql: `
              SELECT
                ${await nodesQueryFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: {
                    selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.GeometricModel3d" }),
                  },
                })}
              FROM BisCore.GeometricModel3d this
            `,
          },
        },
      ],
      childNodes: [
        {
          // For BisCore.Model parent nodes, select all BisCore.Element instances contained in corresponding model
          parentNodeClassName: "BisCore.Model",
          definitions: async ({ parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) => [
            {
              fullClassName: "BisCore.Element",
              query: {
                ecsql: `
                  SELECT
                    ${await nodesQueryFactory.createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: {
                        selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.Element" }),
                      },
                      grouping: {
                        byClass: true,
                      },
                    })}
                  FROM BisCore.Element this
                  WHERE this.Model.Id IN (${parentNodeInstanceIds.map(() => "?").join(",")})
                `,
                bindings: [...parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
              },
            },
          ],
        },
      ],
    },
  });

  // Finally, create the provider
  return createHierarchyProvider({ imodelAccess, hierarchyDefinition });
}

async function main() {
  const provider = createProvider(await getIModelConnection());
  async function loadBranch(parentNode: HierarchyNode | undefined, indent: number = 0) {
    for await (const node of provider.getNodes({ parentNode })) {
      console.log(`${new Array(indent * 2 + 1).join(" ")}${node.label}`);
      await loadBranch(node, indent + 1);
    }
  }
  await loadBranch(undefined);
}
```

<!-- END EXTRACTION -->
