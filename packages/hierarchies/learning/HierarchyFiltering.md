# Hierarchy filtering

Hierarchy filtering is a concept where the hierarchy is filtered to a subset that contains only the requested nodes, their ancestors and their children.

For example, let's say we have this hierarchy:

```txt
+ A
+--+ B
|  +--+ C
|  +--+ D
+--+ E
|  +--+ F
+--+ G
```

And these are the node paths we want to filter by:

```txt
A -> B -> C
A -> E
```

The end result would be:

```txt
+ A
+--+ B
|  +--+ C
+--+ E
|  +--+ F
```

## Creating filtered hierarchies

The library implements hierarchy filtering through the `filtering` prop in `createHierarchyProvider` function. The prop basically takes a list of node identifier paths from root to the target node and the provider automatically performs the filtering.

Creating the node identifier paths is responsibility of the consumers - after all, they provide the hierarchy definition, that describes the structure of the hierarchy, so only they have the necessary information to create the paths in the most efficient way possible. In addition, this decouples the filtering logic from the type of filtering being done - the paths could be created based on a variety of ways, such as a filter string or a target instance ID, to name a few.

For example, let's say we have an iModel described at the top of this page, where each node represents a `BisCore.PhysicalElements` and relationships are set up using `BisCore.ElementOwnsChildElements` relationship. The hierarchy definition that creates the hierarchy would look like this:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.HierarchyDefinitionImports, Presentation.Hierarchies.HierarchyFiltering.HierarchyDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, GroupingHierarchyNode, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";
import { ECSqlBinding } from "@itwin/presentation-shared";

function createHierarchyDefinition(imodelAccess: IModelAccess): HierarchyDefinition {
  const queryClauseFactory = createNodesQueryClauseFactory({
    imodelAccess,
    instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
  });
  const createHierarchyLevelDefinition = async ({ whereClause, bindings }: { whereClause?: string; bindings?: ECSqlBinding[] }) => [
    {
      fullClassName: "BisCore.PhysicalElement",
      query: {
        ecsql: `
          SELECT ${await queryClauseFactory.createSelectClause({
            ecClassId: { selector: "this.ECClassId" },
            ecInstanceId: { selector: "this.ECInstanceId" },
            nodeLabel: { selector: "this.UserLabel" },
          })}
          FROM BisCore.PhysicalElement this
          ${whereClause ? `WHERE ${whereClause}` : ""}
        `,
        bindings,
      },
    },
  ];
  return {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        // For root nodes, return root BisCore.PhysicalElement instances
        return createHierarchyLevelDefinition({ whereClause: "this.Parent IS NULL" });
      }
      // We know that parent nodes are instances nodes, so just use a type guard
      assert(HierarchyNode.isInstancesNode(parentNode));
      // For child nodes, return children of the BisCore.PhysicalElement that the parent node is based on
      return createHierarchyLevelDefinition({
        // We know that all nodes are based on one instance, so no need to handle multi-instance keys situation
        whereClause: "this.Parent.Id = ?",
        bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
      });
    },
  };
}
```

<!-- END EXTRACTION -->

The second step would be to create the node identifier paths. Let's consider two cases - filtering by label and by target element ID:

- To filter by label, we have to know what property(s) the hierarchy definition uses for the label. In this case, it's the `UserLabel` property:

  <!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.FilteringImports, Presentation.Hierarchies.HierarchyFiltering.FilterHierarchyByLabel], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createHierarchyProvider, HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
  import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";

  // Define a function that returns `HierarchyNodeIdentifiersPath[]` based on given search string. In this case, we run
  // a query to find matching elements by their `UserLabel` property. Then, we construct paths to the root element using recursive
  // CTE. Finally, we return the paths in reverse order to start from the root element.
  async function createFilteredNodeIdentifierPaths(searchString: string): Promise<HierarchyNodeIdentifiersPath[]> {
    const query: ECSqlQueryDef = {
      ctes: [
        `MatchingElements(Path, ParentId) AS (
          SELECT
            json_array(${ECSql.createInstanceKeySelector({ alias: "e" })}),
            e.Parent.Id
          FROM BisCore.PhysicalElement e
          WHERE e.UserLabel LIKE '%' || ? || '%'
          UNION ALL
          SELECT
            json_insert(
              ce.Path,
              '$[#]', ${ECSql.createInstanceKeySelector({ alias: "pe" })}
            ),
            pe.Parent.Id
          FROM MatchingElements ce
          JOIN BisCore.PhysicalElement pe ON pe.ECInstanceId = ce.ParentId
        )`,
      ],
      ecsql: `SELECT Path FROM MatchingElements WHERE ParentId IS NULL`,
      bindings: [{ type: "string", value: searchString }],
    };
    const result: HierarchyNodeIdentifiersPath[] = [];
    for await (const row of imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" })) {
      result.push((JSON.parse(row.Path) as InstanceKey[]).reverse());
    }
    return result;
  }
  // Find paths to elements whose label contains "F"
  const filterPaths = await createFilteredNodeIdentifierPaths("F");
  expect(filterPaths).to.deep.eq([
    // We expect to find one path A -> E -> F
    [elementKeys.a, elementKeys.e, elementKeys.f],
  ]);

  // Construct a hierarchy provider for the filtered hierarchy
  const hierarchyProvider = createHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: createHierarchyDefinition(imodelAccess),
    filtering: { paths: filterPaths },
  });
  // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "F"
  expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
    {
      label: "A",
      children: [
        {
          label: "E",
          children: [{ label: "F" }],
        },
      ],
    },
  ]);
  ```

  <!-- END EXTRACTION -->

