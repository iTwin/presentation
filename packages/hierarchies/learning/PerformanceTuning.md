# Performance tuning

While the ECSQL queries returned by [hierarchy definition](./HierarchyDefinitions.md) have the biggest impact on performance of creating a hierarchy, there are a few customization options that allow to fine-tune it based on consumers' requirements. This page lists those options.

## Hierarchy provider's query concurrency

Hierarchy provider executes queries, given to it by a hierarchy definition, to retrieve nodes' information. Often, to create a single hierarchy level, multiple queries need to be executed. Most commonly, the query executor executes queries somewhere else, other than the thread issuing them - maybe a separate backend process on Electron apps, or a remote backend server on web apps. In such cases, the hierarchy provider can execute multiple queries concurrently to improve the performance of creating the hierarchy. On the other hand, issuing too many queries can overwhelm the process handling them, so the number shouldn't be too large. So depending on the use case, concurrency may need to be adjusted.

The query execution concurrency is controlled through an optional `queryConcurrency` property, passed to `createHierarchyProvider`. When not specified, the default value of `10` is used.

## Hierarchy provider's query cache size

In some cases, same hierarchy level definitions will be reused by hierarchy provider when creating different pieces of the hierarchy. For example, to determine if a node has children, hierarchy provider needs to get child hierarchy level definitions and use them to create the child hierarchy level. Since getting the children generally involves running a possibly expensive ECSQL query, it makes sense to cache the query result for when a user decides to expand that parent node - in that case we don't need to re-run the query to get the children. On the other hand, results of every executed query may put too much pressure on the memory, so the cache size should be limited. So depending on where the hierarchy provider is used, the query cache size may need to be adjusted.

The query cache size is controlled through an optional `queryCacheSize` property, passed to `createHierarchyProvider`. When not specified, the default value of `1` is used, which means that results of only the last query are cached.

## Query executor's row limit

The library relies on the idea that it makes little sense to show users very large flat hierarchy levels, because they don't provide value to end users and are expensive to create. Instead, our suggestion is to have a limit on hierarchy level size, and if the hierarchy level is larger than that, show a message to the user, asking to provide a filter.

The limiting functionality is achieved through the use of `LimitingECSqlQueryExecutor`, which is an input to `createHierarchyProvider` as part of the `imodelAccess` prop. The executor's factory function `createLimitingECSqlQueryExecutor` takes a required `defaultLimit` argument, which sets the limit, and the recommended value would be around `1k` and up to `10k` - we don't recommend using a higher one.

Then creating a query reader through a limiting query executor, it's possible to specify an override to the default limit. This feature is used by the hierarchy provider - its `getNodes` function takes a `hierarchyLevelSizeLimit` optional prop, which sets the override. This provides ability for components, using the hierarchy provider, to increase the limit per hierarchy level upon a user's request.

## Class hierarchy inspector's cache size

The hierarchy provider heavily relies on `ECClassHierarchyInspector` for checking if one ECClass derives from another. In some cases, the checks are done so often, that it could become a performance problem.

For that reason, the `@itwin/presentation-shared` delivers the [`createCachingECClassHierarchyInspector`](https://github.com/iTwin/presentation/blob/master/packages/shared/README.md#ecclasshierarchyinspector--createcachingecclasshierarchyinspector) factory function, which creates an inspector with caching capability. As with all caches, there's a tradeoff of memory consumption VS performance, so the cache size should be limited. The cache size defaults to `0`, but we recommend using at around `100` for most cases.

## Caching iModels' schema contexts

[SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/) and related APIs are outside the scope of this library, but this topic is so important that it's worth mentioning here too.

To create a hierarchy provider, the `createHierarchyProvider` function requires an `imodelAccess` prop, part of which is the `ECSchemaProvider` interface. In majority of cases, the [`createECSchemaProvider`](https://github.com/iTwin/presentation/blob/master/packages/core-interop/README.md#createECSchemaProvider) function will be used to create it from a given `SchemaContext`. The context is responsible for storing (aka caching) all the previously requested schemas, so it's important that only one schema context is used for a single iModel across the whole application, or otherwise the memory consumption will grow and the performance will degrade (pulling schema information from the backend may be expensive).

Sadly, iTwin.js framework doesn't provide a convenient way to retrieve a `SchemaContext` for an `IModelConnection` or `IModelDb`, so it's up to the application to manage it. Our suggested approach looks like this:

<!-- [[include: [Presentation.Hierarchies.PerformanceTuning.Imports, Presentation.Hierarchies.PerformanceTuning.CachingSchemaContexts], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";

const schemaContextsCache = new Map<string, SchemaContext>();
function getSchemaContext(imodel: IModelConnection) {
  const context = schemaContextsCache.get(imodel.key);
  if (context) {
    return context;
  }

  const newContext = new SchemaContext();
  newContext.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  schemaContextsCache.set(imodel.key, newContext);

  imodel.onClose.addListener(() => schemaContextsCache.delete(imodel.key));

  return newContext;
}
```

<!-- END EXTRACTION -->
