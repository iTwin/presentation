# iModel hierarchy provider

The iModel-based hierarchy provider, created using the `createIModelHierarchyProvider` function, fulfills the most common use case, where hierarchies are built based on an iModel data.

The provider requires two things to achieve its goal - access to an iModel and a hierarchy definition:

- Access to an iModel is provided through a prop called `imodelAccess`, allows accessing iModel's metadata and executing queries against it. See [iModel access](#imodel-access) section for more information.
- A hierarchy definition describes the hierarchy structure and how to fetch each hierarchy level for a given parent node. See [hierarchy definition](./HierarchyDefinition.md) learning page for more information.

With the above two pieces, provider's responsibility is to glue everything together, including evaluating hierarchy definition, running the queries, processing nodes and, finally, returning them to consumers.

## iModel access

The `createIModelHierarchyProvider` factory function takes an `imodelAccess` prop whose type combines several interfaces, required to access iModel's metadata and run queries against it. While the type might look complex, the value is actually fairly straightforward to create:

<!-- [[include: [Presentation.Hierarchies.IModelAccessImports, Presentation.Hierarchies.IModelAccess], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector, Props } from "@itwin/presentation-shared";

// Not really part of the package, but we need SchemaContext to create a hierarchy provider. It's
// recommended to cache the schema context and reuse it across different application's components to
// avoid loading and storing same schemas multiple times.
const imodelSchemaContextsCache = new Map<string, SchemaContext>();
function getIModelSchemaContext(imodel: IModelConnection) {
  const imodelKey = createIModelKey(imodel);
  let context = imodelSchemaContextsCache.get(imodelKey);
  if (!context) {
    context = new SchemaContext();
    context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    imodelSchemaContextsCache.set(imodelKey, context);
    imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodelKey));
  }
  return context;
}

function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
  return {
    // The key of the iModel we're accessing
    imodelKey: createIModelKey(imodel),
    // Schema provider provides access to EC information (metadata)
    ...schemaProvider,
    // While caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
    // The second argument is the maximum number of rows the executor will return - this allows us to
    // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };
}
```

<!-- END EXTRACTION -->

## Hierarchy processing

Below are the steps the provider takes to process a hierarchy from the moment they're requested by calling its `getNodes` function to the moment they're returned:

1. The hierarchy definition's `defineHierarchyLevel` function is called to get the hierarchy level definitions.

2. Hierarchy level definitions are turned into `SourceHierarchyNode` objects. This variation of node has no information about its ancestors (position in the hierarchy) and may have unformatted label. Source nodes may only be generic or instances nodes.

   2.1. In case the hierarchy level definition is a `GenericHierarchyNodeDefinition`, it's simply mapped to the generic node.

   2.2. In case the hierarchy level definition is an `InstanceNodesQueryDefinition`, the nodes are fetched from the iModel and parsed either by definition's `parseNode` function, or the default parser.

3. Nodes are passed through the labels formatter.

4. Nodes are passed through the hierarchy definition's `preProcessNode` function, if one is defined.

5. Nodes are passed through the hiding processor that hides based on their `hideIfNoChildren` and `hideInHierarchy` processing flags. This step may require loading children for some nodes, e.g. to find out if they have children or get the children to replace the processed node.

6. Nodes are passed through the grouping processor.

7. If nodes' children flag is undefined, it is determined by loading the children.

8. Nodes are passed through the hierarchy definition's `postProcessNode` function, if one is defined.

9. Nodes are sorted by label.

10. Nodes are cleaned up by removing the temporary properties added during processing.
