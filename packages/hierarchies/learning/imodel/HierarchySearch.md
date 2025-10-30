# iModel hierarchy search

The library allows creating iModel data-based hierarchies through a hierarchy provider implementation returned by the `createIModelHierarchyProvider` function. In addition to having the required `HierarchyProvider.setHierarchySearch` function to apply the search, it also has a `search` prop that can be used to provide the search paths at construction time.

## Example

For an example, let's say we have an iModel with `BisCore.PhysicalElement` instances related with each other through `BisCore.ElementOwnsChildElements` relationship, forming the following structure:

```txt
+ A
+--+ B
|  +--+ C
|  +--+ D
+--+ E
|  +--+ F
+--+ G
```

The hierarchy definition that creates such a hierarchy would look like this:

<!-- [[include: [Presentation.Hierarchies.HierarchySearch.HierarchyDefinitionImports, Presentation.Hierarchies.HierarchySearch.HierarchyDefinition], ts]] -->
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

### Finding paths to target nodes

As mentioned in the general [Hierarchy search](../HierarchySearch.md#the-process) learning page, the first step to search a hierarchy is to find the paths to the target nodes. This is the responsibility of the consumer, as only consumer knows how the hierarchy is structured and can determine the paths to the target nodes in the most efficient way possible.

Let's consider two cases - searching by label and by target element ID:

- To search by label, we have to know what property(s) the hierarchy definition uses for the label. In this case, it's the `UserLabel` property:

  <!-- [[include: [Presentation.Hierarchies.HierarchySearch.FindPathsImports, Presentation.Hierarchies.HierarchySearch.FindPathsByLabel], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelKey } from "@itwin/presentation-core-interop";
  import { HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
  import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";

  // Define a function that returns `HierarchyNodeIdentifiersPath[]` based on given search string. In this case, we run
  // a query to find matching elements by their `UserLabel` property. Then, we construct paths to the root element using recursive
  // CTE. Finally, we return the paths in reverse order to start from the root element.
  async function createFilteredNodeIdentifierPaths(searchStrings: string[]): Promise<HierarchyNodeIdentifiersPath[]> {
    const query: ECSqlQueryDef = {
      ctes: [
        `MatchingElements(Path, ParentId) AS (
          SELECT
            json_array(${ECSql.createInstanceKeySelector({ alias: "e" })}),
            e.Parent.Id
          FROM BisCore.PhysicalElement e
          WHERE ${searchStrings.map(() => `e.UserLabel LIKE '%' || ? || '%'`).join(" OR ")}
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
      bindings: searchStrings.map((searchString) => ({ type: "string", value: searchString })),
    };
    const result: HierarchyNodeIdentifiersPath[] = [];
    for await (const row of imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" })) {
      result.push((JSON.parse(row.Path) as InstanceKey[]).reverse().map((key) => ({ ...key, imodelKey: createIModelKey(imodel) })));
    }
    return result;
  }
  // Find paths to elements whose label contains "C" or "E"
  const filterPaths = await createFilteredNodeIdentifierPaths(["C", "E"]);
  expect(filterPaths).to.deep.eq([
    // We expect to find two paths A -> B -> C and A -> E
    [elementKeys.a, elementKeys.e],
    [elementKeys.a, elementKeys.b, elementKeys.c],
  ]);
  ```

  <!-- END EXTRACTION -->

- Searching by target element ID is very similar, but instead of using the label, we use the element ID:

  <!-- [[include: [Presentation.Hierarchies.HierarchySearch.FindPathsImports, Presentation.Hierarchies.HierarchySearch.FindPathsByTargetElementId], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelKey } from "@itwin/presentation-core-interop";
  import { HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
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
      result.push((JSON.parse(row.Path) as InstanceKey[]).reverse().map((key) => ({ ...key, imodelKey: createIModelKey(imodel) })));
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
  ```

  <!-- END EXTRACTION -->

The above examples use a recursive CTE to create paths from target element to the root of the hierarchy, but that may not be the most efficient way to do it. In some situations, hierarchy definitions may have some cache that lets it quickly find the path from a node to the root without running a query at all.

### Applying the search paths

The above section shows how paths to target nodes can be created. The next step, as described in the [Hierarchy search](../HierarchySearch.md#the-process) learning page, is to apply the search paths to the hierarchy provider. While that can be achieved using `HierarchyProvider.setHierarchySearch` method, the `createIModelHierarchyProvider` factory function also provides a `search` prop for convenience, to apply the search at construction time. So applying the search paths is straightforward:

<!-- [[include: [Presentation.Hierarchies.HierarchySearch.FilteringImports, Presentation.Hierarchies.HierarchySearch.ApplySearchPaths], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";

// Construct a hierarchy provider for the filtered hierarchy
const hierarchyProvider = createIModelHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: createHierarchyDefinition(imodelAccess),
  search: { paths: filterPaths },
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
