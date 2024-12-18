# iModel hierarchy level filtering

The concept of hierarchy level filtering is described in the [Hierarchy level filtering](../HierarchyLevelFiltering.md) learning page. This page describes how this is implemented in the iModel-specific hierarchy provider what additional steps are needed for it to work with iModels.

The library creates hierarchies as described by hierarchy definitions and they define hierarchy levels through ECSQL queries. Due to loose structure of the queries and the need to be flexible on how the filter is applied on them, the library does not provide a built-in mechanism for hierarchy level filtering. Instead, it enables consumers to implement filtering through their hierarchy definitions.

## Enable filtering for specific parent nodes

Because hierarchy definitions may not support hierarchy level filtering on all hierarchy levels (and by default they don't support it on any of them), the hierarchy definition has to explicitly tell if node supports it or not.

To make a generic node filterable, the hierarchy definition should set `supportsFiltering` attribute to `true` when returning `GenericHierarchyNodeDefinition`:

<!-- [[include: [Presentation.Hierarchies.HierarchyLevelFiltering.Imports, Presentation.Hierarchies.HierarchyLevelFiltering.GenericHierarchyNodeDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ parentNode }) {
    if (!parentNode) {
      return [
        {
          node: {
            key: "custom node",
            label: "Custom Node",
            supportsFiltering: true,
          },
        },
      ];
    }
    return [];
  },
};
```

<!-- END EXTRACTION -->

To make an instance node filterable, the hierarchy definition should set `supportsFiltering` attribute to `true` on the SELECT clause of the ECSQL, included in returned `InstanceNodesQueryDefinition`:

<!-- [[include: [Presentation.Hierarchies.HierarchyLevelFiltering.Imports, Presentation.Hierarchies.HierarchyLevelFiltering.InstanceNodesQueryDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const queryClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
});
const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ parentNode }) {
    if (!parentNode) {
      return [
        {
          fullClassName: "BisCore.PhysicalElement",
          query: {
            ecsql: `
              SELECT ${await queryClauseFactory.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: "this.UserLabel" },
                supportsFiltering: true, // could also pass a selector to set this conditionally
              })}
              FROM BisCore.PhysicalElement this
              WHERE this.Parent IS NULL
            `,
          },
        },
      ];
    }
    return [];
  },
};
```

<!-- END EXTRACTION -->

The final result is that the produced nodes will have `supportsFiltering` attribute set to `true`.

It's up to the UI component that renders the hierarchy to make such nodes filterable. The sister `@itwin/presentation-hierarchies-react` package delivers a `TreeNodeRenderer` component that renders nodes a filterable, if the consumer supplies an `onFilterClick` callback prop. The rendered UI looks as follows:

|                 |                                                                            |
| --------------- | -------------------------------------------------------------------------- |
| Filterable node | ![Filterable node](../media/hierarchy-level-filtering-filterable-node.png) |
| Filtered node   | ![Filtered node](../media/hierarchy-level-filtering-filtered-node.png)     |

The callback argument allows the filter to be assigned to the node. Upon that node's children request, the filter is passed to `HierarchyProvider.getNodes` call and gets forwarded to the hierarchy definition, whose job is to apply the filter on the `InstanceNodesQueryDefinition` it returns.

## Filtering nodes

As mentioned in the previous section, hierarchy definition gets the applied filter as the `DefineHierarchyLevelProps.instanceFilter` argument to its `defineHierarchyLevel` function. And it's definition's job to apply this filter on the returned `InstanceNodesQueryDefinition`.

While the library can't do that automatically, it does provide a helper function that can be used to apply the filter on the query. The function is available as `NodesQueryClauseFactory.createFilterClauses` retrieved from `createNodesQueryClauseFactory` (which can also be used to create SELECT clauses). The function takes information about the class the nodes represent and the filter, and returns a set of clauses that can be used to apply the filter on the query:

<!-- [[include: [Presentation.Hierarchies.HierarchyLevelFiltering.Imports, Presentation.Hierarchies.HierarchyLevelFiltering.ApplyFilter], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const queryClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
});
const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel(props) {
    // `createFilterClauses` function returns `from`, `joins`, and `where` clauses which need to be used in the
    // query in appropriate places
    const { from, joins, where } = await queryClauseFactory.createFilterClauses({
      // specify the content class whose instances are used to build nodes - this should
      // generally match the instance whose ECClassId and ECInstanceId are used in the SELECT clause
      contentClass: {
        fullName: "BisCore.PhysicalElement",
        alias: "this",
      },
      // specify the filter that we get from props for this hierarchy level
      filter: props.instanceFilter,
    });
    return [
      {
        fullClassName: "BisCore.PhysicalElement",
        query: {
          ecsql: `
            SELECT ${await queryClauseFactory.createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: { selector: "this.UserLabel" },
            })}
            FROM ${from} this
            ${joins}
            ${where ? `WHERE ${where}` : ""}
          `,
        },
      },
    ];
  },
};
```

<!-- END EXTRACTION -->