- Filtering by target element ID is very similar, but instead of using the label, we use the element ID:

  <!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.FilteringImports, Presentation.Hierarchies.HierarchyFiltering.FilterHierarchyByTargetElementId], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createHierarchyProvider, HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
  import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";

  // Define a function that returns `HierarchyNodeIdentifiersPath[]` based on given target element IDs. In this case, we run
  // a query to find matching elements by their `ECInstanceId` property. Then, we construct paths to the root element using recursive
  // CTE. Finally, we return the paths in reverse order to start from the root element.
  async function createFilteredNodeIdentifierPaths(targetElementIds: Id64String[]): Promise<HierarchyNodeIdentifiersPath[]> {
    const query: ECSqlQueryDef = {
      ctes: [
        `MatchingElements(Path, ParentId) AS (
          SELECT
            json_array(${ECSql.createInstanceKeySelector({ alias: "e" })}),
            e.Parent.Id
          FROM BisCore.PhysicalElement e
          WHERE e.ECInstanceId IN (${targetElementIds.map(() => "?").join(",")})
          UNION ALL
          SELECT
            json_insert(
              ce.Path,
              '$[#]', ${ECSql.createInstanceKeySelector({ alias: "pe" })}
            ),
            pe.Parent.Id
          FROM MatchingElements ce
          JOIN BisCore.PhysicalElement pe ON pe.ECInstanceId = ce.ParentId
        )`,
      ],
      ecsql: `SELECT Path FROM MatchingElements WHERE ParentId IS NULL`,
      bindings: targetElementIds.map((id) => ({ type: "id", value: id })),
    };
    const result: HierarchyNodeIdentifiersPath[] = [];
    for await (const row of imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" })) {
      result.push((JSON.parse(row.Path) as InstanceKey[]).reverse());
    }
    return result;
  }
  // Find paths to target elements "C" and "E"
  const filterPaths = await createFilteredNodeIdentifierPaths([elementIds.c, elementIds.e]);
  expect(filterPaths).to.deep.eq([
    // We expect to find two paths A -> B -> C and A -> E
    [elementKeys.a, elementKeys.e],
    [elementKeys.a, elementKeys.b, elementKeys.c],
  ]);

  // Construct a hierarchy provider for the filtered hierarchy
  const hierarchyProvider = createHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: createHierarchyDefinition(imodelAccess),
    filtering: { paths: filterPaths },
  });
  // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target elements "C" and "E".
  // Note that "E" has a child "F", even though it's not a filter target. This is because subtrees under filter target nodes
  // (in this case - "E") are returned fully.
  expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
    {
      label: "A",
      children: [
        {
          label: "B",
          children: [{ label: "C" }],
        },
        {
          label: "E",
          children: [{ label: "F" }],
        },
      ],
    },
  ]);
  ```

  <!-- END EXTRACTION -->

The above examples use a recursive CTE to create paths from target element to the root of the hierarchy, but that may not be the most efficient way to do it. In some situations, hierarchy definitions may have some cache that lets it quickly find the path from a node to the root without running a query at all.

## Handling automatic expansion of nodes

Imagine a case where we have this hierarchy:

```txt
+ A
+--+ B
|  +--+ C
|     +--+ (...100 nodes)
+--+ ...
```

Let's say, we want the hierarchy to contain only the nodes with "C" label.
In this case it may be useful to display to the user, where exactly "C" node is located without showing all of its 100 children.

This is possible to do by providing an additional `autoExpand` option to the filter paths.
All nodes in the filtered hierarchy up to "C" will have `autoExpand` flag on, so when rendering the hierarchy, it's clear when to stop loading the child nodes:

```txt
+ A              (auto-expanded)
+--+ B           (auto-expanded)
|  +--+ C        (collapsed)
```

The following code snippet shows, how to use `autoExpand` flag:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.FilteringImports, Presentation.Hierarchies.HierarchyFiltering.AutoExpand], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";

// Construct a hierarchy provider for the filtered hierarchy
const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: createHierarchyDefinition(imodelAccess),
  filtering: {
    paths: [
      {
        // Path to the element "C"
        path: [elementKeys.a, elementKeys.b, elementKeys.c],
        // Supply `autoExpand` flag with the path to the "C" element.
        options: { autoExpand: true },
      },
    ],
  },
});

// Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
// Note that all nodes except C have `autoExpand` flag.
expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
  {
    label: "A",
    autoExpand: true,
    children: [
      {
        label: "B",
        autoExpand: true,
        children: [{ label: "C" }],
      },
    ],
  },
]);
```

<!-- END EXTRACTION -->

Additionally, hierarchies may contain grouping nodes.
Grouping nodes can be displayed to the user as any other nodes, however they do not represent actual instances, so filtering cannot be applied to them.
Nevertheless, it's possible to "target" grouping node in the hierarchy by filtering the hierarchy by node's grouped instance keys.
However in some cases it may be useful to leave this grouping node collapsed in the resulting hierarchy.

For this purpose, there's an option to limit auto-expansion of nodes to a given grouping node that is expected to be in the resulting hierarchy.
In order to do that, there has to be provided a minimal set of information about the grouping node: node's key and depth in the hierarchy, which can be determined from the `parentKeys` attribute.

The following code snippet shows how to limit hierarchy auto-expansion to a given grouping node:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.FilteringImports, Presentation.Hierarchies.HierarchyFiltering.AutoExpandUntilGroupingNode.HierarchyDef, Presentation.Hierarchies.HierarchyFiltering.AutoExpandUntilGroupingNode.Validation], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createHierarchyProvider, HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";

// Define a hierarchy such that all elements except root are grouped by label.
const hierarchyDefinition: HierarchyDefinition = {
  defineHierarchyLevel: async ({ parentNode }) => {
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
              })}
              FROM BisCore.PhysicalElement this
              WHERE this.Parent IS NULL
            `,
          },
        },
      ];
    }

    assert(HierarchyNode.isInstancesNode(parentNode));
    return [
      {
        fullClassName: "BisCore.PhysicalElement",
        query: {
          ecsql: `
            SELECT ${await queryClauseFactory.createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: { selector: "this.UserLabel" },
              grouping: { byLabel: true },
            })}
            FROM BisCore.PhysicalElement this
            WHERE this.Parent.Id = ?
          `,
          bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
        },
      },
    ];
  },
};

// Retrieve the grouping node for "C" from the preexisting hierarchy
const groupingNode = await getSelectedGroupingNode();
expect(HierarchyNode.isLabelGroupingNode(groupingNode)).to.be.true;
expect(groupingNode.groupedInstanceKeys).to.deep.eq([elementKeys.c]);

// Construct a hierarchy provider for the filtered hierarchy
const hierarchyProvider = createHierarchyProvider({
  imodelAccess,
  hierarchyDefinition,
  filtering: {
    paths: [
      {
        // Path to the element "C"
        path: [elementKeys.a, elementKeys.b, elementKeys.c],
        // Supply grouping node attributes with the path to the "C" element.
        options: { autoExpand: { key: groupingNode.key, depth: groupingNode.parentKeys.length } },
      },
    ],
  },
});

// Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
// Note that all nodes before grouping node for label "C" have `autoExpand` flag.
expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
  {
    // Root node. Has auto-expand flag.
    nodeType: "instances",
    label: "A",
    autoExpand: true,
    children: [
      {
        // B grouping node. Has auto-expand flag.
        nodeType: "label-grouping",
        label: "B",
        autoExpand: true,
        children: [
          {
            // B instance node. Has auto-expand flag.
            nodeType: "instances",
            label: "B",
            autoExpand: true,
            children: [
              {
                // C grouping node. Doesn't have auto-expand flag.
                nodeType: "label-grouping",
                label: "C",
                // Child is the filter target
                children: [
                  {
                    nodeType: "instances",
                    label: "C",
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
